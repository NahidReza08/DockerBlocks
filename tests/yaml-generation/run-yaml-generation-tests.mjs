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
