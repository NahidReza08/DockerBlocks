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
const dockerGrammar = path.join(repoRoot, 'generate_blockly/input/docker-compose.langium');

function extractBlockDefinitions(blocksTs) {
  const marker = 'Blockly.defineBlocksWithJsonArray(';
  const markerIndex = blocksTs.indexOf(marker);
  const arrayStart = blocksTs.indexOf('[', markerIndex);
  const arrayEnd = blocksTs.indexOf('\n  );', arrayStart);
  return JSON.parse(blocksTs.slice(arrayStart, arrayEnd).trim());
}

function blockInputs(block) {
  return Object.entries(block)
    .filter(([key]) => /^args\d+$/.test(key))
    .flatMap(([, args]) => args);
}

function findInput(block, name) {
  return blockInputs(block).find((input) => input.name === name);
}

try {
  console.log('\nBlock Connection Rule Tests\n');
  console.log('Testing Docker block connection rules...');

  const grammar = await loadGrammar(dockerGrammar);
  validateGrammar(grammar);
  const blocks = extractBlockDefinitions(generateBlocksTs(buildIR(grammar)));
  const byType = Object.fromEntries(blocks.map((block) => [block.type, block]));

  for (const type of [
    'compose', 'service', 'image', 'build', 'restart', 'healthcheck',
    'dependency', 'networkref', 'network', 'port', 'environment', 'volume'
  ]) {
    assert.ok(byType[type], `${type} block should be generated`);
  }

  assert.equal(findInput(byType.compose, 'ELEMENTS')?.check, 'compose_element');
  assert.equal(findInput(byType.compose, 'ELEMENTS')?.type, 'input_statement');
  assert.equal(findInput(byType.service, 'CONFIG')?.check, 'service_config');
  assert.equal(findInput(byType.service, 'CONFIG')?.type, 'input_statement');
  assert.match(byType.compose.tooltip, /Supports: Service, Network/);
  assert.match(byType.service.tooltip, /Supports: Image, Build, Ports/);

  assert.equal(byType.service.previousStatement, 'compose_element');
  assert.equal(byType.service.nextStatement, 'compose_element');
  assert.equal(byType.network.previousStatement, 'compose_element');
  assert.equal(byType.network.nextStatement, 'compose_element');

  for (const type of [
    'image', 'build', 'restart', 'healthcheck',
    'dependency', 'networkref', 'port', 'environment', 'volume'
  ]) {
    assert.equal(byType[type].previousStatement, 'service_config', `${type} attaches to Service CONFIG`);
    assert.equal(byType[type].nextStatement, 'service_config', `${type} stacks in Service CONFIG`);
  }

  Blockly.defineBlocksWithJsonArray(blocks);
  const workspace = new Blockly.Workspace();
  try {
    const compose = workspace.newBlock('compose');
    const service = workspace.newBlock('service');
    const network = workspace.newBlock('network');
    const image = workspace.newBlock('image');
    const port = workspace.newBlock('port');
    const environment = workspace.newBlock('environment');
    const restart = workspace.newBlock('restart');

    compose.getInput('ELEMENTS').connection.connect(service.previousConnection);
    service.nextConnection.connect(network.previousConnection);
    service.getInput('CONFIG').connection.connect(image.previousConnection);
    image.nextConnection.connect(port.previousConnection);
    port.nextConnection.connect(environment.previousConnection);
    environment.nextConnection.connect(restart.previousConnection);

    assert.equal(compose.getInputTargetBlock('ELEMENTS'), service);
    assert.equal(service.getNextBlock(), network);
    assert.equal(service.getInputTargetBlock('CONFIG'), image);
    assert.equal(image.getNextBlock(), port);
    assert.equal(port.getNextBlock(), environment);
    assert.equal(environment.getNextBlock(), restart);

    assert.equal(
      workspace.connectionChecker.doTypeChecks(
        compose.getInput('ELEMENTS').connection,
        port.previousConnection
      ),
      false,
      'Compose rejects service configuration blocks directly'
    );
    assert.equal(
      workspace.connectionChecker.doTypeChecks(
        service.getInput('CONFIG').connection,
        network.previousConnection
      ),
      false,
      'Service rejects top-level Network blocks'
    );
    assert.equal(
      workspace.connectionChecker.doTypeChecks(
        service.getInput('CONFIG').connection,
        service.previousConnection
      ),
      false,
      'Service rejects nested Service blocks'
    );
  } finally {
    workspace.dispose();
  }

  console.log('[PASS] Dynamic Compose and Service connection rules are enforced');
  console.log('\n✓ All block connection rule tests passed\n');
} catch (error) {
  console.error('\n✗ Block connection rule test failed\n');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
