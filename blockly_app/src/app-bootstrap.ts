import * as Blockly from 'blockly';

import type { UiValidationError } from './app-types';
import {
  DOCKER_COMPOSE_EXAMPLES,
  loadDockerComposeExample
} from './docker-example';
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
  const workspace = Blockly.inject('blocklyDiv', {
    toolbox,
    grid: {
      spacing: 20,
      length: 2,
      colour: '#cfe3f5',
      snap: false
    },
    zoom: {
      controls: true,
      wheel: true,
      startScale: 0.92,
      maxScale: 1.6,
      minScale: 0.45,
      scaleSpeed: 1.08
    },
    trashcan: true
  });
  const codeOutput = document.getElementById('codeOutput');
  const errorOutput = document.getElementById('errorOutput');
  const actionStatus = document.getElementById('actionStatus');
  const yamlStatus = document.getElementById('yamlStatus');
  const exampleSelect = document.getElementById('exampleSelect') as HTMLSelectElement | null;
  const validationUi = createValidationUi(workspace, errorOutput);
  const summaryElements = {
    service: document.getElementById('summaryServices'),
    network: document.getElementById('summaryNetworks'),
    dependency: document.getElementById('summaryDependencies'),
    healthcheck: document.getElementById('summaryHealthchecks')
  };

  function collectValidationErrors() {
    return [
      ...validationErrors,
      ...collectDockerValidationErrors(workspace)
    ];
  }

  function workspaceHasBlocks() {
    return workspace.getAllBlocks(false).length > 0;
  }

  function updateYamlStatus(errors: UiValidationError[], code: string) {
    if (!yamlStatus) return;

    yamlStatus.classList.remove('invalid', 'neutral');

    if (!code.trim() || !workspaceHasBlocks()) {
      yamlStatus.textContent = 'Waiting for blocks';
      yamlStatus.classList.add('neutral');
      return;
    }

    if (errors.length > 0) {
      yamlStatus.textContent = 'Validation errors';
      yamlStatus.classList.add('invalid');
      return;
    }

    yamlStatus.textContent = 'Valid YAML';
  }

  function updateWorkspaceSummary() {
    const counts = {
      service: 0,
      network: 0,
      dependency: 0,
      healthcheck: 0
    };

    workspace.getAllBlocks(false).forEach((block) => {
      if (block.type === 'service') counts.service += 1;
      if (block.type === 'network') counts.network += 1;
      if (block.type === 'dependency') counts.dependency += 1;
      if (block.type === 'healthcheck') counts.healthcheck += 1;
    });

    Object.entries(summaryElements).forEach(([type, element]) => {
      if (element) element.textContent = String(counts[type as keyof typeof counts]);
    });
  }

  function resizeWorkspace() {
    try {
      Blockly.svgResize(workspace);
    } catch {
      // Headless tests use a minimal Blockly workspace without an SVG surface.
    }
  }

  function generateCode() {
    try {
      const code = generator.workspaceToCode(workspace);

      if (codeOutput) {
        codeOutput.textContent = code;
      }
      return code;
    } catch (error) {
      validationUi.showGenerationError(error);
      return '';
    }
  }

  function handleWorkspaceChange(_event?: Blockly.Events.Abstract) {
    const code = generateCode();
    const errors = collectValidationErrors();
    validationUi.refresh(errors);
    updateYamlStatus(errors, code);
    updateWorkspaceSummary();
    resizeWorkspace();
  }

  function showActionStatus(message: string) {
    if (actionStatus) actionStatus.textContent = message;
  }

  function populateExampleSelector() {
    if (!exampleSelect) return;

    exampleSelect.replaceChildren();

    DOCKER_COMPOSE_EXAMPLES.forEach((example) => {
      const option = document.createElement('option');
      option.value = example.id;
      option.textContent = example.name;
      option.title = example.description;
      exampleSelect.appendChild(option);
    });

    exampleSelect.value = DOCKER_COMPOSE_EXAMPLES[0].id;
  }

  function clearWorkspace() {
    workspace.clear();
    handleWorkspaceChange();
    showActionStatus('');
  }

  function loadExample() {
    const selectedExample = loadDockerComposeExample(
      workspace,
      exampleSelect?.value
    );
    handleWorkspaceChange();
    showActionStatus(selectedExample.name + ' loaded.');
  }

  function validateWorkspace() {
    handleWorkspaceChange();
    showActionStatus(
      validationUi.currentErrors.length === 0
        ? 'Workspace validation passed.'
        : 'Validation errors found.'
    );
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

  populateExampleSelector();
  validationUi.refresh(collectValidationErrors());
  workspace.addChangeListener(handleWorkspaceChange);

  document.getElementById('loadExample')?.addEventListener('click', loadExample);
  document.getElementById('validateWorkspace')?.addEventListener('click', validateWorkspace);
  document.getElementById('clearWorkspace')?.addEventListener('click', clearWorkspace);
  document.getElementById('copyYaml')?.addEventListener('click', copyYaml);
  document.getElementById('downloadYaml')?.addEventListener('click', downloadYaml);
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resizeWorkspace);
  }

  handleWorkspaceChange();

  return {
    workspace,
    handleWorkspaceChange
  };
}

