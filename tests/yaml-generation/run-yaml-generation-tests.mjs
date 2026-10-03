import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  fileURLToPath,
  pathToFileURL
} from 'node:url';

import * as Blockly from 'blockly';
import ts from 'typescript';
import { parse } from 'yaml';
import { createServicesForGrammar } from 'langium/grammar';

import { loadGrammar } from '../../generate_blockly/src/grammar-loader.js';
import { validateGrammar } from '../../generate_blockly/src/validator.js';
import { buildIR } from '../../generate_blockly/src/ir-builder.js';
import {
  generateBlocksTs,
  generateGeneratorTs
} from '../../generate_blockly/src/blockly-ts-target.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const dockerGrammar = path.join(
  repoRoot,
  'generate_blockly',
  'input',
  'docker-compose.langium'
);

function extractBlockDefinitions(blocksTs) {
  const marker = 'Blockly.defineBlocksWithJsonArray(';
  const markerIndex = blocksTs.indexOf(marker);

  assert.notEqual(
    markerIndex,
    -1,
    'Generated blocks.ts should define Blockly blocks.'
  );

  const arrayStart = blocksTs.indexOf('[', markerIndex);
  const arrayEnd = blocksTs.indexOf('\n  );', arrayStart);

  assert.notEqual(
    arrayStart,
    -1,
    'Generated block definition array should have a start.'
  );

  assert.notEqual(
    arrayEnd,
    -1,
    'Generated block definition array should have an end.'
  );

  return JSON.parse(
    blocksTs.slice(arrayStart, arrayEnd).trim()
  );
}

function blockInputs(block) {
  return Object.entries(block)
    .filter(([key]) => /^args\d+$/.test(key))
    .flatMap(([, args]) => args);
}

async function loadGeneratedGenerator(generatorTs) {
  const dockerYamlSource = fs.readFileSync(
    path.join(repoRoot, 'blockly_app/src/docker-yaml.ts'),
    'utf8'
  );

  const transpiledDockerYaml = ts.transpileModule(dockerYamlSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  });

  const transpiled = ts.transpileModule(generatorTs, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022
    }
  });

  const tempModule = path.join(
    __dirname,
    `.generated-generator-${process.pid}.mjs`
  );
  const tempDockerYamlModule = path.join(
    __dirname,
    `.generated-docker-yaml-${process.pid}.mjs`
  );

  fs.writeFileSync(
    tempModule,
    transpiled.outputText.replace(
      "from './docker-yaml';",
      `from './${path.basename(tempDockerYamlModule)}';`
    ),
    'utf8'
  );

  fs.writeFileSync(
    tempDockerYamlModule,
    transpiledDockerYaml.outputText,
    'utf8'
  );

  try {
    return await import(
      pathToFileURL(tempModule).href + `?t=${Date.now()}`
    );
  } finally {
    fs.unlinkSync(tempModule);
    fs.unlinkSync(tempDockerYamlModule);
  }
}

async function testMultiServiceExample(grammar, generator) {
  const examples = path.join(repoRoot, 'tests', 'docker-compose-examples');
  const source = fs.readFileSync(path.join(examples, 'D04-valid-multi-service.dsl'), 'utf8');
  const expected = fs.readFileSync(path.join(examples, 'D04-valid-multi-service.yaml'), 'utf8').replace(/\r\n/g, '\n');
  const services = await createServicesForGrammar({ grammar });
  const result = services.parser.LangiumParser.parse(source);
  assert.deepEqual(result.lexerErrors, [], 'D04 should have no lexer errors');
  assert.deepEqual(result.parserErrors, [], 'D04 should parse with the Docker Compose grammar');

  const workspace = new Blockly.Workspace();
  try {
    // Test-only adapter: all field values come from the parsed demo, not a second fixture.
    function append(connection, type, fields) {
      const block = workspace.newBlock(type);
      for (const [field, value] of Object.entries(fields)) {
        block.setFieldValue(String(value), field);
      }
      connection.connect(block.previousConnection);
      return block;
    }
    const compose = workspace.newBlock('compose');
    let nextService = compose.getInput('SERVICES').connection;
    for (const service of result.value.services) {
      const block = append(nextService, 'service', { NAME: service.name, IMAGE: service.image });
      nextService = block.nextConnection;
      for (const [input, type, entries, fields] of [
        ['PORTS', 'port', service.ports, entry => ({ HOST_PORT: entry.host_port, CONTAINER_PORT: entry.container_port })],
        ['ENVIRONMENT', 'environment', service.environments, entry => ({ KEY: entry.key, VALUE: entry.value })],
        ['VOLUMES', 'volume', service.volumes, entry => ({ SOURCE: entry.source, TARGET: entry.target })]
      ]) {
        let connection = block.getInput(input).connection;
        for (const entry of entries) {
          connection = append(connection, type, fields(entry)).nextConnection;
        }
      }
    }
    const yaml = generator.workspaceToCode(workspace);
    assert.equal(yaml, expected, 'D04 generated YAML should match the documented output');
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
    }, 'D04 YAML should parse with both services and every supported Docker feature');
    console.log('[PASS] D04 demo parses and generates the expected multi-service YAML');
  } finally {
    workspace.dispose();
  }
}

async function testComposeYamlGeneration() {
  console.log('Testing Docker Compose YAML generation...');

  const grammar = await loadGrammar(dockerGrammar);
  validateGrammar(grammar);

  const ir = buildIR(grammar);

  const blocksTs = generateBlocksTs(ir);
  const generatorTs = generateGeneratorTs(ir);

  const blockDefinitions = extractBlockDefinitions(blocksTs);
  Blockly.defineBlocksWithJsonArray(blockDefinitions);

  const { generator } =
    await loadGeneratedGenerator(generatorTs);

  await testMultiServiceExample(grammar, generator);

  const workspace = new Blockly.Workspace();

  try {
    const compose = workspace.newBlock('compose');
    const service = workspace.newBlock('service');

    service.setFieldValue('frontend', 'NAME');
    service.setFieldValue('nginx', 'IMAGE');

    const servicesConnection =
      compose.getInput('SERVICES')?.connection;

    assert.ok(
      servicesConnection,
      'Compose should expose a SERVICES statement input.'
    );

    assert.ok(
      service.previousConnection,
      'Service should have a previous connection.'
    );

    servicesConnection.connect(
      service.previousConnection
    );

    const yaml = generator.workspaceToCode(workspace);

    const parsedYaml = parse(yaml);

    assert.deepEqual(
      parsedYaml,
      {
        services: {
          frontend: {
            image: 'nginx'
          }
        }
      },
      'Generated output should be syntactically valid Docker Compose YAML.'
    );

    console.log('✓ generated output is valid YAML');

    const expected =
      'services:\n' +
      '  frontend:\n' +
      '    image: nginx\n';

    assert.equal(
      yaml,
      expected,
      'Generated Docker Compose YAML should have stable formatting.'
    );

    assert.match(
      yaml,
      /^services:/,
      'Generated YAML should contain a services section.'
    );

    assert.match(
      yaml,
      /^  frontend:/m,
      'Generated YAML should contain the frontend service.'
    );

    assert.match(
      yaml,
      /^    image: nginx$/m,
      'Generated YAML should contain the nginx image.'
    );

    console.log('✓ services section generated');
    console.log('✓ frontend service generated');
    console.log('✓ nginx image generated');
    console.log('✓ YAML formatting is deterministic');

    console.log('Testing multiple Docker Compose services...');

    const backend = workspace.newBlock('service');

    backend.setFieldValue('backend', 'NAME');
    backend.setFieldValue('node', 'IMAGE');

    assert.ok(
      service.nextConnection,
      'First Service should have a next connection.'
    );

    assert.ok(
      backend.previousConnection,
      'Second Service should have a previous connection.'
    );

    service.nextConnection.connect(
      backend.previousConnection
    );

    const multipleServicesYaml =
      generator.workspaceToCode(workspace);

    const parsedMultipleServicesYaml =
      parse(multipleServicesYaml);

    assert.deepEqual(
      parsedMultipleServicesYaml,
      {
        services: {
          frontend: {
            image: 'nginx'
          },
          backend: {
            image: 'node'
          }
        }
      },
      'Generated YAML should contain both Docker Compose services.'
    );

    const expectedMultipleServices =
      'services:\n' +
      '  frontend:\n' +
      '    image: nginx\n' +
      '  backend:\n' +
      '    image: node\n';

    assert.equal(
      multipleServicesYaml,
      expectedMultipleServices,
      'Multiple Docker Compose services should have stable formatting.'
    );

    assert.match(
      multipleServicesYaml,
      /^  backend:/m,
      'Generated YAML should contain the backend service.'
    );

    assert.match(
      multipleServicesYaml,
      /^    image: node$/m,
      'Generated YAML should contain the node image.'
    );

    console.log('✓ multiple services generated');
    console.log('✓ backend service generated');
    console.log('✓ node image generated');

    console.log('Testing Docker Compose build grammar and YAML...');

    const grammarServices = await createServicesForGrammar({ grammar });
    for (const [label, source] of [
      ['image-only service', 'compose {\n  service web {\n    image nginx\n  }\n}\n'],
      ['build-only service', 'compose {\n  service web {\n    build "."\n  }\n}\n'],
      ['image plus build service', 'compose {\n  service web {\n    image myapp:latest\n    build "."\n  }\n}\n'],
      ['service with neither image nor build', 'compose {\n  service web {\n  }\n}\n']
    ]) {
      const parsed = grammarServices.parser.LangiumParser.parse(source);
      assert.deepEqual(parsed.lexerErrors, [], `${label} should have no lexer errors`);
      assert.deepEqual(parsed.parserErrors, [], `${label} should parse`);
    }

    const buildBlockDefinition = blockDefinitions.find((block) => block.type === 'build');
    assert.ok(buildBlockDefinition, 'Generated blocks should include build');
    assert.equal(
      buildBlockDefinition.output,
      'build',
      'Build should be a value block for the Service BUILD input.'
    );
    assert.deepEqual(
      blockInputs(buildBlockDefinition).find((input) => input.name === 'CONTEXT'),
      {
        type: 'field_input',
        name: 'CONTEXT',
        text: '.'
      },
      'Build context should use a simple text field with a dot default.'
    );

    const buildOnlyWorkspace = new Blockly.Workspace();
    try {
      const buildCompose = buildOnlyWorkspace.newBlock('compose');
      const buildService = buildOnlyWorkspace.newBlock('service');
      buildService.setFieldValue('web', 'NAME');
      buildService.setFieldValue('', 'IMAGE');
      buildCompose.getInput('SERVICES').connection.connect(buildService.previousConnection);
      const build = buildOnlyWorkspace.newBlock('build');
      build.setFieldValue('.', 'CONTEXT');
      buildService.getInput('BUILD').connection.connect(build.outputConnection);
      const buildOnlyYaml = generator.workspaceToCode(buildOnlyWorkspace);
      assert.equal(
        buildOnlyYaml,
        'services:\n' +
        '  web:\n' +
        '    build: .\n',
        'Build-only services should generate short-form build YAML without an image.'
      );
      assert.deepEqual(parse(buildOnlyYaml), {
        services: {
          web: {
            build: '.'
          }
        }
      });

      buildService.setFieldValue('my-app:latest', 'IMAGE');
      const imageAndBuildYaml = generator.workspaceToCode(buildOnlyWorkspace);
      assert.equal(
        imageAndBuildYaml,
        'services:\n' +
        '  web:\n' +
        '    image: my-app:latest\n' +
        '    build: .\n',
        'Services with image and build should emit both in deterministic order.'
      );
      assert.deepEqual(parse(imageAndBuildYaml), {
        services: {
          web: {
            image: 'my-app:latest',
            build: '.'
          }
        }
      });
    } finally {
      buildOnlyWorkspace.dispose();
    }

    console.log('✓ build grammar and YAML generated');

    console.log('Testing Docker Compose restart policy grammar and YAML...');

    const noRestartDsl =
      'compose {\n' +
      '  service web {\n' +
      '    image nginx\n' +
      '  }\n' +
      '}\n';
    const noRestartParse = grammarServices.parser.LangiumParser.parse(noRestartDsl);
    assert.deepEqual(noRestartParse.lexerErrors, [], 'Service without restart should have no lexer errors');
    assert.deepEqual(noRestartParse.parserErrors, [], 'Service without restart should parse');

    for (const policy of ['no', 'always', 'on-failure', 'unless-stopped']) {
      const restartDsl =
        'compose {\n' +
        '  service web {\n' +
        '    image nginx\n' +
        '    restart ' + policy + '\n' +
        '  }\n' +
        '}\n';
      const restartParse = grammarServices.parser.LangiumParser.parse(restartDsl);
      assert.deepEqual(restartParse.lexerErrors, [], `Restart ${policy} should have no lexer errors`);
      assert.deepEqual(restartParse.parserErrors, [], `Restart ${policy} should parse`);
      assert.equal(restartParse.value.services[0].restart.policy, policy);
    }

    const restartBlockDefinition = blockDefinitions.find((block) => block.type === 'restart');
    assert.ok(restartBlockDefinition, 'Generated blocks should include restart');
    assert.equal(
      restartBlockDefinition.output,
      'restart',
      'Restart should be a value block for the Service RESTART input.'
    );
    assert.deepEqual(
      blockInputs(restartBlockDefinition).find((input) => input.name === 'POLICY'),
      {
        type: 'field_dropdown',
        name: 'POLICY',
        options: [
          ['no', 'no'],
          ['always', 'always'],
          ['on-failure', 'on-failure'],
          ['unless-stopped', 'unless-stopped']
        ]
      },
      'Restart policy should use a dropdown containing exactly the supported Compose values.'
    );

    for (const [policy, expectedScalar] of [
      ['no', '"no"'],
      ['always', 'always'],
      ['on-failure', 'on-failure'],
      ['unless-stopped', 'unless-stopped']
    ]) {
      const restartWorkspace = new Blockly.Workspace();
      try {
        const restartCompose = restartWorkspace.newBlock('compose');
        const restartService = restartWorkspace.newBlock('service');
        restartService.setFieldValue('web', 'NAME');
        restartService.setFieldValue('nginx', 'IMAGE');
        restartCompose.getInput('SERVICES').connection.connect(restartService.previousConnection);
        const restart = restartWorkspace.newBlock('restart');
        restart.setFieldValue(policy, 'POLICY');
        restartService.getInput('RESTART').connection.connect(restart.outputConnection);
        const restartYaml = generator.workspaceToCode(restartWorkspace);
        assert.equal(
          restartYaml,
          'services:\n' +
          '  web:\n' +
          '    image: nginx\n' +
          '    restart: ' + expectedScalar + '\n',
          `Restart policy ${policy} should generate stable YAML.`
        );
        assert.deepEqual(parse(restartYaml), {
          services: {
            web: {
              image: 'nginx',
              restart: policy
            }
          }
        }, `Restart policy ${policy} should parse as the intended string value.`);
      } finally {
        restartWorkspace.dispose();
      }
    }

    console.log('✓ restart policy grammar and YAML generated');

    console.log('Testing Docker Compose healthcheck grammar and YAML...');

    const noHealthcheckParse = grammarServices.parser.LangiumParser.parse(noRestartDsl);
    assert.deepEqual(noHealthcheckParse.lexerErrors, [], 'Service without healthcheck should have no lexer errors');
    assert.deepEqual(noHealthcheckParse.parserErrors, [], 'Service without healthcheck should parse');

    const healthcheckDsl =
      'compose {\n' +
      '  service web {\n' +
      '    image nginx\n' +
      '    healthcheck command "curl -f http://localhost || exit 1" interval "30s" timeout "10s" retries 3\n' +
      '  }\n' +
      '}\n';
    const healthcheckParse = grammarServices.parser.LangiumParser.parse(healthcheckDsl);
    assert.deepEqual(healthcheckParse.lexerErrors, [], 'Healthcheck example should have no lexer errors');
    assert.deepEqual(healthcheckParse.parserErrors, [], 'Healthcheck example should parse');
    assert.deepEqual({
      command: healthcheckParse.value.services[0].healthcheck.command,
      interval: healthcheckParse.value.services[0].healthcheck.interval,
      timeout: healthcheckParse.value.services[0].healthcheck.timeout,
      retries: healthcheckParse.value.services[0].healthcheck.retries
    }, {
      command: 'curl -f http://localhost || exit 1',
      interval: '30s',
      timeout: '10s',
      retries: 3
    });

    const healthcheckBlockDefinition = blockDefinitions.find((block) => block.type === 'healthcheck');
    assert.ok(healthcheckBlockDefinition, 'Generated blocks should include healthcheck');
    assert.equal(
      healthcheckBlockDefinition.output,
      'healthcheck',
      'Healthcheck should be a value block for the Service HEALTHCHECK input.'
    );
    assert.deepEqual(
      [
        ['COMMAND', 'field_input', 'curl -f http://localhost || exit 1'],
        ['INTERVAL', 'field_input', '30s'],
        ['TIMEOUT', 'field_input', '10s'],
        ['RETRIES', 'field_number', 3]
      ].map(([name, type, defaultValue]) => {
        const input = blockInputs(healthcheckBlockDefinition).find((candidate) => candidate.name === name);
        return [input?.name, input?.type, input?.text ?? input?.value, defaultValue];
      }),
      [
        ['COMMAND', 'field_input', 'curl -f http://localhost || exit 1', 'curl -f http://localhost || exit 1'],
        ['INTERVAL', 'field_input', '30s', '30s'],
        ['TIMEOUT', 'field_input', '10s', '10s'],
        ['RETRIES', 'field_number', 3, 3]
      ],
      'Healthcheck block should expose command, interval, timeout and retries defaults.'
    );

    const healthcheckWorkspace = new Blockly.Workspace();
    try {
      const healthcheckCompose = healthcheckWorkspace.newBlock('compose');
      const healthcheckService = healthcheckWorkspace.newBlock('service');
      healthcheckService.setFieldValue('web', 'NAME');
      healthcheckService.setFieldValue('nginx', 'IMAGE');
      healthcheckCompose.getInput('SERVICES').connection.connect(healthcheckService.previousConnection);
      const healthcheck = healthcheckWorkspace.newBlock('healthcheck');
      const command = 'curl -f "http://localhost:8080/health?ready=true" || exit 1';
      healthcheck.setFieldValue(command, 'COMMAND');
      healthcheck.setFieldValue('30s', 'INTERVAL');
      healthcheck.setFieldValue('10s', 'TIMEOUT');
      healthcheck.setFieldValue('3', 'RETRIES');
      healthcheckService.getInput('HEALTHCHECK').connection.connect(healthcheck.outputConnection);
      const healthcheckYaml = generator.workspaceToCode(healthcheckWorkspace);
      assert.equal(
        healthcheckYaml,
        'services:\n' +
        '  web:\n' +
        '    image: nginx\n' +
        '    healthcheck:\n' +
        '      test: ["CMD-SHELL", ' + JSON.stringify(command) + ']\n' +
        '      interval: 30s\n' +
        '      timeout: 10s\n' +
        '      retries: 3\n',
        'Healthcheck should generate stable CMD-SHELL YAML with escaped command content.'
      );
      assert.deepEqual(parse(healthcheckYaml), {
        services: {
          web: {
            image: 'nginx',
            healthcheck: {
              test: ['CMD-SHELL', command],
              interval: '30s',
              timeout: '10s',
              retries: 3
            }
          }
        }
      }, 'Healthcheck YAML should parse with the intended command array and timing values.');
    } finally {
      healthcheckWorkspace.dispose();
    }

    console.log('✓ healthcheck grammar and YAML generated');

    console.log('Testing Docker Compose depends_on grammar and YAML...');

    const oneDependencyDsl =
      'compose {\n' +
      '  service web {\n' +
      '    image nginx\n' +
      '    depends_on db\n' +
      '  }\n' +
      '  service db {\n' +
      '    image postgres\n' +
      '  }\n' +
      '}\n';
    const oneDependencyParse = grammarServices.parser.LangiumParser.parse(oneDependencyDsl);
    assert.deepEqual(oneDependencyParse.lexerErrors, [], 'One dependency example should have no lexer errors');
    assert.deepEqual(oneDependencyParse.parserErrors, [], 'One dependency example should parse');

    const multiDependencyDsl =
      'compose {\n' +
      '  service web {\n' +
      '    image nginx\n' +
      '    depends_on db\n' +
      '    depends_on cache\n' +
      '  }\n' +
      '  service db {\n' +
      '    image postgres\n' +
      '  }\n' +
      '  service cache {\n' +
      '    image redis\n' +
      '  }\n' +
      '}\n';
    const multiDependencyParse = grammarServices.parser.LangiumParser.parse(multiDependencyDsl);
    assert.deepEqual(multiDependencyParse.lexerErrors, [], 'Multiple dependency example should have no lexer errors');
    assert.deepEqual(multiDependencyParse.parserErrors, [], 'Multiple dependency example should parse');

    const dependencyBlockDefinition = blockDefinitions.find((block) => block.type === 'dependency');
    assert.ok(dependencyBlockDefinition, 'Generated blocks should include dependency');
    assert.equal(
      dependencyBlockDefinition.previousStatement,
      'dependency',
      'Dependency block should be stackable only with dependency blocks'
    );

    const dependsWorkspace = new Blockly.Workspace();
    try {
      const dependsCompose = dependsWorkspace.newBlock('compose');
      const web = dependsWorkspace.newBlock('service');
      const db = dependsWorkspace.newBlock('service');
      web.setFieldValue('web', 'NAME');
      web.setFieldValue('nginx', 'IMAGE');
      db.setFieldValue('db', 'NAME');
      db.setFieldValue('postgres', 'IMAGE');
      dependsCompose.getInput('SERVICES').connection.connect(web.previousConnection);
      web.nextConnection.connect(db.previousConnection);
      const dependency = dependsWorkspace.newBlock('dependency');
      dependency.setFieldValue('db', 'TARGET');
      web.getInput('DEPENDS_ON').connection.connect(dependency.previousConnection);
      const dependsYaml = generator.workspaceToCode(dependsWorkspace);
      assert.equal(
        dependsYaml,
        'services:\n' +
        '  web:\n' +
        '    image: nginx\n' +
        '    depends_on:\n' +
        '      - db\n' +
        '  db:\n' +
        '    image: postgres\n',
        'One Docker dependency should generate short depends_on syntax.'
      );
      assert.deepEqual(parse(dependsYaml), {
        services: {
          web: { image: 'nginx', depends_on: ['db'] },
          db: { image: 'postgres' }
        }
      });

      const cache = dependsWorkspace.newBlock('service');
      cache.setFieldValue('cache', 'NAME');
      cache.setFieldValue('redis', 'IMAGE');
      db.nextConnection.connect(cache.previousConnection);
      const cacheDependency = dependsWorkspace.newBlock('dependency');
      cacheDependency.setFieldValue('cache', 'TARGET');
      dependency.nextConnection.connect(cacheDependency.previousConnection);
      const multiDependsYaml = generator.workspaceToCode(dependsWorkspace);
      assert.equal(
        multiDependsYaml,
        'services:\n' +
        '  web:\n' +
        '    image: nginx\n' +
        '    depends_on:\n' +
        '      - db\n' +
        '      - cache\n' +
        '  db:\n' +
        '    image: postgres\n' +
        '  cache:\n' +
        '    image: redis\n',
        'Multiple Docker dependencies should preserve stack order.'
      );
      assert.deepEqual(parse(multiDependsYaml).services.web.depends_on, ['db', 'cache']);
      console.log('✓ depends_on grammar and YAML generated');
    } finally {
      dependsWorkspace.dispose();
    }

    console.log('Testing Docker Compose network grammar and YAML...');

    const oneNetworkDsl =
      'compose {\n' +
      '  service web {\n' +
      '    image nginx\n' +
      '    network backend\n' +
      '  }\n' +
      '  network backend driver bridge\n' +
      '}\n';
    const oneNetworkParse = grammarServices.parser.LangiumParser.parse(oneNetworkDsl);
    assert.deepEqual(oneNetworkParse.lexerErrors, [], 'One network example should have no lexer errors');
    assert.deepEqual(oneNetworkParse.parserErrors, [], 'One network example should parse');

    const multiNetworkDsl =
      'compose {\n' +
      '  service web {\n' +
      '    image nginx\n' +
      '    network frontend\n' +
      '    network backend\n' +
      '  }\n' +
      '  service api {\n' +
      '    image node\n' +
      '    network backend\n' +
      '  }\n' +
      '  network frontend\n' +
      '  network backend driver bridge\n' +
      '}\n';
    const multiNetworkParse = grammarServices.parser.LangiumParser.parse(multiNetworkDsl);
    assert.deepEqual(multiNetworkParse.lexerErrors, [], 'Multiple network example should have no lexer errors');
    assert.deepEqual(multiNetworkParse.parserErrors, [], 'Multiple network example should parse');

    const networkRefBlockDefinition = blockDefinitions.find((block) => block.type === 'networkref');
    const networkBlockDefinition = blockDefinitions.find((block) => block.type === 'network');
    assert.ok(networkRefBlockDefinition, 'Generated blocks should include network references');
    assert.ok(networkBlockDefinition, 'Generated blocks should include top-level networks');
    assert.equal(
      networkRefBlockDefinition.previousStatement,
      'networkref',
      'NetworkRef block should be stackable only with networkref blocks'
    );
    assert.equal(
      networkBlockDefinition.previousStatement,
      'network',
      'Network block should be stackable only with network blocks'
    );

    const networkWorkspace = new Blockly.Workspace();
    try {
      const networkCompose = networkWorkspace.newBlock('compose');
      const web = networkWorkspace.newBlock('service');
      const api = networkWorkspace.newBlock('service');
      web.setFieldValue('web', 'NAME');
      web.setFieldValue('nginx', 'IMAGE');
      api.setFieldValue('api', 'NAME');
      api.setFieldValue('node', 'IMAGE');
      networkCompose.getInput('SERVICES').connection.connect(web.previousConnection);
      web.nextConnection.connect(api.previousConnection);

      const webBackend = networkWorkspace.newBlock('networkref');
      webBackend.setFieldValue('backend', 'TARGET');
      web.getInput('NETWORKS').connection.connect(webBackend.previousConnection);

      const backendNetwork = networkWorkspace.newBlock('network');
      backendNetwork.setFieldValue('backend', 'NAME');
      backendNetwork.setFieldValue('bridge', 'DRIVER');
      networkCompose.getInput('NETWORKS').connection.connect(backendNetwork.previousConnection);

      const oneNetworkYaml = generator.workspaceToCode(networkWorkspace);
      assert.equal(
        oneNetworkYaml,
        'services:\n' +
        '  web:\n' +
        '    image: nginx\n' +
        '    networks:\n' +
        '      - backend\n' +
        '  api:\n' +
        '    image: node\n' +
        'networks:\n' +
        '  backend:\n' +
        '    driver: bridge\n',
        'One Docker network should generate service references and a top-level network definition.'
      );
      assert.deepEqual(parse(oneNetworkYaml), {
        services: {
          web: { image: 'nginx', networks: ['backend'] },
          api: { image: 'node' }
        },
        networks: {
          backend: { driver: 'bridge' }
        }
      });

      const webFrontend = networkWorkspace.newBlock('networkref');
      webFrontend.setFieldValue('frontend', 'TARGET');
      webBackend.nextConnection.connect(webFrontend.previousConnection);
      const apiBackend = networkWorkspace.newBlock('networkref');
      apiBackend.setFieldValue('backend', 'TARGET');
      api.getInput('NETWORKS').connection.connect(apiBackend.previousConnection);
      const frontendNetwork = networkWorkspace.newBlock('network');
      frontendNetwork.setFieldValue('frontend', 'NAME');
      frontendNetwork.setFieldValue('', 'DRIVER');
      backendNetwork.nextConnection.connect(frontendNetwork.previousConnection);

      const multiNetworkYaml = generator.workspaceToCode(networkWorkspace);
      assert.equal(
        multiNetworkYaml,
        'services:\n' +
        '  web:\n' +
        '    image: nginx\n' +
        '    networks:\n' +
        '      - backend\n' +
        '      - frontend\n' +
        '  api:\n' +
        '    image: node\n' +
        '    networks:\n' +
        '      - backend\n' +
        'networks:\n' +
        '  backend:\n' +
        '    driver: bridge\n' +
        '  frontend:\n',
        'Multiple Docker network references and definitions should preserve stack order.'
      );
      assert.deepEqual(parse(multiNetworkYaml), {
        services: {
          web: { image: 'nginx', networks: ['backend', 'frontend'] },
          api: { image: 'node', networks: ['backend'] }
        },
        networks: {
          backend: { driver: 'bridge' },
          frontend: null
        }
      });
      console.log('✓ network grammar and YAML generated');
    } finally {
      networkWorkspace.dispose();
    }

    console.log('Testing one Docker Compose port mapping...');

    const onePortWorkspace = new Blockly.Workspace();
    const onePortCompose = onePortWorkspace.newBlock('compose');
    const onePortService = onePortWorkspace.newBlock('service');

    onePortService.setFieldValue('frontend', 'NAME');
    onePortService.setFieldValue('nginx', 'IMAGE');

    const onePortBlock = onePortWorkspace.newBlock('port');
    onePortBlock.setFieldValue('8080', 'HOST_PORT');
    onePortBlock.setFieldValue('80', 'CONTAINER_PORT');

    onePortCompose.getInput('SERVICES')?.connection.connect(
      onePortService.previousConnection
    );
    onePortService.getInput('PORTS')?.connection.connect(
      onePortBlock.previousConnection
    );

    const onePortYaml = generator.workspaceToCode(onePortWorkspace);

    assert.equal(
      onePortYaml,
      'services:\n' +
      '  frontend:\n' +
      '    image: nginx\n' +
      '    ports:\n' +
      '      - "8080:80"\n',
      'One Docker port mapping should generate a single quoted short-syntax port entry.'
    );

    console.log('✓ one port mapping generated');

    console.log('Testing multiple Docker Compose port mappings...');

    const multiPortWorkspace = new Blockly.Workspace();
    const multiPortCompose = multiPortWorkspace.newBlock('compose');
    const multiPortService = multiPortWorkspace.newBlock('service');

    multiPortService.setFieldValue('frontend', 'NAME');
    multiPortService.setFieldValue('nginx', 'IMAGE');

    const port8080 = multiPortWorkspace.newBlock('port');
    port8080.setFieldValue('8080', 'HOST_PORT');
    port8080.setFieldValue('80', 'CONTAINER_PORT');

    const port8443 = multiPortWorkspace.newBlock('port');
    port8443.setFieldValue('8443', 'HOST_PORT');
    port8443.setFieldValue('443', 'CONTAINER_PORT');

    multiPortCompose.getInput('SERVICES')?.connection.connect(
      multiPortService.previousConnection
    );
    multiPortService.getInput('PORTS')?.connection.connect(
      port8080.previousConnection
    );
    port8080.nextConnection.connect(port8443.previousConnection);

    const multiPortYaml = generator.workspaceToCode(multiPortWorkspace);

    assert.equal(
      multiPortYaml,
      'services:\n' +
      '  frontend:\n' +
      '    image: nginx\n' +
      '    ports:\n' +
      '      - "8080:80"\n' +
      '      - "8443:443"\n',
      'Multiple Docker port mappings should preserve stack order and emit short syntax.'
    );

    console.log('✓ multiple port mappings generated');

    console.log('Testing services with no ports remain image-only...');

    const noPortWorkspace = new Blockly.Workspace();
    const noPortCompose = noPortWorkspace.newBlock('compose');
    const noPortService = noPortWorkspace.newBlock('service');

    noPortService.setFieldValue('frontend', 'NAME');
    noPortService.setFieldValue('nginx', 'IMAGE');

    noPortCompose.getInput('SERVICES')?.connection.connect(
      noPortService.previousConnection
    );

    const noPortYaml = generator.workspaceToCode(noPortWorkspace);

    assert.equal(
      noPortYaml,
      'services:\n' +
      '  frontend:\n' +
      '    image: nginx\n',
      'A service without any port blocks must keep the existing image-only YAML format.'
    );

    console.log('✓ no-port service remains image-only');

    console.log('Testing multiple services with one service carrying ports...');

    const mixedWorkspace = new Blockly.Workspace();
    const mixedCompose = mixedWorkspace.newBlock('compose');
    const mixedService = mixedWorkspace.newBlock('service');
    const mixedBackend = mixedWorkspace.newBlock('service');

    mixedService.setFieldValue('frontend', 'NAME');
    mixedService.setFieldValue('nginx', 'IMAGE');

    mixedBackend.setFieldValue('backend', 'NAME');
    mixedBackend.setFieldValue('node', 'IMAGE');

    const servicePort = mixedWorkspace.newBlock('port');
    servicePort.setFieldValue('8080', 'HOST_PORT');
    servicePort.setFieldValue('80', 'CONTAINER_PORT');

    mixedCompose.getInput('SERVICES')?.connection.connect(
      mixedService.previousConnection
    );
    mixedService.nextConnection.connect(mixedBackend.previousConnection);
    mixedService.getInput('PORTS')?.connection.connect(
      servicePort.previousConnection
    );

    const mixedYaml = generator.workspaceToCode(mixedWorkspace);

    assert.equal(
      mixedYaml,
      'services:\n' +
      '  frontend:\n' +
      '    image: nginx\n' +
      '    ports:\n' +
      '      - "8080:80"\n' +
      '  backend:\n' +
      '    image: node\n',
      'Multiple services should keep working if one service carries a port mapping.'
    );

    console.log('✓ mixed services with port mapping generated');

    console.log('Testing one Docker Compose environment entry...');

    const oneEnvironmentWorkspace = new Blockly.Workspace();
    const oneEnvironmentCompose = oneEnvironmentWorkspace.newBlock('compose');
    const oneEnvironmentService = oneEnvironmentWorkspace.newBlock('service');

    oneEnvironmentService.setFieldValue('backend', 'NAME');
    oneEnvironmentService.setFieldValue('node:20', 'IMAGE');

    const oneEnvironmentBlock = oneEnvironmentWorkspace.newBlock('environment');
    oneEnvironmentBlock.setFieldValue('NODE_ENV', 'KEY');
    oneEnvironmentBlock.setFieldValue('production', 'VALUE');

    oneEnvironmentCompose.getInput('SERVICES')?.connection.connect(
      oneEnvironmentService.previousConnection
    );
    oneEnvironmentService.getInput('ENVIRONMENT')?.connection.connect(
      oneEnvironmentBlock.previousConnection
    );

    const oneEnvironmentYaml = generator.workspaceToCode(oneEnvironmentWorkspace);

    assert.equal(
      oneEnvironmentYaml,
      'services:\n' +
      '  backend:\n' +
      '    image: node:20\n' +
      '    environment:\n' +
      '      NODE_ENV: production\n',
      'One Docker Compose environment entry should generate a single environment mapping.'
    );

    console.log('✓ one environment entry generated');

    console.log('Testing multiple Docker Compose environment entries...');

    const multiEnvironmentWorkspace = new Blockly.Workspace();
    const multiEnvironmentCompose = multiEnvironmentWorkspace.newBlock('compose');
    const multiEnvironmentService = multiEnvironmentWorkspace.newBlock('service');

    multiEnvironmentService.setFieldValue('backend', 'NAME');
    multiEnvironmentService.setFieldValue('node:20', 'IMAGE');

    const envNode = multiEnvironmentWorkspace.newBlock('environment');
    envNode.setFieldValue('NODE_ENV', 'KEY');
    envNode.setFieldValue('production', 'VALUE');

    const envPort = multiEnvironmentWorkspace.newBlock('environment');
    envPort.setFieldValue('API_PORT', 'KEY');
    envPort.setFieldValue('3000', 'VALUE');

    const envDebug = multiEnvironmentWorkspace.newBlock('environment');
    envDebug.setFieldValue('DEBUG', 'KEY');
    envDebug.setFieldValue('false', 'VALUE');

    multiEnvironmentCompose.getInput('SERVICES')?.connection.connect(
      multiEnvironmentService.previousConnection
    );
    multiEnvironmentService.getInput('ENVIRONMENT')?.connection.connect(
      envNode.previousConnection
    );
    envNode.nextConnection.connect(envPort.previousConnection);
    envPort.nextConnection.connect(envDebug.previousConnection);

    const multiEnvironmentYaml = generator.workspaceToCode(multiEnvironmentWorkspace);

    assert.equal(
      multiEnvironmentYaml,
      'services:\n' +
      '  backend:\n' +
      '    image: node:20\n' +
      '    environment:\n' +
      '      NODE_ENV: production\n' +
      '      API_PORT: "3000"\n' +
      '      DEBUG: false\n',
      'Multiple Docker Compose environment entries should preserve stack order and quote numeric-looking values.'
    );

    console.log('✓ multiple environment entries generated');

    console.log('Testing environment and ports together...');

    const mixedEnvironmentPortsWorkspace = new Blockly.Workspace();
    const mixedEnvironmentPortsCompose = mixedEnvironmentPortsWorkspace.newBlock('compose');
    const mixedEnvironmentPortsService = mixedEnvironmentPortsWorkspace.newBlock('service');

    mixedEnvironmentPortsService.setFieldValue('backend', 'NAME');
    mixedEnvironmentPortsService.setFieldValue('node:20', 'IMAGE');

    const mixedPort = mixedEnvironmentPortsWorkspace.newBlock('port');
    mixedPort.setFieldValue('3000', 'HOST_PORT');
    mixedPort.setFieldValue('3000', 'CONTAINER_PORT');

    const mixedEnv = mixedEnvironmentPortsWorkspace.newBlock('environment');
    mixedEnv.setFieldValue('API_PORT', 'KEY');
    mixedEnv.setFieldValue('3000', 'VALUE');

    mixedEnvironmentPortsCompose.getInput('SERVICES')?.connection.connect(
      mixedEnvironmentPortsService.previousConnection
    );
    mixedEnvironmentPortsService.getInput('PORTS')?.connection.connect(
      mixedPort.previousConnection
    );
    mixedEnvironmentPortsService.getInput('ENVIRONMENT')?.connection.connect(
      mixedEnv.previousConnection
    );

    const mixedEnvironmentPortsYaml = generator.workspaceToCode(mixedEnvironmentPortsWorkspace);

    assert.equal(
      mixedEnvironmentPortsYaml,
      'services:\n' +
      '  backend:\n' +
      '    image: node:20\n' +
      '    ports:\n' +
      '      - "3000:3000"\n' +
      '    environment:\n' +
      '      API_PORT: "3000"\n',
      'A service with both ports and environment entries should produce both YAML sections in place.'
    );

    console.log('✓ ports and environment merged in one service');

    console.log('Testing services with no environment remain image-only...');

    const noEnvironmentWorkspace = new Blockly.Workspace();
    const noEnvironmentCompose = noEnvironmentWorkspace.newBlock('compose');
    const noEnvironmentService = noEnvironmentWorkspace.newBlock('service');

    noEnvironmentService.setFieldValue('backend', 'NAME');
    noEnvironmentService.setFieldValue('node:20', 'IMAGE');

    noEnvironmentCompose.getInput('SERVICES')?.connection.connect(
      noEnvironmentService.previousConnection
    );

    const noEnvironmentYaml = generator.workspaceToCode(noEnvironmentWorkspace);

    assert.equal(
      noEnvironmentYaml,
      'services:\n' +
      '  backend:\n' +
      '    image: node:20\n',
      'A service without any environment blocks must keep the image-only YAML format unchanged.'
    );

    console.log('✓ no-environment service remains image-only');

    console.log('Testing multiple services where one carries environment...');

    const mixedServiceEnvironmentWorkspace = new Blockly.Workspace();
    const mixedServiceEnvironmentCompose = mixedServiceEnvironmentWorkspace.newBlock('compose');
    const mixedServiceEnvironmentService = mixedServiceEnvironmentWorkspace.newBlock('service');
    const mixedServiceEnvironmentBackend = mixedServiceEnvironmentWorkspace.newBlock('service');

    mixedServiceEnvironmentService.setFieldValue('frontend', 'NAME');
    mixedServiceEnvironmentService.setFieldValue('nginx', 'IMAGE');

    mixedServiceEnvironmentBackend.setFieldValue('backend', 'NAME');
    mixedServiceEnvironmentBackend.setFieldValue('node:20', 'IMAGE');

    const envBackend = mixedServiceEnvironmentWorkspace.newBlock('environment');
    envBackend.setFieldValue('NODE_ENV', 'KEY');
    envBackend.setFieldValue('production', 'VALUE');

    mixedServiceEnvironmentCompose.getInput('SERVICES')?.connection.connect(
      mixedServiceEnvironmentService.previousConnection
    );
    mixedServiceEnvironmentService.nextConnection.connect(
      mixedServiceEnvironmentBackend.previousConnection
    );
    mixedServiceEnvironmentBackend.getInput('ENVIRONMENT')?.connection.connect(
      envBackend.previousConnection
    );

    const mixedServiceEnvironmentYaml = generator.workspaceToCode(mixedServiceEnvironmentWorkspace);

    assert.equal(
      mixedServiceEnvironmentYaml,
      'services:\n' +
      '  frontend:\n' +
      '    image: nginx\n' +
      '  backend:\n' +
      '    image: node:20\n' +
      '    environment:\n' +
      '      NODE_ENV: production\n',
      'Multiple services should keep working if one service carries environment entries.'
    );

    console.log('✓ mixed services with environment generated');

    const volumeWorkspace = new Blockly.Workspace();
    try {
      const root = volumeWorkspace.newBlock('compose');
      const backend = volumeWorkspace.newBlock('service');
      backend.setFieldValue('backend', 'NAME');
      backend.setFieldValue('node:20', 'IMAGE');
      root.getInput('SERVICES').connection.connect(backend.previousConnection);
      const base = 'services:\n  backend:\n    image: node:20\n';
      const oneVolume = '    volumes:\n      - "./data:/app/data"\n';
      const check = (label, expected) => {
        const actual = generator.workspaceToCode(volumeWorkspace);
        assert.equal(actual, expected, label);
        assert.deepEqual(parse(actual), parse(expected), label + ' remains parseable');
        console.log('[PASS] Volume YAML: ' + label + ' (exact and parseable)');
      };
      check('no volumes, image-only unchanged', base);
      const volume = volumeWorkspace.newBlock('volume');
      volume.setFieldValue('./data', 'SOURCE');
      volume.setFieldValue('/app/data', 'TARGET');
      backend.getInput('VOLUMES').connection.connect(volume.previousConnection);
      check('one volume with double quotes', base + oneVolume);
      const config = volumeWorkspace.newBlock('volume');
      config.setFieldValue('./config', 'SOURCE');
      config.setFieldValue('/app/config', 'TARGET');
      volume.nextConnection.connect(config.previousConnection);
      check('multiple volumes in stack order', base + oneVolume + '      - "./config:/app/config"\n');
      config.dispose();
      const port = volumeWorkspace.newBlock('port');
      port.setFieldValue('3000', 'HOST_PORT');
      port.setFieldValue('3000', 'CONTAINER_PORT');
      backend.getInput('PORTS').connection.connect(port.previousConnection);
      const env = volumeWorkspace.newBlock('environment');
      env.setFieldValue('NODE_ENV', 'KEY');
      env.setFieldValue('production', 'VALUE');
      backend.getInput('ENVIRONMENT').connection.connect(env.previousConnection);
      const extras = '    ports:\n      - "3000:3000"\n    environment:\n      NODE_ENV: production\n';
      check('ports + environment + volume together', base + extras + oneVolume);
      volume.dispose();
      check('no volumes, port/environment unchanged', base + extras);
      port.dispose();
      env.dispose();
      const onlyVolume = volumeWorkspace.newBlock('volume');
      onlyVolume.setFieldValue('./data', 'SOURCE');
      onlyVolume.setFieldValue('/app/data', 'TARGET');
      backend.getInput('VOLUMES').connection.connect(onlyVolume.previousConnection);
      const frontend = volumeWorkspace.newBlock('service');
      frontend.setFieldValue('frontend', 'NAME');
      frontend.setFieldValue('nginx', 'IMAGE');
      backend.nextConnection.connect(frontend.previousConnection);
      check('multiple services, only one with Volume', base + oneVolume + '  frontend:\n    image: nginx\n');
    } finally {
      volumeWorkspace.dispose();
    }

    oneEnvironmentWorkspace.dispose();
    multiEnvironmentWorkspace.dispose();
    mixedEnvironmentPortsWorkspace.dispose();
    noEnvironmentWorkspace.dispose();
    mixedServiceEnvironmentWorkspace.dispose();

    onePortWorkspace.dispose();
    multiPortWorkspace.dispose();
    noPortWorkspace.dispose();
    mixedWorkspace.dispose();
  } finally {
    workspace.dispose();
  }
}

try {
  console.log('\nDocker Compose YAML Generation Tests\n');

  await testComposeYamlGeneration();

  console.log(
    '\n✓ All Docker Compose YAML generation tests passed\n'
  );
} catch (error) {
  console.error(
    '\n✗ Docker Compose YAML generation test failed\n'
  );

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}
