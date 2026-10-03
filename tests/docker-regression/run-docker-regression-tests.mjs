import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import * as Blockly from 'blockly';
import ts from 'typescript';
import { parse } from 'yaml';

const projectRoot = path.resolve('.');
const tempBlocksPath = path.join(
  projectRoot,
  'tests/docker-regression/.temp-blocks.mjs'
);
const tempGeneratorPath = path.join(
  projectRoot,
  'tests/docker-regression/.temp-generator.mjs'
);
const tempDockerYamlPath = path.join(
  projectRoot,
  'tests/docker-regression/.temp-docker-yaml.mjs'
);

async function loadTypescriptModule(sourcePath, tempPath) {
  const source = await readFile(sourcePath, 'utf8');
  let sourceForTranspile = source;

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext
    }
  });

  if (outputText.includes("from './docker-yaml';")) {
    const dockerYamlSource = await readFile(
      path.join(projectRoot, 'blockly_app/src/docker-yaml.ts'),
      'utf8'
    );
    const transpiledDockerYaml = ts.transpileModule(dockerYamlSource, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext
      }
    });

    await writeFile(tempDockerYamlPath, transpiledDockerYaml.outputText);
    sourceForTranspile = outputText.replace(
      "from './docker-yaml';",
      "from './.temp-docker-yaml.mjs';"
    );
  } else {
    sourceForTranspile = outputText;
  }

  await writeFile(tempPath, sourceForTranspile);

  return import(
    pathToFileURL(tempPath).href + '?cache=' + Date.now()
  );
}

async function loadDockerValidationCollector() {
  const source = await readFile(
    path.join(projectRoot, 'blockly_app/src/docker-validation.ts'),
    'utf8'
  );
  const script = source
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const { outputText } = ts.transpileModule(script, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None
    }
  });

  return new Function(
    outputText + '\nreturn collectDockerValidationErrors;'
  )();
}

console.log('\nDocker Regression Tests\n');

try {
  const { defineBlocks } = await loadTypescriptModule(
    path.join(projectRoot, 'blockly_app/src/blocks.ts'),
    tempBlocksPath
  );

  const { generator } = await loadTypescriptModule(
    path.join(projectRoot, 'blockly_app/src/generator.ts'),
    tempGeneratorPath
  );

  defineBlocks();

  console.log('Testing valid Docker blocks -> YAML...');

  const workspace = new Blockly.Workspace();

  const composeBlock = workspace.newBlock('compose');
  const serviceBlock = workspace.newBlock('service');

  serviceBlock.setFieldValue('frontend', 'NAME');
  serviceBlock.setFieldValue('nginx', 'IMAGE');

  const servicesConnection =
    composeBlock.getInput('SERVICES')?.connection;

  assert.ok(
    servicesConnection,
    'Compose block should expose a SERVICES connection'
  );

  assert.ok(
    serviceBlock.previousConnection,
    'Service block should expose a previous connection'
  );

  servicesConnection.connect(serviceBlock.previousConnection);

  const actualYaml = generator.workspaceToCode(workspace);

  const expectedYaml =
    'services:\n' +
    '  frontend:\n' +
    '    image: nginx\n';

  assert.equal(
    actualYaml,
    expectedYaml,
    'Valid Docker blocks should generate the expected YAML'
  );

  workspace.dispose();

  console.log('[PASS] Valid Docker blocks generate expected YAML');

  console.log('Testing invalid Docker blocks -> validation -> Blockly feedback...');

  const invalidWorkspace = new Blockly.Workspace();
  const invalidServiceBlock = invalidWorkspace.newBlock('service');

  invalidServiceBlock.setFieldValue('frontend', 'NAME');
  invalidServiceBlock.setFieldValue('', 'IMAGE');

  assert.equal(
    String(invalidServiceBlock.getFieldValue('IMAGE') ?? '').trim(),
    '',
    'Regression fixture should contain a service with neither image nor build'
  );

  const mainSource = await readFile(
    path.join(projectRoot, 'blockly_app/src/main.ts'),
    'utf8'
  );
  const dockerValidationSource = await readFile(
    path.join(projectRoot, 'blockly_app/src/docker-validation.ts'),
    'utf8'
  );
  const appBootstrapSource = await readFile(
    path.join(projectRoot, 'blockly_app/src/app-bootstrap.ts'),
    'utf8'
  );
  const validationUiSource = await readFile(
    path.join(projectRoot, 'blockly_app/src/validation-ui.ts'),
    'utf8'
  );

  assert.ok(
    mainSource.includes('bootstrapBlocklyApp'),
    'Generated main.ts should delegate runtime behavior to the handwritten bootstrap'
  );

  assert.ok(
    dockerValidationSource.includes("block.type === 'service'"),
    'Validation should inspect Docker service blocks'
  );

  assert.ok(
    dockerValidationSource.includes("block.type === 'port'"),
    'Validation should inspect Docker port blocks'
  );

  assert.ok(
    dockerValidationSource.includes("block.type === 'environment'"),
    'Validation should inspect Docker environment blocks'
  );

  assert.ok(
    dockerValidationSource.includes("block.type === 'network'"),
    'Validation should inspect top-level Docker network blocks'
  );

  assert.ok(
    dockerValidationSource.includes("block.type === 'restart'"),
    'Validation should inspect Docker restart blocks'
  );

  assert.ok(
    dockerValidationSource.includes("block.type === 'healthcheck'"),
    'Validation should inspect Docker healthcheck blocks'
  );

  assert.ok(
    dockerValidationSource.includes("'networkref'"),
    'Validation should inspect service network reference blocks'
  );

  assert.ok(
    dockerValidationSource.includes("block.getFieldValue('IMAGE')"),
    'Validation should inspect the service IMAGE field'
  );

  assert.ok(
    dockerValidationSource.includes("block.getFieldValue('HOST_PORT')"),
    'Validation should inspect the port HOST_PORT field'
  );

  assert.ok(
    dockerValidationSource.includes("block.getFieldValue('CONTAINER_PORT')"),
    'Validation should inspect the port CONTAINER_PORT field'
  );

  assert.ok(
    dockerValidationSource.includes("block.getFieldValue('KEY')"),
    'Validation should inspect the environment KEY field'
  );

  assert.ok(
    dockerValidationSource.includes("block.getFieldValue('TARGET')"),
    'Validation should inspect reference TARGET fields'
  );

  assert.ok(
    dockerValidationSource.includes("Environment key is required."),
    'Missing Docker environment key should produce the required error'
  );

  assert.ok(
    dockerValidationSource.includes("Environment key must start with a letter or underscore and contain only letters, numbers, and underscores."),
    'Invalid Docker environment key should produce the identifier error'
  );

  assert.ok(
    dockerValidationSource.includes("Duplicate network name"),
    'Duplicate Docker network names should produce a duplicate-name error'
  );

  assert.ok(
    dockerValidationSource.includes("Restart policy must be one of: no, always, on-failure, unless-stopped."),
    'Malformed Docker restart policies should produce the supported-value error'
  );

  assert.ok(
    dockerValidationSource.includes("Healthcheck retries must be an integer greater than or equal to 1."),
    'Malformed Docker healthcheck retries should produce the retry validation error'
  );

  assert.ok(
    dockerValidationSource.includes("Unknown network"),
    'Unknown Docker network references should produce an unknown-network error'
  );

  assert.ok(
    dockerValidationSource.includes("block.type === 'build'"),
    'Validation should inspect Docker build blocks'
  );

  assert.ok(
    dockerValidationSource.includes("'Service requires an image or build configuration.'"),
    'A Docker service without image or build should produce the image-or-build validation error'
  );

  assert.ok(
    dockerValidationSource.includes("'Build context is required.'"),
    'A blank Docker build context should produce the build context validation error'
  );

  assert.ok(
    dockerValidationSource.includes("'Host port is required.'"),
    'Missing Docker host port should produce a port validation error'
  );

  assert.ok(
    dockerValidationSource.includes("'Container port is required.'"),
    'Missing Docker container port should produce a port validation error'
  );

  assert.ok(
    dockerValidationSource.includes("'Host port must be an integer between 1 and 65535.'"),
    'Port host should use the shared integer range validation message'
  );

  assert.ok(
    dockerValidationSource.includes("'Container port must be an integer between 1 and 65535.'"),
    'Port container should use the shared integer range validation message'
  );

  assert.ok(
    dockerValidationSource.includes('block.id'),
    'Docker validation error should identify the invalid Blockly block'
  );

  assert.ok(
    validationUiSource.includes("VALIDATION_WARNING_ID = 'captured-validation-error'"),
    'Docker validation should use the shared Blockly warning ID'
  );

  assert.ok(
    validationUiSource.includes('block.setWarningText('),
    'Validation errors should be attached to Blockly blocks as visual warnings'
  );

  assert.ok(
    appBootstrapSource.includes('...collectDockerValidationErrors(workspace)'),
    'Workspace Docker errors should enter the existing validation pipeline'
  );

  invalidWorkspace.dispose();

  // Execute the production collector itself, without bootstrapping the browser UI.
  for (const [context, collect] of [
    ['runtime docker-validation module', await loadDockerValidationCollector()]
  ]) {
    const integrationWorkspace = new Blockly.Workspace();
    try {
      const collectWorkspace = () => collect(integrationWorkspace);
      const compose = integrationWorkspace.newBlock('compose');
      function createBlock(type, fields) {
        const block = integrationWorkspace.newBlock(type);
        for (const [field, value] of Object.entries(fields)) {
          block.setFieldValue(value, field);
        }
        return block;
      }
      function createService(name, image, hostPort, containerPort, source, target) {
        const service = createBlock('service', { NAME: name, IMAGE: image });
        // Create children in a different order from the required YAML sections.
        const volume = createBlock('volume', { SOURCE: source, TARGET: target });
        const environment = createBlock('environment', { KEY: 'NODE_ENV', VALUE: 'production' });
        const port = createBlock('port', { HOST_PORT: hostPort, CONTAINER_PORT: containerPort });
        service.getInput('VOLUMES').connection.connect(volume.previousConnection);
        service.getInput('ENVIRONMENT').connection.connect(environment.previousConnection);
        service.getInput('PORTS').connection.connect(port.previousConnection);
        return { service, volume, environment, port };
      }
      // Connection order, rather than block creation order, determines service order.
      const backend = createService('backend', 'node:20', '3000', '3000', './data', '/app/data');
      const frontend = createService('frontend', 'nginx', '8080', '80', './frontend', '/usr/share/nginx/html');
      compose.getInput('SERVICES').connection.connect(frontend.service.previousConnection);
      frontend.service.nextConnection.connect(backend.service.previousConnection);
      const apiPort = createBlock('environment', { KEY: 'API_PORT', VALUE: '3000' });
      backend.environment.nextConnection.connect(apiPort.previousConnection);

      const expectedYaml = `services:
  frontend:
    image: nginx
    ports:
      - "8080:80"
    environment:
      NODE_ENV: production
    volumes:
      - "./frontend:/usr/share/nginx/html"
  backend:
    image: node:20
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      API_PORT: "3000"
    volumes:
      - "./data:/app/data"
`;
      assert.deepEqual(collectWorkspace(), [], `${context}: full Compose fixture validates cleanly`);
      const yaml = generator.workspaceToCode(integrationWorkspace);
      assert.equal(yaml, expectedYaml, `${context}: full Compose YAML preserves service, section and environment order`);
      assert.equal(generator.workspaceToCode(integrationWorkspace), yaml,
        `${context}: repeated generation is deterministic`);
      assert.deepEqual(parse(yaml), {
        services: {
          frontend: {
            image: 'nginx', ports: ['8080:80'],
            environment: { NODE_ENV: 'production' },
            volumes: ['./frontend:/usr/share/nginx/html']
          },
          backend: {
            image: 'node:20', ports: ['3000:3000'],
            environment: { NODE_ENV: 'production', API_PORT: '3000' },
            volumes: ['./data:/app/data']
          }
        }
      }, `${context}: YAML parses with every service property and a string numeric environment value`);
      console.log(`[PASS] ${context}: full multi-service Compose validation, exact YAML, deterministic order and parsed values`);

      function assertDuplicateServiceErrors(blocks, name) {
        const errors = collectWorkspace();
        const expected = blocks.map((block) => ({
          type: 'validation',
          message: `Duplicate service name "${name}".`,
          severity: 'error',
          blockId: block.id
        })).sort((left, right) => left.blockId.localeCompare(right.blockId));
        const actual = errors
          .filter((error) => error.message === `Duplicate service name "${name}".`)
          .sort((left, right) => left.blockId.localeCompare(right.blockId));

        assert.deepEqual(
          actual,
          expected,
          `${context}: every duplicate "${name}" service receives a duplicate-name error`
        );
      }

      backend.service.setFieldValue('frontend', 'NAME');
      assertDuplicateServiceErrors([backend.service, frontend.service], 'frontend');
      console.log(`[PASS] ${context}: duplicate service names flag both conflicting services`);

      const duplicateThird = createService('frontend', 'redis', '6379', '6379', './cache', '/data');
      backend.service.nextConnection.connect(duplicateThird.service.previousConnection);
      assertDuplicateServiceErrors(
        [backend.service, frontend.service, duplicateThird.service],
        'frontend'
      );
      console.log(`[PASS] ${context}: three duplicate service names flag all conflicting services`);

      backend.service.setFieldValue('backend', 'NAME');
      duplicateThird.service.setFieldValue('worker', 'NAME');
      assert.deepEqual(collectWorkspace(), [], `${context}: different service names remain valid`);
      console.log(`[PASS] ${context}: different service names remain valid`);

      duplicateThird.service.setFieldValue(' backend ', 'NAME');
      assert.deepEqual(collectWorkspace(), [], `${context}: duplicate validation uses raw service-name semantics`);
      duplicateThird.service.setFieldValue('worker', 'NAME');
      console.log(`[PASS] ${context}: duplicate validation follows raw service-name semantics`);

      duplicateThird.service.setFieldValue('backend', 'NAME');
      assertDuplicateServiceErrors([backend.service, duplicateThird.service], 'backend');
      duplicateThird.service.setFieldValue('worker', 'NAME');
      assert.deepEqual(collectWorkspace(), [], `${context}: renaming duplicate service clears duplicate errors`);
      console.log(`[PASS] ${context}: duplicate error clears after renaming one service`);

      duplicateThird.service.setFieldValue('backend', 'NAME');
      assertDuplicateServiceErrors([backend.service, duplicateThird.service], 'backend');
      duplicateThird.service.dispose(true);
      assert.deepEqual(collectWorkspace(), [], `${context}: removing duplicate service clears duplicate errors`);
      console.log(`[PASS] ${context}: duplicate error clears after removing the conflicting service`);

      backend.service.setFieldValue('', 'NAME');
      assert.deepEqual(
        collectWorkspace().filter((error) => error.blockId === backend.service.id),
        [{
          type: 'validation',
          message: 'Service name is required.',
          severity: 'error',
          blockId: backend.service.id
        }],
        `${context}: empty service names keep the existing required-name validation only`
      );
      backend.service.setFieldValue('backend', 'NAME');

      const dependency = createBlock('dependency', { TARGET: 'frontend' });
      backend.service.getInput('DEPENDS_ON').connection.connect(dependency.previousConnection);
      assert.deepEqual(collectWorkspace(), [], `${context}: valid dependency target validates cleanly`);
      console.log(`[PASS] ${context}: valid dependency target validates cleanly`);

      dependency.setFieldValue('missing-service', 'TARGET');
      assert.deepEqual(
        collectWorkspace().filter((error) => error.blockId === dependency.id),
        [{
          type: 'validation',
          message: 'Unknown dependency service "missing-service".',
          severity: 'error',
          blockId: dependency.id
        }],
        `${context}: unknown dependency target attaches to the dependency block`
      );
      dependency.setFieldValue('frontend', 'TARGET');
      assert.deepEqual(collectWorkspace(), [], `${context}: fixing unknown dependency clears the error`);
      console.log(`[PASS] ${context}: unknown dependency error clears after fixing target`);

      dependency.setFieldValue('backend', 'TARGET');
      assert.deepEqual(
        collectWorkspace().filter((error) => error.blockId === dependency.id),
        [{
          type: 'validation',
          message: 'Service "backend" cannot depend on itself.',
          severity: 'error',
          blockId: dependency.id
        }],
        `${context}: self dependency attaches to the dependency block`
      );
      dependency.setFieldValue('frontend', 'TARGET');
      assert.deepEqual(collectWorkspace(), [], `${context}: fixing self dependency clears the error`);
      console.log(`[PASS] ${context}: self dependency error clears after fixing target`);

      dependency.setFieldValue('', 'TARGET');
      assert.deepEqual(
        collectWorkspace().filter((error) => error.blockId === dependency.id),
        [{
          type: 'validation',
          message: 'Dependency service name is required.',
          severity: 'error',
          blockId: dependency.id
        }],
        `${context}: blank dependency target uses the required-field validation`
      );
      dependency.setFieldValue('frontend', 'TARGET');

      dependency.setFieldValue('cache', 'TARGET');
      assert.equal(
        collectWorkspace().find((error) => error.blockId === dependency.id)?.message,
        'Unknown dependency service "cache".',
        `${context}: dependency is invalid before referenced service is added`
      );
      const cache = createService('cache', 'redis', '6379', '6379', './cache', '/data');
      backend.service.nextConnection.connect(cache.service.previousConnection);
      assert.deepEqual(collectWorkspace(), [], `${context}: dependency becomes valid when referenced service is added`);
      cache.service.setFieldValue('queue', 'NAME');
      assert.equal(
        collectWorkspace().find((error) => error.blockId === dependency.id)?.message,
        'Unknown dependency service "cache".',
        `${context}: dependency becomes invalid when referenced service is renamed`
      );
      cache.service.setFieldValue('cache', 'NAME');
      assert.deepEqual(collectWorkspace(), [], `${context}: restoring referenced service name clears dependency error`);
      cache.service.dispose(true);
      assert.equal(
        collectWorkspace().find((error) => error.blockId === dependency.id)?.message,
        'Unknown dependency service "cache".',
        `${context}: dependency becomes invalid when referenced service is removed`
      );
      dependency.setFieldValue('frontend', 'TARGET');
      assert.deepEqual(collectWorkspace(), [], `${context}: dependency error clears after changing to existing service`);
      console.log(`[PASS] ${context}: dependency validation responds to added, renamed and removed services`);
      dependency.dispose(true);
      assert.deepEqual(collectWorkspace(), [], `${context}: removing dependency block leaves existing validation clean`);

      function assertDuplicateNetworkErrors(blocks, name) {
        const errors = collectWorkspace();
        const expected = blocks.map((block) => ({
          type: 'validation',
          message: `Duplicate network name "${name}".`,
          severity: 'error',
          blockId: block.id
        })).sort((left, right) => left.blockId.localeCompare(right.blockId));
        const actual = errors
          .filter((error) => error.message === `Duplicate network name "${name}".`)
          .sort((left, right) => left.blockId.localeCompare(right.blockId));

        assert.deepEqual(
          actual,
          expected,
          `${context}: every duplicate "${name}" network receives a duplicate-name error`
        );
      }

      const backendNetwork = createBlock('network', { NAME: 'backend', DRIVER: 'bridge' });
      compose.getInput('NETWORKS').connection.connect(backendNetwork.previousConnection);
      const backendNetworkRef = createBlock('networkref', { TARGET: 'backend' });
      frontend.service.getInput('NETWORKS').connection.connect(backendNetworkRef.previousConnection);
      assert.deepEqual(collectWorkspace(), [], `${context}: valid service network reference validates cleanly`);
      console.log(`[PASS] ${context}: valid network reference validates cleanly`);

      backendNetworkRef.setFieldValue('missing-network', 'TARGET');
      assert.deepEqual(
        collectWorkspace().filter((error) => error.blockId === backendNetworkRef.id),
        [{
          type: 'validation',
          message: 'Unknown network "missing-network".',
          severity: 'error',
          blockId: backendNetworkRef.id
        }],
        `${context}: unknown network target attaches to the network reference block`
      );
      backendNetworkRef.setFieldValue('backend', 'TARGET');
      assert.deepEqual(collectWorkspace(), [], `${context}: fixing unknown network clears the error`);
      console.log(`[PASS] ${context}: unknown network error clears after fixing target`);

      backendNetworkRef.setFieldValue('', 'TARGET');
      assert.deepEqual(
        collectWorkspace().filter((error) => error.blockId === backendNetworkRef.id),
        [{
          type: 'validation',
          message: 'Network name is required.',
          severity: 'error',
          blockId: backendNetworkRef.id
        }],
        `${context}: blank service network reference uses required-field validation`
      );
      backendNetworkRef.setFieldValue('backend', 'TARGET');
      assert.deepEqual(collectWorkspace(), [], `${context}: required network reference error clears after correction`);

      backendNetwork.setFieldValue('', 'NAME');
      assert.deepEqual(
        collectWorkspace().filter((error) => error.blockId === backendNetwork.id),
        [{
          type: 'validation',
          message: 'Network name is required.',
          severity: 'error',
          blockId: backendNetwork.id
        }],
        `${context}: blank top-level network name uses required-field validation`
      );
      backendNetwork.setFieldValue('backend', 'NAME');
      assert.deepEqual(collectWorkspace(), [], `${context}: required top-level network error clears after correction`);

      const duplicateNetwork = createBlock('network', { NAME: 'backend', DRIVER: 'bridge' });
      backendNetwork.nextConnection.connect(duplicateNetwork.previousConnection);
      assertDuplicateNetworkErrors([backendNetwork, duplicateNetwork], 'backend');
      duplicateNetwork.setFieldValue('cache', 'NAME');
      assert.deepEqual(collectWorkspace(), [], `${context}: renaming duplicate network clears duplicate errors`);
      console.log(`[PASS] ${context}: duplicate network error clears after renaming one network`);

      duplicateNetwork.setFieldValue(' backend ', 'NAME');
      assert.deepEqual(collectWorkspace(), [], `${context}: duplicate network validation uses raw network-name semantics`);
      duplicateNetwork.setFieldValue('cache', 'NAME');
      assert.deepEqual(collectWorkspace(), [], `${context}: raw network-name semantic fixture restores clean state`);

      duplicateNetwork.setFieldValue('backend', 'NAME');
      assertDuplicateNetworkErrors([backendNetwork, duplicateNetwork], 'backend');
      duplicateNetwork.dispose(true);
      assert.deepEqual(collectWorkspace(), [], `${context}: removing duplicate network clears duplicate errors`);
      console.log(`[PASS] ${context}: duplicate network error clears after removing the conflicting network`);

      backendNetworkRef.setFieldValue('cache', 'TARGET');
      assert.equal(
        collectWorkspace().find((error) => error.blockId === backendNetworkRef.id)?.message,
        'Unknown network "cache".',
        `${context}: network reference is invalid before referenced network is added`
      );
      const cacheNetwork = createBlock('network', { NAME: 'cache', DRIVER: 'bridge' });
      backendNetwork.nextConnection.connect(cacheNetwork.previousConnection);
      assert.deepEqual(collectWorkspace(), [], `${context}: network reference becomes valid when referenced network is added`);
      cacheNetwork.setFieldValue('queue', 'NAME');
      assert.equal(
        collectWorkspace().find((error) => error.blockId === backendNetworkRef.id)?.message,
        'Unknown network "cache".',
        `${context}: network reference becomes invalid when referenced network is renamed`
      );
      cacheNetwork.setFieldValue('cache', 'NAME');
      assert.deepEqual(collectWorkspace(), [], `${context}: restoring referenced network name clears network reference error`);
      cacheNetwork.dispose(true);
      assert.equal(
        collectWorkspace().find((error) => error.blockId === backendNetworkRef.id)?.message,
        'Unknown network "cache".',
        `${context}: network reference becomes invalid when referenced network is removed`
      );
      backendNetworkRef.setFieldValue('backend', 'TARGET');
      assert.deepEqual(collectWorkspace(), [], `${context}: network reference error clears after changing to existing network`);
      console.log(`[PASS] ${context}: network validation responds to added, renamed and removed top-level networks`);

      backendNetworkRef.dispose(true);
      backendNetwork.dispose(true);
      assert.deepEqual(collectWorkspace(), [], `${context}: removing network blocks leaves existing validation clean`);

      const restart = createBlock('restart', { POLICY: 'no' });
      backend.service.getInput('RESTART').connection.connect(restart.outputConnection);
      for (const policy of ['no', 'always', 'on-failure', 'unless-stopped']) {
        restart.setFieldValue(policy, 'POLICY');
        assert.deepEqual(collectWorkspace(), [], `${context}: supported restart policy "${policy}" validates cleanly`);
      }
      restart.setFieldValue('no', 'POLICY');
      const restartYaml = generator.workspaceToCode(integrationWorkspace);
      assert.equal(
        restartYaml,
        expectedYaml.replace(
          '  backend:\n    image: node:20\n',
          '  backend:\n    image: node:20\n    restart: "no"\n'
        ),
        `${context}: restart policy "no" is quoted in generated YAML`
      );
      assert.equal(parse(restartYaml).services.backend.restart, 'no',
        `${context}: quoted restart policy "no" parses as a string`);
      const originalRestartGetFieldValue = restart.getFieldValue.bind(restart);
      restart.getFieldValue = (field) => field === 'POLICY'
        ? 'sometimes'
        : originalRestartGetFieldValue(field);
      assert.deepEqual(
        collectWorkspace().filter((error) => error.blockId === restart.id),
        [{
          type: 'validation',
          message: 'Restart policy must be one of: no, always, on-failure, unless-stopped.',
          severity: 'error',
          blockId: restart.id
        }],
        `${context}: malformed restart policy is rejected if it enters runtime state`
      );
      restart.getFieldValue = originalRestartGetFieldValue;
      restart.dispose(true);
      assert.deepEqual(collectWorkspace(), [], `${context}: removing restart block restores existing validation clean state`);
      assert.equal(generator.workspaceToCode(integrationWorkspace), expectedYaml,
        `${context}: service without restart restores existing YAML exactly`);
      console.log(`[PASS] ${context}: restart policies validate, quote "no", reject malformed values and preserve no-restart YAML`);

      const healthcheck = createBlock('healthcheck', {
        COMMAND: 'curl -f http://localhost || exit 1',
        INTERVAL: '30s',
        TIMEOUT: '10s',
        RETRIES: '3'
      });
      backend.service.getInput('HEALTHCHECK').connection.connect(healthcheck.outputConnection);
      assert.deepEqual(collectWorkspace(), [], `${context}: valid healthcheck validates cleanly`);
      const healthcheckYaml = generator.workspaceToCode(integrationWorkspace);
      assert.equal(
        healthcheckYaml,
        expectedYaml.replace(
          '  backend:\n    image: node:20\n',
          '  backend:\n    image: node:20\n    healthcheck:\n      test: ["CMD-SHELL", "curl -f http://localhost || exit 1"]\n      interval: 30s\n      timeout: 10s\n      retries: 3\n'
        ),
        `${context}: healthcheck YAML is generated in the expected CMD-SHELL form`
      );
      assert.deepEqual(parse(healthcheckYaml).services.backend.healthcheck, {
        test: ['CMD-SHELL', 'curl -f http://localhost || exit 1'],
        interval: '30s',
        timeout: '10s',
        retries: 3
      }, `${context}: healthcheck YAML parses with command, durations and retries`);

      for (const [field, invalid, valid, message] of [
        ['COMMAND', '', 'curl -f http://localhost || exit 1', 'Healthcheck command is required.'],
        ['INTERVAL', '   ', '30s', 'Healthcheck interval is required.'],
        ['TIMEOUT', '', '10s', 'Healthcheck timeout is required.'],
        ['INTERVAL', '30sec', '30s', 'Healthcheck interval must use a supported duration such as 500ms, 10s, 2m, or 1h.'],
        ['TIMEOUT', '1d', '10s', 'Healthcheck timeout must use a supported duration such as 500ms, 10s, 2m, or 1h.'],
        ['RETRIES', '0', '3', 'Healthcheck retries must be an integer greater than or equal to 1.'],
        ['RETRIES', '-1', '3', 'Healthcheck retries must be an integer greater than or equal to 1.'],
        ['RETRIES', '1.5', '3', 'Healthcheck retries must be an integer greater than or equal to 1.']
      ]) {
        healthcheck.setFieldValue(invalid, field);
        assert.deepEqual(
          collectWorkspace().filter((error) => error.blockId === healthcheck.id),
          [{
            type: 'validation',
            message,
            severity: 'error',
            blockId: healthcheck.id
          }],
          `${context}: invalid healthcheck ${field} value "${invalid}" is rejected`
        );
        healthcheck.setFieldValue(valid, field);
        assert.deepEqual(collectWorkspace(), [], `${context}: correcting healthcheck ${field} clears validation`);
      }

      const originalHealthcheckGetFieldValue = healthcheck.getFieldValue.bind(healthcheck);
      healthcheck.getFieldValue = (field) => field === 'RETRIES'
        ? 'abc'
        : originalHealthcheckGetFieldValue(field);
      assert.deepEqual(
        collectWorkspace().filter((error) => error.blockId === healthcheck.id),
        [{
          type: 'validation',
          message: 'Healthcheck retries must be an integer greater than or equal to 1.',
          severity: 'error',
          blockId: healthcheck.id
        }],
        `${context}: non-numeric malformed healthcheck retries is rejected`
      );
      healthcheck.getFieldValue = originalHealthcheckGetFieldValue;
      assert.deepEqual(collectWorkspace(), [], `${context}: restoring healthcheck retries clears malformed runtime validation`);
      healthcheck.dispose(true);
      assert.deepEqual(collectWorkspace(), [], `${context}: removing healthcheck block restores existing validation clean state`);
      assert.equal(generator.workspaceToCode(integrationWorkspace), expectedYaml,
        `${context}: service without healthcheck restores existing YAML exactly`);
      console.log(`[PASS] ${context}: healthcheck validation covers required fields, durations, retries and clearing`);

      const buildOnlyService = createBlock('service', { NAME: 'builder', IMAGE: '' });
      backend.service.nextConnection.connect(buildOnlyService.previousConnection);
      assert.deepEqual(
        collectWorkspace().filter((error) => error.blockId === buildOnlyService.id),
        [{
          type: 'validation',
          message: 'Service requires an image or build configuration.',
          severity: 'error',
          blockId: buildOnlyService.id
        }],
        `${context}: service with neither image nor build is invalid`
      );

      const build = createBlock('build', { CONTEXT: '.' });
      buildOnlyService.getInput('BUILD').connection.connect(build.outputConnection);
      assert.deepEqual(collectWorkspace(), [], `${context}: build-only service validates cleanly`);
      assert.equal(
        generator.workspaceToCode(integrationWorkspace),
        expectedYaml + '  builder:\n    build: .\n',
        `${context}: build-only service emits short-form build YAML`
      );

      buildOnlyService.setFieldValue('my-app:latest', 'IMAGE');
      assert.deepEqual(collectWorkspace(), [], `${context}: image plus build validates cleanly`);
      assert.equal(
        generator.workspaceToCode(integrationWorkspace),
        expectedYaml + '  builder:\n    image: my-app:latest\n    build: .\n',
        `${context}: service with image and build emits both fields`
      );

      buildOnlyService.setFieldValue('', 'IMAGE');
      assert.deepEqual(collectWorkspace(), [], `${context}: removing image while build remains stays valid`);
      build.setFieldValue('', 'CONTEXT');
      assert.deepEqual(
        collectWorkspace().filter((error) => error.blockId === build.id),
        [{
          type: 'validation',
          message: 'Build context is required.',
          severity: 'error',
          blockId: build.id
        }],
        `${context}: blank build context attaches to the Build block`
      );
      assert.equal(
        collectWorkspace().find((error) => error.blockId === buildOnlyService.id)?.message,
        'Service requires an image or build configuration.',
        `${context}: service with blank image and blank build context has no usable image/build`
      );
      build.setFieldValue('.', 'CONTEXT');
      assert.deepEqual(collectWorkspace(), [], `${context}: fixing build context clears build and service errors`);

      buildOnlyService.setFieldValue('builder:latest', 'IMAGE');
      build.dispose(true);
      assert.deepEqual(collectWorkspace(), [], `${context}: removing build while image remains stays valid`);
      buildOnlyService.setFieldValue('', 'IMAGE');
      assert.equal(
        collectWorkspace().find((error) => error.blockId === buildOnlyService.id)?.message,
        'Service requires an image or build configuration.',
        `${context}: clearing both image and build is invalid`
      );
      buildOnlyService.dispose(true);
      assert.deepEqual(collectWorkspace(), [], `${context}: removing build validation fixture restores clean state`);
      assert.equal(generator.workspaceToCode(integrationWorkspace), expectedYaml,
        `${context}: removing build fixture restores existing YAML exactly`);
      console.log(`[PASS] ${context}: build validation covers image-only, build-only, image+build and clearing`);

      const invalidFields = [
        [backend.service, 'IMAGE', '', 'node:20', 'Service requires an image or build configuration.'],
        [backend.port, 'HOST_PORT', '65536', '3000', 'Host port must be an integer between 1 and 65535.'],
        [apiPort, 'KEY', '1INVALID', 'API_PORT', 'Environment key must start with a letter or underscore and contain only letters, numbers, and underscores.'],
        [backend.volume, 'SOURCE', '', './data', 'Volume source is required.'],
        [backend.volume, 'TARGET', '   ', '/app/data', 'Volume target is required.']
      ];
      for (const [block, field, invalid] of invalidFields) {
        block.setFieldValue(invalid, field);
      }
      const expectedErrors = invalidFields.map(([block, , , , message]) => ({
        type: 'validation', message, severity: 'error', blockId: block.id
      }));
      function assertErrors(expected) {
        const errors = collectWorkspace();
        assert.equal(errors.length, expected.length, `${context}: no missing or extra validation errors`);
        for (const block of integrationWorkspace.getAllBlocks(false)) {
          assert.deepEqual(
            errors.filter((error) => error.blockId === block.id),
            expected.filter((error) => error.blockId === block.id),
            `${context}: ${block.type} ${block.id} receives only its own expected errors`
          );
        }
      }
      assertErrors(expectedErrors);
      console.log(`[PASS] ${context}: simultaneous Service, Port, Environment and Volume errors have exact messages and block IDs; unrelated blocks remain clean`);

      for (const [index, [block, field, , valid]] of invalidFields.entries()) {
        block.setFieldValue(valid, field);
        assertErrors(expectedErrors.slice(index + 1));
      }
      assert.deepEqual(collectWorkspace(), [], `${context}: correcting all invalid fields clears validation`);
      assert.equal(generator.workspaceToCode(integrationWorkspace), expectedYaml,
        `${context}: corrected workspace restores the full expected YAML`);
      console.log(`[PASS] ${context}: incremental corrections clear only resolved errors and restore valid Compose YAML`);
    } finally {
      integrationWorkspace.dispose();
    }

    const volumeWorkspace = new Blockly.Workspace();
    try {
      const collectVolumeWorkspace = () => collect(volumeWorkspace);
      const compose = volumeWorkspace.newBlock('compose');
      const service = volumeWorkspace.newBlock('service');
      service.setFieldValue('backend', 'NAME');
      service.setFieldValue('node:20', 'IMAGE');
      compose.getInput('SERVICES').connection.connect(service.previousConnection);
      const volume = volumeWorkspace.newBlock('volume');
      volume.setFieldValue('./data', 'SOURCE');
      volume.setFieldValue('/app/data', 'TARGET');
      service.getInput('VOLUMES').connection.connect(volume.previousConnection);
      assert.deepEqual(collectVolumeWorkspace(), []);
      const yaml = generator.workspaceToCode(volumeWorkspace);
      assert.equal(yaml, 'services:\n  backend:\n    image: node:20\n    volumes:\n      - "./data:/app/data"\n');
      assert.deepEqual(parse(yaml), { services: { backend: { image: 'node:20', volumes: ['./data:/app/data'] } } });
      console.log(`[PASS] ${context}: valid Volume validation and exact double-quoted YAML`);
      for (const [field, message, valid] of [
        ['SOURCE', 'Volume source is required.', './data'],
        ['TARGET', 'Volume target is required.', '/app/data']
      ]) {
        for (const empty of ['', '   ']) {
          volume.setFieldValue(empty, field);
          assert.deepEqual(collectVolumeWorkspace(), [{ type: 'validation', message, severity: 'error', blockId: volume.id }]);
        }
        volume.setFieldValue(valid, field);
        assert.deepEqual(collectVolumeWorkspace(), []);
        console.log(`[PASS] ${context}: empty/blank Volume ${field} error attaches to Volume block and clears after correction`);
      }
      const port = volumeWorkspace.newBlock('port');
      port.setFieldValue('3000', 'HOST_PORT');
      port.setFieldValue('3000', 'CONTAINER_PORT');
      service.getInput('PORTS').connection.connect(port.previousConnection);
      const env = volumeWorkspace.newBlock('environment');
      env.setFieldValue('NODE_ENV', 'KEY');
      env.setFieldValue('production', 'VALUE');
      service.getInput('ENVIRONMENT').connection.connect(env.previousConnection);
      assert.deepEqual(collectVolumeWorkspace(), []);
      assert.equal(generator.workspaceToCode(volumeWorkspace),
        'services:\n  backend:\n    image: node:20\n    ports:\n      - "3000:3000"\n    environment:\n      NODE_ENV: production\n    volumes:\n      - "./data:/app/data"\n');
      service.setFieldValue('', 'IMAGE');
      port.setFieldValue('0', 'HOST_PORT');
      env.setFieldValue('', 'KEY');
      const errors = collectVolumeWorkspace();
      assert.equal(errors.length, 3);
      for (const [block, message] of [
        [service, 'Service requires an image or build configuration.'],
        [port, 'Host port must be an integer between 1 and 65535.'],
        [env, 'Environment key is required.']
      ]) {
        assert.deepEqual(errors.find((error) => error.blockId === block.id),
          { type: 'validation', message, severity: 'error', blockId: block.id });
      }
      console.log(`[PASS] ${context}: Service, Port and Environment YAML/validation unchanged with Volume`);
    } finally {
      volumeWorkspace.dispose();
    }
  }

  console.log(
    '[PASS] Invalid Docker blocks produce expected validation and Blockly feedback'
  );

  console.log('\n[PASS] All Docker regression tests passed\n');
} finally {
  await rm(tempBlocksPath, { force: true });
  await rm(tempGeneratorPath, { force: true });
  await rm(tempDockerYamlPath, { force: true });
}
