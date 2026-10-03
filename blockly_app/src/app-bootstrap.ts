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
  const copyYamlButton = document.getElementById('copyYaml');
  const validationUi = createValidationUi(workspace, errorOutput);
  const summaryElements = {
    service: document.getElementById('summaryServices'),
    network: document.getElementById('summaryNetworks'),
    dependency: document.getElementById('summaryDependencies'),
    healthcheck: document.getElementById('summaryHealthchecks'),
    volume: document.getElementById('summaryVolumes')
  };
  const summaryItems = {
    service: document.getElementById('summaryServicesItem'),
    network: document.getElementById('summaryNetworksItem'),
    dependency: document.getElementById('summaryDependenciesItem'),
    healthcheck: document.getElementById('summaryHealthchecksItem'),
    volume: document.getElementById('summaryVolumesItem')
  };

  function collectValidationErrors() {
    return [
      ...validationErrors,
      ...collectDockerValidationErrors(workspace)
    ];
  }

  function getBlockCounts() {
    const counts = {
      service: 0,
      network: 0,
      dependency: 0,
      healthcheck: 0,
      volume: 0
    };

    workspace.getAllBlocks(false).forEach((block) => {
      if (block.type === 'service') counts.service += 1;
      if (block.type === 'network') counts.network += 1;
      if (block.type === 'dependency') counts.dependency += 1;
      if (block.type === 'healthcheck') counts.healthcheck += 1;
      if (block.type === 'volume') counts.volume += 1;
    });

    return counts;
  }

  function hasMeaningfulComposeConfiguration() {
    return getBlockCounts().service > 0;
  }

  function updateYamlStatus(errors: UiValidationError[], code: string) {
    if (!yamlStatus) return;

    yamlStatus.classList.remove('invalid', 'neutral');

    if (workspace.getAllBlocks(false).length === 0) {
      yamlStatus.textContent = 'Waiting for configuration';
      yamlStatus.classList.add('neutral');
      return;
    }

    if (!code.trim() || !hasMeaningfulComposeConfiguration()) {
      yamlStatus.textContent = 'Incomplete configuration';
      yamlStatus.classList.add('neutral');
      return;
    }

    if (errors.length > 0) {
      yamlStatus.textContent = 'Validation errors';
      yamlStatus.classList.add('invalid');
      return;
    }

    yamlStatus.textContent = 'Valid Compose';
  }

  function updateWorkspaceSummary() {
    const counts = getBlockCounts();
    let visibleCount = 0;

    Object.entries(summaryElements).forEach(([type, element]) => {
      const count = counts[type as keyof typeof counts];
      const item = summaryItems[type as keyof typeof summaryItems];

      if (element) element.textContent = String(count);

      if (item) {
        item.hidden = count === 0;
        if (count > 0) visibleCount += 1;
      }
    });

    const emptySummary = document.getElementById('summaryEmpty');
    if (emptySummary) emptySummary.hidden = visibleCount > 0;
  }

  function openInitialToolboxCategory() {
    try {
      const workspaceSvg = workspace as Blockly.WorkspaceSvg;
      const toolbox = workspaceSvg.getToolbox?.();
      const toolboxWithItems = toolbox as typeof toolbox & {
        getToolboxItems?: () => unknown[];
      };
      const firstItem = toolboxWithItems?.getToolboxItems?.()[0];

      if (firstItem && !toolbox?.getSelectedItem?.()) {
        toolbox?.setSelectedItem(firstItem as Blockly.IToolboxItem);
      }
    } catch {
      // Headless tests do not render a Blockly toolbox.
    }
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
      if (copyYamlButton) {
        const previousText = copyYamlButton.textContent || '⧉ Copy YAML';
        copyYamlButton.textContent = '✓ Copied';
        setTimeout(() => {
          copyYamlButton.textContent = previousText;
        }, 1400);
      }
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
  openInitialToolboxCategory();

  return {
    workspace,
    handleWorkspaceChange
  };
}

