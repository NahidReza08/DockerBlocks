import type * as Blockly from 'blockly';

import type { UiValidationError } from './app-types';

const VALIDATION_WARNING_ID = 'captured-validation-error';

function createTextElement(
  className: string,
  text: string
): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return element;
}

function getServiceLabel(workspace: Blockly.Workspace, blockId?: string): string | null {
  if (!blockId) return null;

  const block = workspace.getBlockById(blockId);
  if (!block) return null;

  const serviceBlock = block.type === 'service' ? block : block.getSurroundParent();
  if (!serviceBlock || serviceBlock.type !== 'service') return null;

  const name = String(serviceBlock.getFieldValue('NAME') ?? '').trim();
  return name ? 'Service (' + name + ')' : 'Service';
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
  title.textContent = error.message;
  body.appendChild(title);

  const details: string[] = [];

  if (error.line !== undefined) {
    let location = 'Line ' + error.line;

    if (error.column !== undefined) {
      location += ', column ' + error.column;
    }

    details.push(location);
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

  const hasService = workspace
    .getAllBlocks(false)
    .some((block) => block.type === 'service');

  if (!hasService) {
    const empty = document.createElement('div');
    empty.className = 'validation-empty-state';

    const icon = document.createElement('div');
    icon.className = 'validation-empty-icon';
    icon.textContent = 'i';
    empty.appendChild(icon);

    const copy = document.createElement('div');
    copy.className = 'validation-empty-copy';
    copy.appendChild(createTextElement('validation-empty-title', 'No configuration to validate yet.'));
    copy.appendChild(createTextElement(
      'validation-empty-message',
      'Add a Service block to create a valid Docker Compose configuration.'
    ));
    empty.appendChild(copy);

    errorOutput.appendChild(empty);
    return;
  }

  errorOutput.appendChild(createValidationCheckElement(
    'No errors found.',
    'Your Docker Compose configuration is valid.'
  ));
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

  const summary = document.createElement('div');
  summary.className = 'validation-error-summary';
  summary.textContent = validationErrors.length + ' validation ' +
    (validationErrors.length === 1 ? 'error' : 'errors');
  errorOutput.appendChild(summary);

  validationErrors.forEach((error) => {
    const serviceLabel = getServiceLabel(workspace, error.blockId);
    errorOutput.appendChild(createValidationErrorElement(error));
    const lastError = errorOutput.lastElementChild;

    if (serviceLabel && lastError) {
      const body = lastError.children[1];
      if (body) {
        body.appendChild(createTextElement('validation-error-location', 'Block: ' + serviceLabel));
      }
    }
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

