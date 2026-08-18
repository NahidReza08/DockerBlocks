import * as Blockly from 'blockly';
import { defineBlocks } from './blocks';
import { generator } from './generator';
import { validationErrors } from './validation-errors';

type UiValidationError = {
  type: string;
  message: string;
  severity: string;
  line?: number;
  column?: number;
};

const capturedValidationErrors = validationErrors as UiValidationError[];

// define custom blocks before setting up the workspace
defineBlocks();

// set up the Blockly workspace
const workspace = Blockly.inject('blocklyDiv', {
  toolbox: {
    "kind": "flyoutToolbox",
    "contents": [
      { "kind": "block", "type": "project" },
      { "kind": "block", "type": "metadata" },
      { "kind": "block", "type": "member" },
      { "kind": "block", "type": "module" },
      { "kind": "block", "type": "component" },
      { "kind": "block", "type": "task" },
      { "kind": "block", "type": "subtask" }
    ]
  }
});

// show code and errors
const codeOutput = document.getElementById('codeOutput');
const errorOutput = document.getElementById('errorOutput');

function formatValidationError(error: UiValidationError): string {
  let location = '';

  if (error.line !== undefined) {
    location = ' at line ' + error.line;

    if (error.column !== undefined) {
      location += ', column ' + error.column;
    }
  }

  return '[' + error.type + '] ' + error.message + location;
}

function showCapturedValidationErrors() {
  if (!errorOutput) return;

  if (capturedValidationErrors.length === 0) {
    errorOutput.textContent = 'No errors detected.';
    return;
  }

  errorOutput.textContent =
    capturedValidationErrors.map(formatValidationError).join('\n');
}

function generateCode() {
  try {
    const code = generator.workspaceToCode(workspace);
    if (codeOutput) codeOutput.textContent = code;

    if (errorOutput && capturedValidationErrors.length === 0) {
      errorOutput.textContent = 'No errors detected.';
    }
  } catch (e) {
    if (errorOutput) {
      errorOutput.textContent =
        e instanceof Error ? e.message : String(e);
    }
  }
}

showCapturedValidationErrors();

// generate code whenever the workspace changes
workspace.addChangeListener(generateCode);