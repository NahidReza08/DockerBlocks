import type * as Blockly from 'blockly';

import type { UiValidationError } from './app-types';

function trimFieldValue(value: unknown): string {
  return String(value ?? '').trim();
}

function requiredError(message: string, blockId: string): UiValidationError {
  return {
    type: 'validation',
    message,
    severity: 'error',
    blockId
  };
}

function validatePort(
  value: string,
  requiredMessage: string,
  rangeMessage: string,
  blockId: string,
  errors: UiValidationError[]
) {
  if (value.length === 0) {
    errors.push(requiredError(requiredMessage, blockId));
    return;
  }

  if (!/^\d+$/.test(value)) {
    errors.push(requiredError(rangeMessage, blockId));
    return;
  }

  const parsedPort = Number(value);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    errors.push(requiredError(rangeMessage, blockId));
  }
}

export function collectDockerValidationErrors(
  workspace: Blockly.Workspace
): UiValidationError[] {
  const errors: UiValidationError[] = [];

  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'service') {
      const name = trimFieldValue(block.getFieldValue('NAME'));
      const image = trimFieldValue(block.getFieldValue('IMAGE'));

      if (name.length === 0) {
        errors.push(requiredError('Service name is required.', block.id));
      }

      if (image.length === 0) {
        errors.push(requiredError('Image is required', block.id));
      }
    }

    if (block.type === 'port') {
      validatePort(
        trimFieldValue(block.getFieldValue('HOST_PORT')),
        'Host port is required.',
        'Host port must be an integer between 1 and 65535.',
        block.id,
        errors
      );

      validatePort(
        trimFieldValue(block.getFieldValue('CONTAINER_PORT')),
        'Container port is required.',
        'Container port must be an integer between 1 and 65535.',
        block.id,
        errors
      );
    }

    if (block.type === 'environment') {
      const key = trimFieldValue(block.getFieldValue('KEY'));

      if (key.length === 0) {
        errors.push(requiredError('Environment key is required.', block.id));
      } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        errors.push(requiredError(
          'Environment key must start with a letter or underscore and contain only letters, numbers, and underscores.',
          block.id
        ));
      }
    }

    if (block.type === 'volume') {
      const source = trimFieldValue(block.getFieldValue('SOURCE'));
      const target = trimFieldValue(block.getFieldValue('TARGET'));

      if (source.length === 0) {
        errors.push(requiredError('Volume source is required.', block.id));
      }

      if (target.length === 0) {
        errors.push(requiredError('Volume target is required.', block.id));
      }
    }
  });

  return errors;
}

