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
  blockId?: string;
};

let capturedValidationErrors = [...validationErrors] as UiValidationError[];

defineBlocks();

const workspace = Blockly.inject('blocklyDiv', {
  toolbox: {
  "kind": "categoryToolbox",
  "contents": [
    {
      "kind": "category",
      "name": "Main / Entry",
      "colour": "210",
      "contents": [
        {
          "kind": "block",
          "type": "compose"
        }
      ]
    },
    {
      "kind": "category",
      "name": "Elements & Components",
      "colour": "160",
      "contents": [
        {
          "kind": "block",
          "type": "service"
        }
      ]
    }
  ]
}
});

const codeOutput = document.getElementById('codeOutput');
const errorOutput = document.getElementById('errorOutput');

const VALIDATION_WARNING_ID = 'captured-validation-error';

function updateBlockValidationWarnings() {
  workspace.getAllBlocks(false).forEach((block) => {
    block.setWarningText(null, VALIDATION_WARNING_ID);
  });

  const messagesByBlockId = new Map<string, string[]>();

  capturedValidationErrors.forEach((error) => {
    if (!error.blockId) return;

    const messages = messagesByBlockId.get(error.blockId) ?? [];
    messages.push(error.message);
    messagesByBlockId.set(error.blockId, messages);
  });

  messagesByBlockId.forEach((messages, blockId) => {
    const block = workspace.getBlockById(blockId);

    if (!block) return;

    block.setWarningText(
      messages.join('\n'),
      VALIDATION_WARNING_ID
    );
  });
}

function createValidationErrorElement(
  error: UiValidationError
): HTMLElement {
  const item = document.createElement('div');
  item.className = 'validation-error';

  const title = document.createElement('div');
  title.className = 'validation-error-title';
  title.textContent = '[' + error.type + ']';
  item.appendChild(title);

  const message = document.createElement('div');
  message.className = 'validation-error-message';
  message.textContent = error.message;
  item.appendChild(message);

  const details: string[] = [];

  if (error.line !== undefined) {
    let location = 'Line ' + error.line;

    if (error.column !== undefined) {
      location += ', column ' + error.column;
    }

    details.push(location);
  }

  if (error.blockId !== undefined) {
    details.push('Block: ' + error.blockId);
  }

  if (details.length > 0) {
    const location = document.createElement('div');
    location.className = 'validation-error-location';
    location.textContent = details.join(' · ');
    item.appendChild(location);
  }

  return item;
}

function showNoValidationErrors() {
  if (!errorOutput) return;

  errorOutput.replaceChildren();

  const status = document.createElement('div');
  status.className = 'validation-status';
  status.textContent = 'No errors detected.';

  errorOutput.appendChild(status);
}

function showCapturedValidationErrors() {
  if (!errorOutput) return;

  errorOutput.replaceChildren();

  if (capturedValidationErrors.length === 0) {
    showNoValidationErrors();
    return;
  }

  capturedValidationErrors.forEach((error) => {
    errorOutput.appendChild(
      createValidationErrorElement(error)
    );
  });
}

function refreshValidationState(
  nextErrors: UiValidationError[]
) {
  capturedValidationErrors = [...nextErrors];

  showCapturedValidationErrors();
  updateBlockValidationWarnings();
}

function removeValidationErrorsForBlock(
  blockId: string
) {
  const nextErrors = capturedValidationErrors.filter(
    (error) => error.blockId !== blockId
  );

  refreshValidationState(nextErrors);
}

function generateCode() {
  try {
    const code = generator.workspaceToCode(workspace);

    if (codeOutput) {
      codeOutput.textContent = code;
    }

    if (capturedValidationErrors.length === 0) {
      showNoValidationErrors();
    }
  } catch (e) {
    if (errorOutput) {
      errorOutput.textContent =
        e instanceof Error ? e.message : String(e);
    }
  }
}

function handleWorkspaceChange(
  event: Blockly.Events.Abstract
) {
  generateCode();

  if (
    event.type === Blockly.Events.BLOCK_DELETE &&
    'ids' in event &&
    Array.isArray(event.ids)
  ) {
    const deletedBlockIds = event.ids.filter(
      (id): id is string => typeof id === 'string'
    );

    const nextErrors = capturedValidationErrors.filter(
      (error) =>
        !error.blockId ||
        !deletedBlockIds.includes(error.blockId)
    );

    refreshValidationState(nextErrors);
    return;
  }

  if (
    event.type === Blockly.Events.BLOCK_CHANGE &&
    'blockId' in event &&
    typeof event.blockId === 'string'
  ) {
    removeValidationErrorsForBlock(event.blockId);
    return;
  }

  updateBlockValidationWarnings();
}

refreshValidationState(capturedValidationErrors);

workspace.addChangeListener(handleWorkspaceChange);
