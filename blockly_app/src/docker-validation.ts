import type * as Blockly from 'blockly';

import type { UiValidationError } from './app-types';

const SUPPORTED_RESTART_POLICIES = new Set([
  'no',
  'always',
  'on-failure',
  'unless-stopped'
]);

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

function validateDuration(
  value: string,
  requiredMessage: string,
  formatMessage: string,
  blockId: string,
  errors: UiValidationError[]
) {
  if (value.length === 0) {
    errors.push(requiredError(requiredMessage, blockId));
    return;
  }

  if (!/^\d+(ms|s|m|h)$/.test(value)) {
    errors.push(requiredError(formatMessage, blockId));
  }
}

function getOwningServiceBlock(block: Blockly.Block): Blockly.Block | null {
  let current = block.getSurroundParent();

  while (current) {
    if (current.type === 'service') return current;
    current = current.getSurroundParent();
  }

  return null;
}

function statementBlocks(block: Blockly.Block, inputName: string): Blockly.Block[] {
  const blocks: Blockly.Block[] = [];
  let current = block.getInputTargetBlock(inputName);

  while (current) {
    blocks.push(current);
    current = current.getNextBlock();
  }

  return blocks;
}

function firstNonEmptyField(blocks: Blockly.Block[], fieldName: string): string {
  return blocks
    .map((block) => trimFieldValue(block.getFieldValue(fieldName)))
    .find((value) => value.length > 0) ?? '';
}

function validateSingletonConfig(
  serviceBlock: Blockly.Block,
  blocks: Blockly.Block[],
  label: string,
  errors: UiValidationError[]
) {
  if (blocks.length <= 1) return;

  const serviceName = String(serviceBlock.getFieldValue('NAME') ?? '');
  blocks.forEach((block) => {
    errors.push(requiredError(
      `Service "${serviceName}" has multiple ${label} blocks. Only one ${label} block is allowed.`,
      block.id
    ));
  });
}

export function collectDockerValidationErrors(
  workspace: Blockly.Workspace
): UiValidationError[] {
  const errors: UiValidationError[] = [];
  const serviceBlocksByName = new Map<string, Blockly.Block[]>();
  const networkBlocksByName = new Map<string, Blockly.Block[]>();

  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'service') {
      const rawName = String(block.getFieldValue('NAME') ?? '');
      const name = trimFieldValue(rawName);
      const configBlocks = statementBlocks(block, 'CONFIG');
      const imageBlocks = configBlocks.filter((child) => child.type === 'image');
      const buildBlocks = configBlocks.filter((child) => child.type === 'build');
      const restartBlocks = configBlocks.filter((child) => child.type === 'restart');
      const healthcheckBlocks = configBlocks.filter((child) => child.type === 'healthcheck');
      const image = firstNonEmptyField(imageBlocks, 'IMAGE');
      const buildContext = firstNonEmptyField(buildBlocks, 'CONTEXT');

      if (name.length === 0) {
        errors.push(requiredError('Service name is required.', block.id));
      } else {
        const serviceBlocks = serviceBlocksByName.get(rawName) ?? [];
        serviceBlocks.push(block);
        serviceBlocksByName.set(rawName, serviceBlocks);
      }

      if (image.length === 0 && buildContext.length === 0) {
        errors.push(requiredError('Service requires an image or build configuration.', block.id));
      }

      validateSingletonConfig(block, imageBlocks, 'Image', errors);
      validateSingletonConfig(block, buildBlocks, 'Build', errors);
      validateSingletonConfig(block, restartBlocks, 'Restart', errors);
      validateSingletonConfig(block, healthcheckBlocks, 'Healthcheck', errors);
    }

    if (block.type === 'build') {
      const context = trimFieldValue(block.getFieldValue('CONTEXT'));

      if (context.length === 0) {
        errors.push(requiredError('Build context is required.', block.id));
      }
    }

    if (block.type === 'network') {
      const rawName = String(block.getFieldValue('NAME') ?? '');
      const name = trimFieldValue(rawName);

      if (name.length === 0) {
        errors.push(requiredError('Network name is required.', block.id));
      } else {
        const networkBlocks = networkBlocksByName.get(rawName) ?? [];
        networkBlocks.push(block);
        networkBlocksByName.set(rawName, networkBlocks);
      }
    }

    if (block.type === 'restart') {
      const policy = String(block.getFieldValue('POLICY') ?? '');

      if (!SUPPORTED_RESTART_POLICIES.has(policy)) {
        errors.push(requiredError(
          'Restart policy must be one of: no, always, on-failure, unless-stopped.',
          block.id
        ));
      }
    }

    if (block.type === 'healthcheck') {
      const command = trimFieldValue(block.getFieldValue('COMMAND'));
      const interval = trimFieldValue(block.getFieldValue('INTERVAL'));
      const timeout = trimFieldValue(block.getFieldValue('TIMEOUT'));
      const retries = trimFieldValue(block.getFieldValue('RETRIES'));

      if (command.length === 0) {
        errors.push(requiredError('Healthcheck command is required.', block.id));
      }

      validateDuration(
        interval,
        'Healthcheck interval is required.',
        'Healthcheck interval must use a supported duration such as 500ms, 10s, 2m, or 1h.',
        block.id,
        errors
      );

      validateDuration(
        timeout,
        'Healthcheck timeout is required.',
        'Healthcheck timeout must use a supported duration such as 500ms, 10s, 2m, or 1h.',
        block.id,
        errors
      );

      if (retries.length === 0) {
        errors.push(requiredError('Healthcheck retries is required.', block.id));
      } else if (!/^\d+$/.test(retries) || Number(retries) < 1) {
        errors.push(requiredError('Healthcheck retries must be an integer greater than or equal to 1.', block.id));
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

  serviceBlocksByName.forEach((blocks, name) => {
    if (blocks.length < 2) return;

    blocks.forEach((block) => {
      errors.push(requiredError(`Duplicate service name "${name}".`, block.id));
    });
  });

  networkBlocksByName.forEach((blocks, name) => {
    if (blocks.length < 2) return;

    blocks.forEach((block) => {
      errors.push(requiredError(`Duplicate network name "${name}".`, block.id));
    });
  });

  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type !== 'dependency') return;

    const rawTarget = String(block.getFieldValue('TARGET') ?? '');
    const target = trimFieldValue(rawTarget);

    if (target.length === 0) {
      errors.push(requiredError('Dependency service name is required.', block.id));
      return;
    }

    const owningService = getOwningServiceBlock(block);
    const owningServiceName = owningService
      ? String(owningService.getFieldValue('NAME') ?? '')
      : '';

    if (owningServiceName === rawTarget) {
      errors.push(requiredError(`Service "${rawTarget}" cannot depend on itself.`, block.id));
      return;
    }

    if (!serviceBlocksByName.has(rawTarget)) {
      errors.push(requiredError(`Unknown dependency service "${rawTarget}".`, block.id));
    }
  });

  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type !== 'networkref') return;

    const rawTarget = String(block.getFieldValue('TARGET') ?? '');
    const target = trimFieldValue(rawTarget);

    if (target.length === 0) {
      errors.push(requiredError('Network name is required.', block.id));
      return;
    }

    if (!networkBlocksByName.has(rawTarget)) {
      errors.push(requiredError(`Unknown network "${rawTarget}".`, block.id));
    }
  });

  return errors;
}

