import assert from 'node:assert/strict';
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

  const compose = blocks.find(
    (block) => block.type === 'compose'
  );

  const service = blocks.find(
    (block) => block.type === 'service'
  );

  assert.ok(
    compose,
    'Compose block should be generated.'
  );

  assert.ok(
    service,
    'Service block should be generated.'
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
  console.log('\nS2-06 Block Connection Rule Tests\n');

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