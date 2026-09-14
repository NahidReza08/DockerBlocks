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
      "name": "Docker",
      "colour": "230",
      "contents": [
        {
          "kind": "block",
          "type": "compose"
        },
        {
          "kind": "block",
          "type": "service"
        },
        {
          "kind": "block",
          "type": "port"
        },
        {
          "kind": "block",
          "type": "environment"
        },
        {
          "kind": "block",
          "type": "volume"
        }
      ]
    }
  ]
}
});

const codeOutput = document.getElementById('codeOutput');
const errorOutput = document.getElementById('errorOutput');

const VALIDATION_WARNING_ID = 'captured-validation-error';

function collectWorkspaceValidationErrors(): UiValidationError[] {
  const errors: UiValidationError[] = [];

  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'service') {
      const name = String(
        block.getFieldValue('NAME') ?? ''
      ).trim();

      const image = String(
        block.getFieldValue('IMAGE') ?? ''
      ).trim();

      if (name.length === 0) {
        errors.push({
          type: 'validation',
          message: 'Service name is required.',
          severity: 'error',
          blockId: block.id
        });
      }

      if (image.length === 0) {
        errors.push({
          type: 'validation',
          message: 'Image is required',
          severity: 'error',
          blockId: block.id
        });
      }
    }

    if (block.type === 'port') {
      const hostPort = String(
        block.getFieldValue('HOST_PORT') ?? ''
      ).trim();

      const containerPort = String(
        block.getFieldValue('CONTAINER_PORT') ?? ''
      ).trim();

      if (hostPort.length === 0) {
        errors.push({
          type: 'validation',
          message: 'Host port is required.',
          severity: 'error',
          blockId: block.id
        });
      } else if (!/^\d+$/.test(hostPort)) {
        errors.push({
          type: 'validation',
          message: 'Host port must be an integer between 1 and 65535.',
          severity: 'error',
          blockId: block.id
        });
      } else {
        const parsedHostPort = Number(hostPort);
        if (!Number.isInteger(parsedHostPort) || parsedHostPort < 1 || parsedHostPort > 65535) {
          errors.push({
            type: 'validation',
            message: 'Host port must be an integer between 1 and 65535.',
            severity: 'error',
            blockId: block.id
          });
        }
      }

      if (containerPort.length === 0) {
        errors.push({
          type: 'validation',
          message: 'Container port is required.',
          severity: 'error',
          blockId: block.id
        });
      } else if (!/^\d+$/.test(containerPort)) {
        errors.push({
          type: 'validation',
          message: 'Container port must be an integer between 1 and 65535.',
          severity: 'error',
          blockId: block.id
        });
      } else {
        const parsedContainerPort = Number(containerPort);
        if (!Number.isInteger(parsedContainerPort) || parsedContainerPort < 1 || parsedContainerPort > 65535) {
          errors.push({
            type: 'validation',
            message: 'Container port must be an integer between 1 and 65535.',
            severity: 'error',
            blockId: block.id
          });
        }
      }
    }

    if (block.type === 'environment') {
      const key = String(
        block.getFieldValue('KEY') ?? ''
      ).trim();

      if (key.length === 0) {
        errors.push({
          type: 'validation',
          message: 'Environment key is required.',
          severity: 'error',
          blockId: block.id
        });
      } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        errors.push({
          type: 'validation',
          message: 'Environment key must start with a letter or underscore and contain only letters, numbers, and underscores.',
          severity: 'error',
          blockId: block.id
        });
      }
    }

    if (block.type === 'volume') {
      const source = String(
        block.getFieldValue('SOURCE') ?? ''
      ).trim();

      const target = String(
        block.getFieldValue('TARGET') ?? ''
      ).trim();

      if (source.length === 0) {
        errors.push({
          type: 'validation',
          message: 'Volume source is required.',
          severity: 'error',
          blockId: block.id
        });
      }

      if (target.length === 0) {
        errors.push({
          type: 'validation',
          message: 'Volume target is required.',
          severity: 'error',
          blockId: block.id
        });
      }
    }
  });

  return errors;
}

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
  _event: Blockly.Events.Abstract
) {
  generateCode();

  refreshValidationState([
    ...validationErrors,
    ...collectWorkspaceValidationErrors()
  ]);
}

refreshValidationState([
  ...validationErrors,
  ...collectWorkspaceValidationErrors()
]);

workspace.addChangeListener(handleWorkspaceChange);
