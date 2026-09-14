import assert from 'node:assert/strict';
import * as Blockly from 'blockly';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGrammar } from '../../generate_blockly/src/grammar-loader.js';
import { validateGrammar } from '../../generate_blockly/src/validator.js';
import { buildIR } from '../../generate_blockly/src/ir-builder.js';
import { generateBlocksTs } from '../../generate_blockly/src/blockly-ts-target.js';

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
    'Generated blocks.ts should contain a block definition array.'
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

async function testDockerConnectionRules() {
  console.log('Testing Docker block connection rules...');

  const grammar = await loadGrammar(dockerGrammar);
  validateGrammar(grammar);

  const ir = buildIR(grammar);
  const blocksTs = generateBlocksTs(ir);
  const blocks = extractBlockDefinitions(blocksTs);

  const volume = blocks.find((block) => block.type === 'volume');
  assert.ok(volume, 'Volume should be generated');
  assert.equal(volume.previousStatement, 'volume');
  assert.equal(volume.nextStatement, 'volume');
  Blockly.defineBlocksWithJsonArray(blocks);
  const workspace = new Blockly.Workspace();
  try {
    const service = workspace.newBlock('service');
    const first = workspace.newBlock('volume');
    const second = workspace.newBlock('volume');
    const port = workspace.newBlock('port');
    const environment = workspace.newBlock('environment');
    const compose = workspace.newBlock('compose');
    const volumes = service.getInput('VOLUMES');
    assert.ok(volumes, 'Service has VOLUMES');
    assert.deepEqual(volumes.connection.getCheck(), ['volume']);
    assert.deepEqual(first.previousConnection.getCheck(), ['volume']);
    assert.deepEqual(first.nextConnection.getCheck(), ['volume']);
    volumes.connection.connect(first.previousConnection);
    first.nextConnection.connect(second.previousConnection);
    assert.equal(service.getInputTargetBlock('VOLUMES'), first);
    assert.equal(first.getNextBlock(), second);
    console.log('[PASS] Service VOLUMES accepts Volume; Volume stacks with volume previous/next types');
    for (const [label, parent, child] of [
      ['Volume cannot connect to PORTS', service.getInput('PORTS').connection, first.previousConnection],
      ['Volume cannot connect to ENVIRONMENT', service.getInput('ENVIRONMENT').connection, first.previousConnection],
      ['Port cannot connect to VOLUMES', volumes.connection, port.previousConnection],
      ['Environment cannot connect to VOLUMES', volumes.connection, environment.previousConnection],
      ['Volume cannot connect to Compose SERVICES', compose.getInput('SERVICES').connection, first.previousConnection]
    ]) {
      assert.equal(workspace.connectionChecker.doTypeChecks(parent, child), false, label);
      console.log('[PASS] ' + label);
    }
  } finally {
    workspace.dispose();
  }

  const compose = blocks.find(
    (block) => block.type === 'compose'
  );

  const service = blocks.find(
    (block) => block.type === 'service'
  );

  const port = blocks.find(
    (block) => block.type === 'port'
  );

  const environment = blocks.find(
    (block) => block.type === 'environment'
  );

  assert.ok(
    compose,
    'Compose block should be generated.'
  );

  assert.ok(
    service,
    'Service block should be generated.'
  );

  assert.ok(
    port,
    'Port block should be generated.'
  );

  assert.ok(
    environment,
    'Environment block should be generated.'
  );

  assert.equal(
    port.previousStatement,
    'port',
    'Port should stack above another Port-compatible block.'
  );

  assert.equal(
    port.nextStatement,
    'port',
    'Port should stack below another Port-compatible block.'
  );

  const servicePortsInput = service.args3?.find(
    (input) => input.name === 'PORTS'
  );

  assert.ok(
    servicePortsInput,
    'Service should expose a PORTS statement input for stackable Port blocks.'
  );

  assert.equal(
    servicePortsInput.type,
    'input_statement',
    'Service PORTS input should be a Blockly statement input.'
  );

  assert.equal(
    servicePortsInput.check,
    'port',
    'Service PORTS input should only accept Port blocks.'
  );

  const serviceEnvironmentInput = service.args4?.find(
    (input) => input.name === 'ENVIRONMENT'
  );

  assert.ok(
    serviceEnvironmentInput,
    'Service should expose an ENVIRONMENT statement input for stackable Environment blocks.'
  );

  assert.equal(
    serviceEnvironmentInput.type,
    'input_statement',
    'Service ENVIRONMENT input should be a Blockly statement input.'
  );

  assert.equal(
    serviceEnvironmentInput.check,
    'environment',
    'Service ENVIRONMENT input should only accept Environment blocks.'
  );

  assert.equal(
    environment.previousStatement,
    'environment',
    'Environment should stack above another Environment-compatible block.'
  );

  assert.equal(
    environment.nextStatement,
    'environment',
    'Environment should stack below another Environment-compatible block.'
  );

  assert.equal(
    port.previousStatement,
    'port',
    'Port should not attach to an Environment stack.'
  );

  assert.equal(
    port.nextStatement,
    'port',
    'Port should not accept Environment stack connections.'
  );

  assert.equal(
    compose.previousStatement,
    undefined,
    'Compose must not accept Environment blocks directly.'
  );

  const composeInputs = Object.entries(compose)
    .filter(([key]) => /^args\d+$/.test(key))
    .flatMap(([, args]) => args);

  const servicesInput = composeInputs.find(
    (input) => input.name === 'SERVICES'
  );

  assert.ok(
    servicesInput,
    'Compose should contain a SERVICES statement input.'
  );

  assert.equal(
    servicesInput.type,
    'input_statement',
    'Compose SERVICES should be a statement input.'
  );

  assert.equal(
    servicesInput.check,
    'service',
    'Compose SERVICES should accept only Service blocks.'
  );

  assert.equal(
    service.previousStatement,
    'service',
    'Service should connect to a Service-compatible parent or sibling.'
  );

  assert.equal(
    service.nextStatement,
    'service',
    'Service should allow another Service below it.'
  );

  assert.equal(
    compose.previousStatement,
    undefined,
    'Compose must not connect below a Service.'
  );

  assert.equal(
    compose.nextStatement,
    undefined,
    'Compose must not behave like a Service stack block.'
  );

  console.log('✓ Compose accepts Service blocks');
  console.log('✓ Service blocks can stack with Service blocks');
  console.log('✓ Compose cannot be nested in a Service stack');
  console.log('✓ Docker block connection rules passed');
}

try {
  console.log('\nBlock Connection Rule Tests\n');

  await testDockerConnectionRules();

  console.log(
    '\n✓ All block connection rule tests passed\n'
  );
} catch (error) {
  console.error(
    '\n✗ Block connection rule test failed\n'
  );

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}
