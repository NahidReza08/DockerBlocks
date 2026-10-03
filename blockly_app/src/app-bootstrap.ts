import * as Blockly from 'blockly';

import type { UiValidationError } from './app-types';
import { loadDockerComposeExample } from './docker-example';
import { collectDockerValidationErrors } from './docker-validation';
import { createValidationUi } from './validation-ui';

type WorkspaceGenerator = {
  workspaceToCode(workspace: Blockly.Workspace): string;
};

type BootstrapOptions = {
  toolbox: Blockly.utils.toolbox.ToolboxDefinition;
  generator: WorkspaceGenerator;
  validationErrors: UiValidationError[];
};

export function bootstrapBlocklyApp({
  toolbox,
  generator,
  validationErrors
}: BootstrapOptions) {
  const workspace = Blockly.inject('blocklyDiv', { toolbox });
  const codeOutput = document.getElementById('codeOutput');
  const errorOutput = document.getElementById('errorOutput');
  const actionStatus = document.getElementById('actionStatus');
  const validationUi = createValidationUi(workspace, errorOutput);

  function collectValidationErrors() {
    return [
      ...validationErrors,
      ...collectDockerValidationErrors(workspace)
    ];
  }

  function generateCode() {
    try {
      const code = generator.workspaceToCode(workspace);

      if (codeOutput) {
        codeOutput.textContent = code;
      }

      if (validationUi.currentErrors.length === 0) {
        validationUi.showNoErrors();
      }
    } catch (error) {
      validationUi.showGenerationError(error);
    }
  }

  function handleWorkspaceChange(_event?: Blockly.Events.Abstract) {
    generateCode();
    validationUi.refresh(collectValidationErrors());
  }

  function showActionStatus(message: string) {
    if (actionStatus) actionStatus.textContent = message;
  }

  function clearWorkspace() {
    workspace.clear();
    handleWorkspaceChange();
    showActionStatus('');
  }

  function loadExample() {
    loadDockerComposeExample(workspace);
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
    const blob = new Blob([generator.workspaceToCode(workspace)], {
      type: 'text/yaml;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'docker-compose.yml';
    document.body.appendChild(link);

    try {
      link.click();
    } finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  validationUi.refresh(collectValidationErrors());
  workspace.addChangeListener(handleWorkspaceChange);

  document.getElementById('loadExample')?.addEventListener('click', loadExample);
  document.getElementById('clearWorkspace')?.addEventListener('click', clearWorkspace);
  document.getElementById('copyYaml')?.addEventListener('click', copyYaml);
  document.getElementById('downloadYaml')?.addEventListener('click', downloadYaml);

  generateCode();

  return {
    workspace,
    handleWorkspaceChange
  };
}

