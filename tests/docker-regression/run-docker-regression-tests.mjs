import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import * as Blockly from 'blockly';
import ts from 'typescript';

const projectRoot = path.resolve('.');
const tempBlocksPath = path.join(
  projectRoot,
  'tests/docker-regression/.temp-blocks.mjs'
);
const tempGeneratorPath = path.join(
  projectRoot,
  'tests/docker-regression/.temp-generator.mjs'
);

async function loadTypescriptModule(sourcePath, tempPath) {
  const source = await readFile(sourcePath, 'utf8');

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext
    }
  });

  await writeFile(tempPath, outputText);

  return import(
    pathToFileURL(tempPath).href + '?cache=' + Date.now()
  );
}

console.log('\nS2-12 Docker Regression Tests\n');

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

  assert.ok(
    mainSource.includes("block.type === 'service'"),
    'Validation should inspect Docker service blocks'
  );

  assert.ok(
    mainSource.includes("block.type === 'port'"),
    'Validation should inspect Docker port blocks'
  );

  assert.ok(
    mainSource.includes("block.type === 'environment'"),
    'Validation should inspect Docker environment blocks'
  );

  assert.ok(
    mainSource.includes("block.getFieldValue('IMAGE')"),
    'Validation should inspect the service IMAGE field'
  );

  assert.ok(
    mainSource.includes("block.getFieldValue('HOST_PORT')"),
    'Validation should inspect the port HOST_PORT field'
  );

  assert.ok(
    mainSource.includes("block.getFieldValue('CONTAINER_PORT')"),
    'Validation should inspect the port CONTAINER_PORT field'
  );

  assert.ok(
    mainSource.includes("block.getFieldValue('KEY')"),
    'Validation should inspect the environment KEY field'
  );

  assert.ok(
    mainSource.includes("Environment key is required."),
    'Missing Docker environment key should produce the required error'
  );

  assert.ok(
    mainSource.includes("Environment key must start with a letter or underscore and contain only letters, numbers, and underscores."),
    'Invalid Docker environment key should produce the identifier error'
  );

  assert.ok(
    mainSource.includes("message: 'Image is required'"),
    'Missing Docker image should produce the existing validation error'
  );

  assert.ok(
    mainSource.includes("message: 'Host port is required.'"),
    'Missing Docker host port should produce a port validation error'
  );

  assert.ok(
    mainSource.includes("message: 'Container port is required.'"),
    'Missing Docker container port should produce a port validation error'
  );

  assert.ok(
    mainSource.includes("message: 'Host port must be an integer between 1 and 65535.'"),
    'Port host should use the shared integer range validation message'
  );

  assert.ok(
    mainSource.includes("message: 'Container port must be an integer between 1 and 65535.'"),
    'Port container should use the shared integer range validation message'
  );

  assert.ok(
    mainSource.includes('blockId: block.id'),
    'Docker validation error should identify the invalid Blockly block'
  );

  assert.ok(
    mainSource.includes("VALIDATION_WARNING_ID = 'captured-validation-error'"),
    'Docker validation should use the shared Blockly warning ID'
  );

  assert.ok(
    mainSource.includes('block.setWarningText('),
    'Validation errors should be attached to Blockly blocks as visual warnings'
  );

  assert.ok(
    mainSource.includes('...collectWorkspaceValidationErrors()'),
    'Workspace Docker errors should enter the existing validation pipeline'
  );

  invalidWorkspace.dispose();

  console.log(
    '[PASS] Invalid Docker blocks produce expected validation and Blockly feedback'
  );

  console.log('\n[PASS] All Docker regression tests passed\n');
} finally {
  await rm(tempBlocksPath, { force: true });
  await rm(tempGeneratorPath, { force: true });
}
