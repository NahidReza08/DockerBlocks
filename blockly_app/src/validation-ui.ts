import type * as Blockly from 'blockly';

import type { UiValidationError } from './app-types';

const VALIDATION_WARNING_ID = 'captured-validation-error';

function createValidationErrorElement(error: UiValidationError): HTMLElement {
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

function showNoValidationErrors(errorOutput: HTMLElement | null) {
  if (!errorOutput) return;

  errorOutput.replaceChildren();

  const status = document.createElement('div');
  status.className = 'validation-status';
  status.textContent = 'No errors detected.';

  errorOutput.appendChild(status);
}

function showCapturedValidationErrors(
  errorOutput: HTMLElement | null,
  validationErrors: UiValidationError[]
) {
  if (!errorOutput) return;

  errorOutput.replaceChildren();

  if (validationErrors.length === 0) {
    showNoValidationErrors(errorOutput);
    return;
  }

  validationErrors.forEach((error) => {
    errorOutput.appendChild(createValidationErrorElement(error));
  });
}

function updateBlockValidationWarnings(
  workspace: Blockly.Workspace,
  validationErrors: UiValidationError[]
) {
  workspace.getAllBlocks(false).forEach((block) => {
    block.setWarningText(null, VALIDATION_WARNING_ID);
  });

  const messagesByBlockId = new Map<string, string[]>();

  validationErrors.forEach((error) => {
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

export function createValidationUi(
  workspace: Blockly.Workspace,
  errorOutput: HTMLElement | null
) {
  let capturedValidationErrors: UiValidationError[] = [];

  return {
    get currentErrors() {
      return capturedValidationErrors;
    },

    refresh(nextErrors: UiValidationError[]) {
      capturedValidationErrors = [...nextErrors];
      showCapturedValidationErrors(errorOutput, capturedValidationErrors);
      updateBlockValidationWarnings(workspace, capturedValidationErrors);
    },

    showNoErrors() {
      showNoValidationErrors(errorOutput);
    },

    showGenerationError(error: unknown) {
      if (errorOutput) {
        errorOutput.textContent =
          error instanceof Error ? error.message : String(error);
      }
    }
  };
}

