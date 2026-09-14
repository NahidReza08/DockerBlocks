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

async function loadGeneratedGenerator(generatorTs) {
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

  fs.writeFileSync(
    tempModule,
    transpiled.outputText,
    'utf8'
  );

  try {
    return await import(
      pathToFileURL(tempModule).href + `?t=${Date.now()}`
    );
  } finally {
    fs.unlinkSync(tempModule);
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

    onePortWorkspace.dispose();
    multiPortWorkspace.dispose();
    noPortWorkspace.dispose();
    mixedWorkspace.dispose();
  } finally {
    workspace.dispose();
  }
}

try {
  console.log('\nS2-08 Docker Compose YAML Generation Tests\n');

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
