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

type UiState = 'empty' | 'incomplete' | 'valid' | 'invalid';

type PaletteDropPosition = {
  clientX: number;
  clientY: number;
};

export function bootstrapBlocklyApp({
  toolbox,
  generator,
  validationErrors
}: BootstrapOptions) {
  void toolbox;

  const workspace = Blockly.inject('blocklyDiv', {
    grid: {
      spacing: 20,
      length: 2,
      colour: 'rgba(148, 163, 184, 0.45)',
      snap: false
    },
    move: {
      scrollbars: true,
      drag: true,
      wheel: true
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
  const lineNumbers = document.getElementById('lineNumbers');
  const errorOutput = document.getElementById('errorOutput');
  const actionStatus = document.getElementById('actionStatus');
  const yamlStatus = document.getElementById('yamlStatus');
  const blocklyDiv = document.getElementById('blocklyDiv');
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
      compose: 0,
      service: 0,
      network: 0,
      dependency: 0,
      healthcheck: 0,
      volume: 0
    };

    workspace.getAllBlocks(false).forEach((block) => {
      if (block.type === 'compose') counts.compose += 1;
      if (block.type === 'service') counts.service += 1;
      if (block.type === 'network') counts.network += 1;
      if (block.type === 'dependency') counts.dependency += 1;
      if (block.type === 'healthcheck') counts.healthcheck += 1;
      if (block.type === 'volume') counts.volume += 1;
    });

    return counts;
  }

  function hasMeaningfulComposeConfiguration() {
    const counts = getBlockCounts();
    return counts.compose > 0 && counts.service > 0;
  }

  function deriveUiState(errors: UiValidationError[], code: string): UiState {
    if (!hasMeaningfulComposeConfiguration()) {
      return workspace.getAllBlocks(false).length === 0 ? 'empty' : 'incomplete';
    }

    if (!code.trim()) return 'incomplete';
    if (errors.length > 0) return 'invalid';
    return 'valid';
  }

  function updateYamlStatus(state: UiState) {
    if (!yamlStatus) return;

    yamlStatus.classList.remove('invalid', 'neutral', 'incomplete', 'valid');

    if (state === 'valid') {
      yamlStatus.textContent = 'Valid';
      yamlStatus.classList.add('valid');
      return;
    }

    yamlStatus.textContent = 'Invalid';
    yamlStatus.classList.add(state === 'invalid' ? 'invalid' : 'incomplete');
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
    if (emptySummary) emptySummary.hidden = counts.service > 0;

    const emptySummaryTitle = document.getElementById('summaryEmptyTitle');
    const emptySummaryMessage = document.getElementById('summaryEmptyMessage');

    if (emptySummaryTitle && emptySummaryMessage) {
      if (visibleCount > 0) {
        emptySummaryTitle.textContent = 'No valid service configuration yet.';
        emptySummaryMessage.textContent = 'Add at least one Service block.';
      } else {
        emptySummaryTitle.textContent = 'No configured services yet.';
        emptySummaryMessage.textContent = 'Start by adding a Service block.';
      }
    }
  }

  function getDropWorkspaceCoordinate(position?: PaletteDropPosition) {
    if (!position) return { x: 48, y: 48 + workspace.getAllBlocks(false).length * 12 };

    const maybeSvgWorkspace = workspace as Blockly.WorkspaceSvg & {
      getInjectionDiv?: () => HTMLElement;
    };
    if (typeof maybeSvgWorkspace.getInjectionDiv === 'function' &&
      Blockly.utils?.svgMath?.screenToWsCoordinates) {
      const coordinate = new Blockly.utils.Coordinate(position.clientX, position.clientY);
      return Blockly.utils.svgMath.screenToWsCoordinates(maybeSvgWorkspace, coordinate);
    }

    const rect = blocklyDiv?.getBoundingClientRect();
    return rect
      ? { x: position.clientX - rect.left, y: position.clientY - rect.top }
      : { x: position.clientX, y: position.clientY };
  }

  function isInsideWorkspace(position: PaletteDropPosition) {
    const rect = blocklyDiv?.getBoundingClientRect();
    if (!rect) return false;

    return position.clientX >= rect.left &&
      position.clientX <= rect.right &&
      position.clientY >= rect.top &&
      position.clientY <= rect.bottom;
  }

  function addPaletteBlock(blockType: string, feature?: string, position?: PaletteDropPosition) {
    try {
      const block = workspace.newBlock(blockType);

      if (blockType === 'service' && feature === 'image') {
        block.setFieldValue('web', 'NAME');
        block.setFieldValue('nginx:latest', 'IMAGE');
      }

      block.initSvg?.();
      block.render?.();
      const coordinate = getDropWorkspaceCoordinate(position);
      block.moveBy?.(coordinate.x, coordinate.y);
      block.select?.();
      handleWorkspaceChange();
    } catch {
      // Headless tests may not provide rendered block methods.
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
      if (lineNumbers) {
        if (!code.trim()) {
          lineNumbers.textContent = '';
        } else {
          const lineCount = Math.max(1, code.split('\n').length - (code.endsWith('\n') ? 1 : 0));
          lineNumbers.textContent = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join('\n');
        }
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
    const state = deriveUiState(errors, code);
    validationUi.refresh(errors);
    updateYamlStatus(state);
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
    validationUi.refresh([]);
    if (codeOutput) codeOutput.textContent = '';
    if (lineNumbers) lineNumbers.textContent = '';
    if (exampleSelect) exampleSelect.value = DOCKER_COMPOSE_EXAMPLES[0].id;
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
      deriveUiState(validationUi.currentErrors, codeOutput?.textContent ?? '') === 'valid'
        ? 'Workspace validation passed.'
        : 'Validation errors found.'
    );
  }

  async function copyYaml() {
    try {
      await navigator.clipboard.writeText(generator.workspaceToCode(workspace));
      if (copyYamlButton) {
        const previousTitle = copyYamlButton.getAttribute('title') || 'Copy YAML';
        const previousLabel = copyYamlButton.getAttribute('aria-label') || 'Copy YAML';
        copyYamlButton.setAttribute('title', 'YAML copied');
        copyYamlButton.setAttribute('aria-label', 'YAML copied');
        setTimeout(() => {
          copyYamlButton.setAttribute('title', previousTitle);
          copyYamlButton.setAttribute('aria-label', previousLabel);
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

  let dragPreview: HTMLElement | null = null;
  let draggedPaletteItem: HTMLElement | null = null;

  function removeDragPreview() {
    dragPreview?.remove();
    dragPreview = null;
    document.body.classList.remove('palette-dragging');
  }

  function moveDragPreview(event: PointerEvent) {
    if (!dragPreview) return;

    dragPreview.style.left = event.clientX + 'px';
    dragPreview.style.top = event.clientY + 'px';
  }

  function finishPaletteDrag(event: PointerEvent) {
    const item = draggedPaletteItem;
    draggedPaletteItem = null;
    document.removeEventListener('pointermove', moveDragPreview);
    document.removeEventListener('pointerup', finishPaletteDrag);
    removeDragPreview();

    if (!item || !isInsideWorkspace(event)) return;

    const blockType = item.dataset.blockType;
    if (!blockType) return;

    addPaletteBlock(blockType, item.dataset.paletteFeature, {
      clientX: event.clientX,
      clientY: event.clientY
    });
  }

  function startPaletteDrag(item: HTMLElement, event: PointerEvent) {
    if (event.button !== 0) return;

    event.preventDefault();
    draggedPaletteItem = item;
    dragPreview = item.cloneNode(true) as HTMLElement;
    dragPreview.classList.add('palette-drag-preview');
    dragPreview.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dragPreview);
    document.body.classList.add('palette-dragging');
    moveDragPreview(event);
    document.addEventListener('pointermove', moveDragPreview);
    document.addEventListener('pointerup', finishPaletteDrag);
  }

  document.querySelectorAll<HTMLElement>('[data-block-type]').forEach((item) => {
    item.addEventListener('pointerdown', (event) => startPaletteDrag(item, event));
    item.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      event.preventDefault();
      const blockType = item.dataset.blockType;
      if (!blockType) return;

      addPaletteBlock(blockType, item.dataset.paletteFeature);
    });
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resizeWorkspace);
  }

  handleWorkspaceChange();

  return {
    workspace,
    handleWorkspaceChange
  };
}

