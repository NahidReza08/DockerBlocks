import * as Blockly from 'blockly';

import type { UiValidationError } from './app-types';
import {
  DOCKER_COMPOSE_EXAMPLES,
  loadDockerComposeExample
} from './docker-example';
import {
  importDockerComposeYaml,
  type DockerComposeImportReport,
  type DockerComposeImportResult
} from './docker-compose-importer';
import { collectDockerValidationErrors } from './docker-validation';
import { renderImportInspector } from './import-inspector';
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
    trashcan: true,
    maxTrashcanContents: 0
  });
  const codeOutput = document.getElementById('codeOutput');
  const lineNumbers = document.getElementById('lineNumbers');
  const errorOutput = document.getElementById('errorOutput');
  const actionStatus = document.getElementById('actionStatus');
  const yamlStatus = document.getElementById('yamlStatus');
  const blocklyDiv = document.getElementById('blocklyDiv');
  const exampleSelect = document.getElementById('exampleSelect') as HTMLSelectElement | null;
  const copyYamlButton = document.getElementById('copyYaml');
  const importDialog = document.getElementById('importDialog');
  const importYamlText = document.getElementById('importYamlText') as HTMLTextAreaElement | null;
  const importYamlFile = document.getElementById('importYamlFile') as HTMLInputElement | null;
  const importStatus = document.getElementById('importStatus');
  const importInspectorDialog = document.getElementById('importInspectorDialog');
  const importInspectorSummary = document.getElementById('importInspectorSummary');
  const importInspectorBody = document.getElementById('importInspectorBody');
  const clearWorkspaceDialog = document.getElementById('clearWorkspaceDialog');
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
  let lastImportReport: DockerComposeImportReport | null = null;

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

  function updateTrashState() {
    blocklyDiv?.classList.toggle(
      'workspace-empty',
      workspace.getAllBlocks(false).length === 0
    );
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
    updateTrashState();
    resizeWorkspace();
  }

  function showActionStatus(message: string) {
    if (actionStatus) actionStatus.textContent = message;
  }

  function showImportStatus(result: DockerComposeImportResult) {
    if (!importStatus) return;

    importStatus.hidden = false;
    importStatus.classList.remove('success', 'warning', 'error');
    importStatus.replaceChildren();

    const title = document.createElement('div');
    title.className = 'import-status-title';
    importStatus.appendChild(title);

    const message = document.createElement('div');
    message.className = 'import-status-message';
    importStatus.appendChild(message);

    if (!result.success) {
      importStatus.classList.add('error');
      title.textContent = 'YAML could not be imported';
      message.textContent = result.errors
        .map((error) => error.message)
        .join('\n');
      return;
    }

    const hasWarnings = result.warnings.length > 0 || result.unsupportedFields.length > 0;
    const issueCount = result.warnings.length + result.unsupportedFields.length;
    importStatus.classList.add(hasWarnings ? 'warning' : 'success');
    title.textContent = hasWarnings
      ? 'YAML imported with warnings'
      : 'YAML imported successfully';
    message.textContent =
      result.importedServices + ' ' + (result.importedServices === 1 ? 'service' : 'services') +
      ' imported\n' +
      result.importedNetworks + ' ' + (result.importedNetworks === 1 ? 'network' : 'networks') +
      ' imported' +
      (issueCount > 0 ? '\n' + issueCount + ' unsupported/partial ' + (issueCount === 1 ? 'item' : 'items') : '');

    if (result.report) {
      const detailsButton = document.createElement('button');
      detailsButton.className = 'secondary-button import-details-button';
      detailsButton.type = 'button';
      detailsButton.textContent = 'View Import Details';
      detailsButton.addEventListener('click', showImportInspector);
      importStatus.appendChild(detailsButton);
    }
  }

  function clearImportStatus() {
    if (!importStatus) return;

    importStatus.hidden = true;
    importStatus.replaceChildren();
    importStatus.classList.remove('success', 'warning', 'error');
    lastImportReport = null;
  }

  function showImportInspector() {
    if (!importInspectorDialog || !importInspectorBody || !importInspectorSummary) return;

    renderImportInspector({
      report: lastImportReport,
      generatedYaml: generator.workspaceToCode(workspace),
      summaryElement: importInspectorSummary,
      bodyElement: importInspectorBody
    });
    importInspectorDialog.removeAttribute('hidden');
  }

  function hideImportInspector() {
    importInspectorDialog?.setAttribute('hidden', '');
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
    clearImportStatus();
    handleWorkspaceChange();
    showActionStatus('');
  }

  function showClearWorkspaceDialog() {
    clearWorkspaceDialog?.removeAttribute('hidden');
  }

  function hideClearWorkspaceDialog() {
    clearWorkspaceDialog?.setAttribute('hidden', '');
  }

  function confirmTrashClearWorkspace() {
    hideClearWorkspaceDialog();
    clearWorkspace();
  }

  function workspaceIsDragging() {
    return typeof (workspace as Blockly.WorkspaceSvg).isDragging === 'function' &&
      (workspace as Blockly.WorkspaceSvg).isDragging();
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

  function showImportDialog() {
    if (importYamlText) importYamlText.value = '';
    if (importYamlFile) importYamlFile.value = '';
    importDialog?.removeAttribute('hidden');
    importYamlText?.focus();
  }

  function hideImportDialog() {
    importDialog?.setAttribute('hidden', '');
  }

  function applyImportText(yamlText: string) {
    const result = importDockerComposeYaml(yamlText);
    showImportStatus(result);

    if (!result.success || !result.workspaceState) {
      showActionStatus('YAML could not be imported.');
      return result;
    }

    lastImportReport = result.report ?? null;
    workspace.clear();
    Blockly.serialization.workspaces.load(result.workspaceState, workspace);
    (workspace as Blockly.WorkspaceSvg).scrollCenter?.();
    hideImportDialog();
    handleWorkspaceChange();
    showActionStatus('YAML imported.');

    return result;
  }

  function importPastedYaml() {
    applyImportText(importYamlText?.value ?? '');
  }

  function chooseYamlFile() {
    importYamlFile?.click();
  }

  function importYamlFileChange() {
    const file = importYamlFile?.files?.[0];
    if (!file) return;

    if (!/\.(ya?ml)$/i.test(file.name)) {
      showImportStatus({
        success: false,
        importedServices: 0,
        importedNetworks: 0,
        warnings: [],
        unsupportedFields: [],
        errors: [{
          path: '$',
          message: 'Only .yml and .yaml files can be imported.'
        }]
      });
      return;
    }

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      applyImportText(String(reader.result ?? ''));
    });
    reader.addEventListener('error', () => {
      showImportStatus({
        success: false,
        importedServices: 0,
        importedNetworks: 0,
        warnings: [],
        unsupportedFields: [],
        errors: [{
          path: '$',
          message: 'Could not read the selected YAML file.'
        }]
      });
    });
    reader.readAsText(file);
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

  function setupResizablePanels() {
    const shell = document.querySelector<HTMLElement>('.app-shell');
    if (!shell) return;

    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), max);

    document.querySelectorAll<HTMLElement>('[data-resizer]').forEach((handle) => {
      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        const kind = handle.dataset.resizer;
        const startX = event.clientX;
        const startY = event.clientY;
        const rect = shell.getBoundingClientRect();
        const styles = getComputedStyle(shell);
        const startToolbox = parseFloat(styles.getPropertyValue('--toolbox-width')) || 240;
        const startYaml = parseFloat(styles.getPropertyValue('--yaml-width')) || 430;
        const startBottom = parseFloat(styles.getPropertyValue('--bottom-height')) || 190;
        const bottomGrid = document.querySelector<HTMLElement>('.bottom-grid');
        const startValidation = bottomGrid
          ? bottomGrid.getBoundingClientRect().width * 0.52
          : rect.width * 0.5;

        handle.classList.add('active');

        const onMove = (moveEvent: PointerEvent) => {
          if (kind === 'toolbox') {
            shell.style.setProperty('--toolbox-width', clamp(startToolbox + moveEvent.clientX - startX, 190, 360) + 'px');
          } else if (kind === 'yaml') {
            shell.style.setProperty('--yaml-width', clamp(startYaml - (moveEvent.clientX - startX), 300, 640) + 'px');
          } else if (kind === 'bottom') {
            shell.style.setProperty('--bottom-height', clamp(startBottom - (moveEvent.clientY - startY), 150, 280) + 'px');
          } else if (kind === 'validation') {
            shell.style.setProperty('--validation-width', clamp(startValidation + moveEvent.clientX - startX, 350, rect.width - 320) + 'px');
          }
          resizeWorkspace();
        };

        const onUp = () => {
          handle.classList.remove('active');
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          resizeWorkspace();
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    });
  }

  function interceptTrashClick(event: MouseEvent | PointerEvent) {
    const target = event.target as Element | null;
    if (!target?.closest?.('.blocklyTrash')) return;
    if (workspaceIsDragging()) return;

    event.preventDefault();
    event.stopPropagation();
    if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();

    if (workspace.getAllBlocks(false).length === 0) {
      hideClearWorkspaceDialog();
      return;
    }

    showClearWorkspaceDialog();
  }

  populateExampleSelector();
  validationUi.refresh(collectValidationErrors());
  workspace.addChangeListener(handleWorkspaceChange);

  document.getElementById('loadExample')?.addEventListener('click', loadExample);
  document.getElementById('openImportYaml')?.addEventListener('click', showImportDialog);
  document.getElementById('importYamlSubmit')?.addEventListener('click', importPastedYaml);
  document.getElementById('importYamlCancel')?.addEventListener('click', hideImportDialog);
  document.getElementById('openImportInspector')?.addEventListener('click', showImportInspector);
  document.getElementById('closeImportInspector')?.addEventListener('click', hideImportInspector);
  document.getElementById('confirmTrashClear')?.addEventListener('click', confirmTrashClearWorkspace);
  document.getElementById('cancelTrashClear')?.addEventListener('click', hideClearWorkspaceDialog);
  document.getElementById('chooseYamlFile')?.addEventListener('click', chooseYamlFile);
  importYamlFile?.addEventListener('change', importYamlFileChange);
  document.getElementById('validateWorkspace')?.addEventListener('click', validateWorkspace);
  document.getElementById('clearWorkspace')?.addEventListener('click', clearWorkspace);
  document.getElementById('copyYaml')?.addEventListener('click', copyYaml);
  document.getElementById('downloadYaml')?.addEventListener('click', downloadYaml);
  blocklyDiv?.addEventListener('pointerup', interceptTrashClick, true);
  blocklyDiv?.addEventListener('click', interceptTrashClick, true);
  setupResizablePanels();

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

