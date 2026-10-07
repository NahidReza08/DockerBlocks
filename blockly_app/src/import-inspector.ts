import type {
  DockerComposeImportLineReport,
  DockerComposeImportLineStatus,
  DockerComposeImportReport
} from './docker-compose-importer';

type ImportInspectorRenderOptions = {
  report: DockerComposeImportReport | null;
  generatedYaml: string;
  summaryElement: HTMLElement;
  bodyElement: HTMLElement;
};

const STATUS_LABELS: Record<DockerComposeImportLineStatus, string> = {
  imported: 'Imported',
  partial: 'Partially imported',
  unsupported: 'Unsupported / skipped',
  ignored: 'Ignored',
  invalid: 'Invalid'
};

function countStatuses(report: DockerComposeImportReport) {
  const counts: Record<DockerComposeImportLineStatus, number> = {
    imported: 0,
    partial: 0,
    unsupported: 0,
    ignored: 0,
    invalid: 0
  };

  report.lines.forEach((line) => {
    counts[line.status] += 1;
  });

  return counts;
}

function renderSummary(report: DockerComposeImportReport) {
  const counts = countStatuses(report);

  return 'Imported YAML  ' +
    '✓ ' + counts.imported + ' imported  ' +
    '⚠ ' + counts.partial + ' partial  ' +
    '✕ ' + (counts.unsupported + counts.invalid) + ' skipped  ' +
    '○ ' + counts.ignored + ' ignored';
}

function createLine(line: DockerComposeImportLineReport) {
  const row = document.createElement('div');
  row.className = 'import-code-line ' + line.status;

  const number = document.createElement('span');
  number.className = 'import-code-number';
  number.textContent = String(line.line);

  const code = document.createElement('span');
  code.className = 'import-code-text';
  code.textContent = line.text || ' ';

  const info = document.createElement('button');
  info.className = 'import-code-info';
  info.type = 'button';
  info.textContent = 'ⓘ';
  info.title = line.reason;
  info.setAttribute(
    'aria-label',
    STATUS_LABELS[line.status] + ': ' + line.reason
  );

  row.append(number, code, info);
  return row;
}

function createSourcePane(report: DockerComposeImportReport) {
  const pane = document.createElement('section');
  pane.className = 'import-inspector-pane source';
  pane.setAttribute('aria-label', 'My Imported YAML');

  const title = document.createElement('h3');
  title.textContent = 'My Imported YAML';

  const code = document.createElement('div');
  code.className = 'import-code-view source';
  report.lines.forEach((line) => {
    code.appendChild(createLine(line));
  });

  pane.append(title, code);
  return pane;
}

function createGeneratedPane(generatedYaml: string) {
  const pane = document.createElement('section');
  pane.className = 'import-inspector-pane generated';
  pane.setAttribute('aria-label', 'Generated / Preserved YAML');

  const title = document.createElement('h3');
  title.textContent = 'Generated / Preserved YAML';

  const code = document.createElement('pre');
  code.className = 'import-generated-code';
  code.textContent = generatedYaml || 'No Docker-Blocks YAML generated.';

  pane.append(title, code);
  return pane;
}

export function renderImportInspector({
  report,
  generatedYaml,
  summaryElement,
  bodyElement
}: ImportInspectorRenderOptions) {
  bodyElement.replaceChildren();

  if (!report) {
    summaryElement.textContent = 'No imported YAML is available.';
    return;
  }

  summaryElement.textContent = renderSummary(report);

  const layout = document.createElement('div');
  layout.className = 'import-inspector-split';
  layout.append(
    createSourcePane(report),
    createGeneratedPane(generatedYaml)
  );

  bodyElement.appendChild(layout);
}
