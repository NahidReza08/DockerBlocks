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
    'Regression fixture should contain a service with a missing image'
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
    dockerValidationSource.includes("Environment key is required."),
    'Missing Docker environment key should produce the required error'
  );

  assert.ok(
    dockerValidationSource.includes("Environment key must start with a letter or underscore and contain only letters, numbers, and underscores."),
    'Invalid Docker environment key should produce the identifier error'
  );

  assert.ok(
    dockerValidationSource.includes("'Image is required'"),
    'Missing Docker image should produce the existing validation error'
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

      const invalidFields = [
        [backend.service, 'IMAGE', '', 'node:20', 'Image is required'],
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
        [service, 'Image is required'],
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
