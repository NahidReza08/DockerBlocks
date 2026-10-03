import type * as Blockly from 'blockly';

import type { UiValidationError } from './app-types';

const VALIDATION_WARNING_ID = 'captured-validation-error';

type ValidationGroup = {
  blockTypes: string[];
  message: string;
  title: string;
};

const SUCCESS_GROUPS: ValidationGroup[] = [
  {
    blockTypes: ['service'],
    title: 'Service configuration valid',
    message: 'Service names are unique and each service has image or build configuration.'
  },
  {
    blockTypes: ['port'],
    title: 'Ports valid',
    message: 'Port mappings are valid.'
  },
  {
    blockTypes: ['dependency'],
    title: 'Dependencies valid',
    message: 'Service dependencies reference existing services.'
  },
  {
    blockTypes: ['network', 'networkref'],
    title: 'Networks valid',
    message: 'Network declarations and references are valid.'
  },
  {
    blockTypes: ['healthcheck'],
    title: 'Healthcheck valid',
    message: 'Healthcheck configuration is valid.'
  },
  {
    blockTypes: ['build'],
    title: 'Build settings valid',
    message: 'Build context is valid.'
  },
  {
    blockTypes: ['environment'],
    title: 'Environment valid',
    message: 'Environment entries use valid keys.'
  },
  {
    blockTypes: ['volume'],
    title: 'Volumes valid',
    message: 'Volume mappings have source and target values.'
  }
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

  const blocks = workspace.getAllBlocks(false);

  if (blocks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'validation-empty';
    empty.textContent = 'No configuration to validate yet.';
    errorOutput.appendChild(empty);
    return;
  }

  const blockTypes = new Set(blocks.map((block) => block.type));
  const relevantGroups = SUCCESS_GROUPS.filter((group) =>
    group.blockTypes.some((type) => blockTypes.has(type))
  );

  if (relevantGroups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'validation-empty';
    empty.textContent = 'Add a Service block to validate a Docker Compose configuration.';
    errorOutput.appendChild(empty);
    return;
  }

  relevantGroups.forEach((group) => {
    errorOutput.appendChild(createValidationCheckElement(group.title, group.message));
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

