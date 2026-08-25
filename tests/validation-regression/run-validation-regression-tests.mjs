import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const validGrammar =
  'generate_blockly/input/grammar.langium';

const invalidGrammar =
  'tests/validation-regression/invalid-grammar.langium';

const validationErrorFile =
  'blockly_app/src/validation-errors.ts';

const mainTsFile =
  'blockly_app/src/main.ts';

const generatedFiles = [
  'blockly_app/src/blocks.ts',
  'blockly_app/src/generator.ts',
  'blockly_app/src/main.ts',
  'blockly_app/src/validation-errors.ts'
];

function absolute(relativePath) {
  return path.join(repoRoot, relativePath);
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false
  });
}

function runParser(grammarPath) {
  return run(process.execPath, [
    'generate_blockly/src/parse.js',
    grammarPath
  ]);
}

function runTypeScriptCheck() {
  return run(process.execPath, [
    'node_modules/typescript/bin/tsc',
    '--noEmit'
  ]);
}

function combinedOutput(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function backupGeneratedFiles() {
  return new Map(
    generatedFiles.map((file) => [
      file,
      fs.readFileSync(absolute(file), 'utf8')
    ])
  );
}

function restoreGeneratedFiles(backups) {
  for (const [file, contents] of backups) {
    fs.writeFileSync(absolute(file), contents, 'utf8');
  }
}

function assertTypeScriptPasses(context) {
  const result = runTypeScriptCheck();

  assert.equal(
    result.status,
    0,
    `${context}: TypeScript compilation failed:\n` +
      combinedOutput(result)
  );
}

function testValidGrammar() {
  console.log('Testing valid grammar...');

  const result = runParser(validGrammar);
  const output = combinedOutput(result);

  assert.equal(
    result.status,
    0,
    `Valid grammar should succeed:\n${output}`
  );

  assert.match(
    output,
    /Generated \d+ blocks/,
    'Valid grammar should generate Blockly blocks.'
  );

  const validationErrors = fs.readFileSync(
    absolute(validationErrorFile),
    'utf8'
  );

  assert.equal(
    validationErrors.trim(),
    'export const validationErrors = [];',
    'Valid grammar should clear validation errors.'
  );

  const mainTs = fs.readFileSync(
    absolute(mainTsFile),
    'utf8'
  );

  assert.match(
    mainTs,
    /createValidationErrorElement/,
    'Generated main.ts should preserve rich validation-error rendering.'
  );

  assert.match(
    mainTs,
    /validation-error-title/,
    'Generated main.ts should preserve validation error styling hooks.'
  );

  assert.match(
    mainTs,
    /showNoValidationErrors/,
    'Generated main.ts should preserve the no-error UI state.'
  );

  assertTypeScriptPasses('Valid grammar');

  console.log('✓ Valid grammar regression passed');
}

function testInvalidGrammar() {
  console.log('Testing invalid grammar...');

  const result = runParser(invalidGrammar);
  const output = combinedOutput(result);

  assert.notEqual(
    result.status,
    0,
    'Invalid grammar should fail validation.'
  );

  assert.match(
    output,
    /Generation failed with \d+ validation error/,
    'Invalid grammar should report validation failure.'
  );

  assert.match(
    output,
    /\[parser\]/,
    'Invalid grammar should report a parser error.'
  );

  const validationErrors = fs.readFileSync(
    absolute(validationErrorFile),
    'utf8'
  );

  assert.match(
    validationErrors,
    /"type": "parser"/,
    'Parser error should be captured in validation-errors.ts.'
  );

  assert.match(
    validationErrors,
    /"severity": "error"/,
    'Captured validation error should have error severity.'
  );

  assert.doesNotMatch(
    validationErrors,
    /"line": null/,
    'Unavailable line numbers must not be serialized as null.'
  );

  assert.doesNotMatch(
    validationErrors,
    /"column": null/,
    'Unavailable column numbers must not be serialized as null.'
  );

  const mainTs = fs.readFileSync(
    absolute(mainTsFile),
    'utf8'
  );

  assert.match(
    mainTs,
    /showCapturedValidationErrors/,
    'Blockly UI should contain captured-error display logic.'
  );

  assert.match(
    mainTs,
    /createValidationErrorElement/,
    'Blockly UI should render captured validation errors.'
  );

  assertTypeScriptPasses('Invalid grammar');

  console.log('✓ Invalid grammar regression passed');
}

const backups = backupGeneratedFiles();

try {
  console.log('\nS1-10 Validation Regression Tests\n');

  testValidGrammar();
  testInvalidGrammar();

  console.log(
    '\n✓ All validation regression tests passed\n'
  );
} catch (error) {
  console.error('\n✗ Validation regression test failed\n');

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
} finally {
  restoreGeneratedFiles(backups);
}