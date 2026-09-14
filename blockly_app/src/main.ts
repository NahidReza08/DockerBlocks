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
  function trimFieldValue(value: unknown): string {
    return String(value ?? '').trim();
  }

  const errors: UiValidationError[] = [];

  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'service') {
      const name = trimFieldValue(block.getFieldValue('NAME'));

      const image = trimFieldValue(block.getFieldValue('IMAGE'));

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
      const hostPort = trimFieldValue(block.getFieldValue('HOST_PORT'));

      const containerPort = trimFieldValue(block.getFieldValue('CONTAINER_PORT'));

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
      const key = trimFieldValue(block.getFieldValue('KEY'));

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
      const source = trimFieldValue(block.getFieldValue('SOURCE'));

      const target = trimFieldValue(block.getFieldValue('TARGET'));

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
  _event?: Blockly.Events.Abstract
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

const actionStatus = document.getElementById('actionStatus');

function showActionStatus(message: string) {
  if (actionStatus) actionStatus.textContent = message;
}

function clearWorkspace() {
  workspace.clear();
  handleWorkspaceChange();
  showActionStatus('');
}

function loadExample() {
  // D04, expressed with existing Blockly blocks; no browser DSL parser needed.
  function service(name: string, image: string, hostPort: number,
    containerPort: number, source: string, target: string,
    apiPort = false): Blockly.serialization.blocks.State {
    const environment: Blockly.serialization.blocks.State = {
      type: 'environment', fields: { KEY: 'NODE_ENV', VALUE: 'production' }
    };
    if (apiPort) {
      environment.next = {
        block: { type: 'environment', fields: { KEY: 'API_PORT', VALUE: '3000' } }
      };
    }
    return {
      type: 'service', fields: { NAME: name, IMAGE: image },
      inputs: {
        PORTS: { block: {
          type: 'port', fields: { HOST_PORT: hostPort, CONTAINER_PORT: containerPort }
        } },
        ENVIRONMENT: { block: environment },
        VOLUMES: { block: { type: 'volume', fields: { SOURCE: source, TARGET: target } } }
      }
    };
  }

  const frontend = service('frontend', 'nginx', 8080, 80,
    './frontend', '/usr/share/nginx/html');
  frontend.next = { block: service('backend', 'node:20', 3000, 3000,
    './data', '/app/data', true) };
  // Loading a serialized workspace replaces all existing blocks and renders them.
  Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
    type: 'compose', x: 24, y: 24, inputs: { SERVICES: { block: frontend } }
  }] } }, workspace);
  workspace.scroll(0, 0);
  handleWorkspaceChange();
  showActionStatus('Example loaded.');
}

async function copyYaml() {
  try {
    await navigator.clipboard.writeText(generator.workspaceToCode(workspace));
    showActionStatus('YAML copied.');
  } catch {
    showActionStatus('Could not copy YAML. Select the generated code and copy it manually.');
  }
}

function downloadYaml() {
  const blob = new Blob([generator.workspaceToCode(workspace)], { type: 'text/yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'docker-compose.yml';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Allow the browser to start the download before releasing the URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

document.getElementById('loadExample')?.addEventListener('click', loadExample);
document.getElementById('clearWorkspace')?.addEventListener('click', clearWorkspace);
document.getElementById('copyYaml')?.addEventListener('click', copyYaml);
document.getElementById('downloadYaml')?.addEventListener('click', downloadYaml);
generateCode();
