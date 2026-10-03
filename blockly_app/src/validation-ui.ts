import type * as Blockly from 'blockly';

import type { UiValidationError } from './app-types';

const VALIDATION_WARNING_ID = 'captured-validation-error';

const SUCCESS_GROUPS = [
  ['Service names unique', 'All service names are valid and unique.'],
  ['Service configuration valid', 'Every service has an image or build configuration.'],
  ['Ports valid', 'All port mappings are valid.'],
  ['Dependencies valid', 'All service dependencies are valid.'],
  ['Networks valid', 'All network references are valid.'],
  ['Healthchecks valid', 'All healthcheck configurations are valid.'],
  ['Build settings valid', 'All build contexts are valid.'],
  ['Volumes valid', 'All volume mappings are valid.']
];

function createTextElement(
  className: string,
  text: string
): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return element;
}

function createValidationErrorElement(error: UiValidationError): HTMLElement {
  const item = document.createElement('div');
  item.className = 'validation-error';

  const mark = document.createElement('div');
  mark.className = 'validation-mark';
  mark.textContent = '!';
  item.appendChild(mark);

  const body = document.createElement('div');
  item.appendChild(body);

  const title = document.createElement('div');
  title.className = 'validation-error-title';
  title.textContent = 'Validation issue';
  body.appendChild(title);

  const message = document.createElement('div');
  message.className = 'validation-error-message';
  message.textContent = error.message;
  body.appendChild(message);

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
    body.appendChild(location);
  }

  return item;
}

function createValidationCheckElement(title: string, message: string): HTMLElement {
  const item = document.createElement('div');
  item.className = 'validation-check';

  const mark = document.createElement('div');
  mark.className = 'validation-mark';
  mark.textContent = '✓';
  item.appendChild(mark);

  const body = document.createElement('div');
  item.appendChild(body);

  body.appendChild(createTextElement('validation-check-title', title));
  body.appendChild(createTextElement('validation-check-message', message));

  return item;
}

function showNoValidationErrors(
  workspace: Blockly.Workspace,
  errorOutput: HTMLElement | null
) {
  if (!errorOutput) return;

  errorOutput.replaceChildren();

  if (workspace.getAllBlocks(false).length === 0) {
    const empty = document.createElement('div');
    empty.className = 'validation-empty';
    empty.textContent = 'Add blocks or validate the workspace to see results.';
    errorOutput.appendChild(empty);
    return;
  }

  SUCCESS_GROUPS.forEach(([title, message]) => {
    errorOutput.appendChild(createValidationCheckElement(title, message));
  });
}

function showCapturedValidationErrors(
  workspace: Blockly.Workspace,
  errorOutput: HTMLElement | null,
  validationErrors: UiValidationError[]
) {
  if (!errorOutput) return;

  errorOutput.replaceChildren();

  if (validationErrors.length === 0) {
    showNoValidationErrors(workspace, errorOutput);
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
      showCapturedValidationErrors(workspace, errorOutput, capturedValidationErrors);
      updateBlockValidationWarnings(workspace, capturedValidationErrors);
    },

    showNoErrors() {
      showNoValidationErrors(workspace, errorOutput);
    },

    showGenerationError(error: unknown) {
      if (errorOutput) {
        errorOutput.textContent =
          error instanceof Error ? error.message : String(error);
      }
    }
  };
}

