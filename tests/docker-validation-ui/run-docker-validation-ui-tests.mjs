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
const dockerValidationFile = path.join(
  repoRoot,
  'blockly_app/src/docker-validation.ts'
);
const validationUiFile = path.join(
  repoRoot,
  'blockly_app/src/validation-ui.ts'
);
const appBootstrapFile = path.join(
  repoRoot,
  'blockly_app/src/app-bootstrap.ts'
);

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assertDockerValidationRules(source, context) {
  assert.ok(source.includes("block.type === 'restart'"), `${context}: validation inspects Restart blocks`);
  assert.ok(source.includes('Restart policy must be one of: no, always, on-failure, unless-stopped.'),
    `${context}: malformed Restart policies are rejected`);
  console.log(`[PASS] ${context}: Restart policy validation uses the shared validator`);
  assert.ok(source.includes("block.type === 'healthcheck'"), `${context}: validation inspects Healthcheck blocks`);
  assert.ok(source.includes('Healthcheck command is required.'), `${context}: blank Healthcheck commands are rejected`);
  assert.ok(source.includes('Healthcheck retries must be an integer greater than or equal to 1.'),
    `${context}: invalid Healthcheck retries are rejected`);
  console.log(`[PASS] ${context}: Healthcheck validation uses the shared validator`);
  const networkValidation = source.match(/if \(block\.type === 'network'\) \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(networkValidation, `${context}: validation inspects Network blocks`);
  assert.ok(networkValidation.includes("getFieldValue('NAME')"), `${context}: Network NAME`);
  assert.ok(networkValidation.includes('Network name is required.'), `${context}: Network name is required.`);
  assert.ok(source.includes('Duplicate network name'), `${context}: duplicate Network names are rejected`);
  assert.ok(source.includes("'networkref'"), `${context}: validation inspects NetworkRef blocks`);
  assert.ok(source.includes('Unknown network'), `${context}: unknown NetworkRef targets are rejected`);
  console.log(`[PASS] ${context}: Network and NetworkRef errors use the shared validator`);
  const volumeValidation = source.match(/if \(block\.type === 'volume'\) \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(volumeValidation, `${context}: validation inspects Volume blocks`);
  for (const field of ['SOURCE', 'TARGET']) {
    assert.ok(volumeValidation.includes(`getFieldValue('${field}')`), `${context}: Volume ${field}`);
  }
  for (const message of ['Volume source is required.', 'Volume target is required.']) {
    assert.ok(volumeValidation.includes(message), `${context}: ${message}`);
  }
  assert.equal((volumeValidation.match(/block\.id/g) ?? []).length, 2,
    `${context}: both Volume errors identify their Volume block`);
  console.log(`[PASS] ${context}: Volume SOURCE/TARGET errors use blockId: block.id`);
  assert.match(
    source,
    /function collectDockerValidationErrors\(/,
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
    /function requiredError\(message: string, blockId: string\)[\s\S]*blockId[\s\S]*requiredError\([\s\S]*block\.id/,
    `${context}: Docker validation errors should identify their Blockly block.`
  );
}

function assertSharedValidationPipeline(appBootstrapSource, validationUiSource) {
  assert.match(
    appBootstrapSource,
    /\.\.\.validationErrors,\s*\.\.\.collectDockerValidationErrors\(workspace\)/,
    'Bootstrap: grammar and Docker errors should enter the same validation state.'
  );

  assert.match(
    appBootstrapSource,
    /validationUi\.refresh\(collectValidationErrors\(\)\)/,
    'Bootstrap: shared validation state should be refreshed from one call site.'
  );

  assert.match(
    validationUiSource,
    /validationErrors\.forEach\(\(error\) => \{[\s\S]*?error\.blockId/,
    'Validation UI: Blockly warnings should be driven by captured validation errors.'
  );

  assert.match(
    validationUiSource,
    /block\.setWarningText\(/,
    'Validation UI: existing Blockly warning UI should display validation errors.'
  );
}

console.log(
  '\nDocker Validation UI Integration Tests\n'
);

console.log('Testing generated Blockly application...');

assert.match(
  read(mainTsFile),
  /bootstrapBlocklyApp/,
  'Generated main.ts should call the handwritten app bootstrap.'
);

assertDockerValidationRules(
  read(dockerValidationFile),
  'Docker validation module'
);

assertSharedValidationPipeline(
  read(appBootstrapFile),
  read(validationUiFile)
);

console.log(
  '[PASS] Docker errors use the existing validation UI pipeline'
);

console.log('Testing generator template...');

assert.match(
  read(templateFile),
  /bootstrapBlocklyApp/,
  'Generator template should emit a bootstrap call instead of inline app logic.'
);

console.log(
  '[PASS] Docker validation UI integration survives regeneration'
);

console.log(
  '\n[PASS] All Docker validation UI integration tests passed\n'
);
