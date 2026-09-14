import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const mainTsFile = path.join(
  repoRoot,
  'blockly_app/src/main.ts'
);

const templateFile = path.join(
  repoRoot,
  'generate_blockly/src/blockly-ts-target.js'
);

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assertDockerUsesSharedValidationPipeline(
  source,
  context
) {
  const volumeValidation = source.match(/if \(block\.type === 'volume'\) \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(volumeValidation, `${context}: validation inspects Volume blocks`);
  for (const field of ['SOURCE', 'TARGET']) {
    assert.ok(volumeValidation.includes(`getFieldValue('${field}')`), `${context}: Volume ${field}`);
  }
  for (const message of ['Volume source is required.', 'Volume target is required.']) {
    assert.ok(volumeValidation.includes(message), `${context}: ${message}`);
  }
  assert.equal((volumeValidation.match(/blockId:\s*block\.id/g) ?? []).length, 2,
    `${context}: both Volume errors identify their Volume block`);
  console.log(`[PASS] ${context}: Volume SOURCE/TARGET errors use blockId: block.id`);
  assert.match(
    source,
    /function collectWorkspaceValidationErrors\(\): UiValidationError\[\]/,
    `${context}: Docker validation should produce UiValidationError objects.`
  );

  assert.match(
    source,
    /if \(block\.type === 'port'\)/,
    `${context}: Docker validation should inspect port blocks.`
  );

  assert.match(
    source,
    /block\.getFieldValue\('HOST_PORT'\)/,
    `${context}: Docker validation should inspect the port host field.`
  );

  assert.match(
    source,
    /block\.getFieldValue\('CONTAINER_PORT'\)/,
    `${context}: Docker validation should inspect the port container field.`
  );

  assert.match(
    source,
    /Host port is required\./,
    `${context}: Docker validation should surface the host-required port message.`
  );

  assert.match(
    source,
    /Container port is required\./,
    `${context}: Docker validation should surface the container-required port message.`
  );

  assert.match(
    source,
    /Host port must be an integer between 1 and 65535\./,
    `${context}: Docker validation should surface the host numeric range message.`
  );

  assert.match(
    source,
    /Container port must be an integer between 1 and 65535\./,
    `${context}: Docker validation should surface the container numeric range message.`
  );

  assert.match(
    source,
    /Environment key is required\./,
    `${context}: Docker validation should surface the Environment key required message.`
  );

  assert.match(
    source,
    /Environment key must start with a letter or underscore and contain only letters, numbers, and underscores\./,
    `${context}: Docker validation should surface the Environment key identifier message.`
  );

  assert.match(
    source,
    /blockId:\s*block\.id/,
    `${context}: Docker validation errors should identify their Blockly block.`
  );

  assert.match(
    source,
    /refreshValidationState\(\[\s*\.\.\.validationErrors,\s*\.\.\.collectWorkspaceValidationErrors\(\)\s*\]\);/,
    `${context}: grammar and Docker errors should enter the same validation state.`
  );

  assert.match(
    source,
    /function refreshValidationState\([\s\S]*?showCapturedValidationErrors\(\);[\s\S]*?updateBlockValidationWarnings\(\);/,
    `${context}: shared validation state should update both the error UI and Blockly warnings.`
  );

  assert.match(
    source,
    /capturedValidationErrors\.forEach\(\(error\) => \{[\s\S]*?error\.blockId/,
    `${context}: Blockly warnings should be driven by captured validation errors.`
  );

  assert.match(
    source,
    /block\.setWarningText\(/,
    `${context}: existing Blockly warning UI should display validation errors.`
  );
}

console.log(
  '\nS2-10 Docker Validation UI Integration Tests\n'
);

console.log('Testing generated Blockly application...');

assertDockerUsesSharedValidationPipeline(
  read(mainTsFile),
  'Generated main.ts'
);

console.log(
  '[PASS] Docker errors use the existing validation UI pipeline'
);

console.log('Testing generator template...');

assertDockerUsesSharedValidationPipeline(
  read(templateFile),
  'Generator template'
);

console.log(
  '[PASS] Docker validation UI integration survives regeneration'
);

console.log(
  '\n[PASS] All Docker validation UI integration tests passed\n'
);
