import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as Blockly from 'blockly';
import { javascriptGenerator, Order } from 'blockly/javascript';
import ts from 'typescript';
import { parseDocument } from 'yaml';
import { loadGrammar } from '../../generate_blockly/src/grammar-loader.js';
import { buildIR } from '../../generate_blockly/src/ir-builder.js';
import { generateMainTs } from '../../generate_blockly/src/blockly-ts-target.js';

const root = new URL('../../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8').replace(/\r\n/g, '\n');
const main = read('blockly_app/src/main.ts');
const grammar = await loadGrammar(fileURLToPath(new URL('generate_blockly/input/docker-compose.langium', root)));
assert.equal(generateMainTs(buildIR(grammar)), main, 'Runtime main.ts matches regenerated template exactly');

function execute(source, context) {
  const script = source.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  vm.runInContext(ts.transpileModule(script, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText, context);
}

function executeScoped(source, context, expose) {
  const script = source.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const output = ts.transpileModule(script, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText;
  vm.runInContext(`(() => {\n${output}\n${expose.map(name => `globalThis.${name} = ${name};`).join('\n')}\n})();`, context);
}

function element() {
  const node = {
    textContent: '', children: [], listeners: {}, className: '', hidden: false, value: '',
    title: '', attributes: {}, style: {}, dataset: {}, files: undefined,
    classList: {
      values: new Set(),
      add(...names) { names.forEach(name => this.values.add(name)); },
      remove(...names) { names.forEach(name => this.values.delete(name)); },
      contains(name) { return this.values.has(name); },
      toggle(name, force) {
        const shouldAdd = force ?? !this.values.has(name);
        if (shouldAdd) this.values.add(name);
        else this.values.delete(name);
        return shouldAdd;
      }
    },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { children.forEach(child => this.appendChild(child)); },
    replaceChildren() { this.children = []; this.textContent = ''; },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    removeEventListener(type) { delete this.listeners[type]; },
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'hidden') this.hidden = true; if (name === 'title') this.title = String(value); },
    removeAttribute(name) { delete this.attributes[name]; if (name === 'hidden') this.hidden = false; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    getBoundingClientRect() { return this.rect ?? { left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600 }; },
    cloneNode() { const clone = element(); clone.dataset = { ...this.dataset }; clone.textContent = this.textContent; return clone; },
    click() { this.clicked = true; this.listeners.click?.({ preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, target: this }); },
    focus() { this.focused = true; },
    remove() { this.removed = true; },
    closest() { return null; }
  };
  return node;
}

function textContentDeep(node) {
  return (node.textContent ?? '') + (node.children ?? []).map(textContentDeep).join('');
}

function validationMessages() {
  return elements.errorOutput.children
    .filter(child => child.className === 'validation-error')
    .map(child => textContentDeep(child));
}

function assertNoBlankImportStatus(label) {
  assert.equal(elements.importStatus.hidden, true, `${label}: import status is hidden without import/edit content`);
  assert.equal(elements.importStatus.children.length, 0, `${label}: import status has no empty rendered children`);
  assert.equal(textContentDeep(elements.importStatus), '', `${label}: import status has no empty rendered text`);
}

function assertVisibleImportStatus(label) {
  assert.equal(elements.importStatus.hidden, false, `${label}: import status is visible`);
  assert.notEqual(textContentDeep(elements.importStatus).trim(), '', `${label}: import status has meaningful content`);
}

const ids = [
  'codeOutput', 'lineNumbers', 'errorOutput', 'actionStatus', 'yamlStatus', 'blocklyDiv',
  'summaryEmpty', 'summaryServicesItem', 'summaryNetworksItem', 'summaryVolumesItem',
  'summaryDependenciesItem', 'summaryHealthchecksItem',
  'summaryEmptyTitle', 'summaryEmptyMessage',
  'summaryServices', 'summaryNetworks', 'summaryVolumes', 'summaryDependencies', 'summaryHealthchecks',
  'exampleSelect', 'loadExample', 'openImportYaml', 'editYaml', 'importDialog', 'importDialogTitle', 'importYamlText',
  'importYamlFile', 'importStatus', 'importYamlSubmit', 'importYamlCancel', 'chooseYamlFile',
  'openImportInspector', 'importInspectorDialog', 'importInspectorSummary', 'importInspectorBody',
  'closeImportInspector', 'clearWorkspaceDialog', 'confirmTrashClear', 'cancelTrashClear',
  'replaceWorkspaceDialog', 'confirmReplaceWorkspace', 'cancelReplaceWorkspace',
  'clearWorkspace', 'copyYaml', 'downloadYaml'
];
const elements = Object.fromEntries(ids.map(id => [id, element()]));
elements.blocklyDiv.rect = { left: 100, top: 100, right: 700, bottom: 500, width: 600, height: 400 };
elements.copyYaml.setAttribute('title', 'Copy YAML');
elements.copyYaml.setAttribute('aria-label', 'Copy YAML');
elements.downloadYaml.setAttribute('title', 'Download YAML');
elements.downloadYaml.setAttribute('aria-label', 'Download YAML');
elements.importDialog.hidden = true;
elements.importInspectorDialog.hidden = true;
elements.clearWorkspaceDialog.hidden = true;
elements.replaceWorkspaceDialog.hidden = true;
elements.importStatus.hidden = true;
const shell = element();
shell.className = 'app-shell';
shell.style.setProperty = (name, value) => { shell.style[name] = value; };
const bottomGrid = element();
bottomGrid.className = 'bottom-grid';
const paletteItems = [
  'compose', 'service', 'image', 'build', 'port', 'environment',
  'volume', 'dependency', 'networkref', 'restart', 'healthcheck', 'network'
].map(type => {
  const item = element();
  item.dataset = { blockType: type };
  return item;
});
const resizers = ['toolbox', 'yaml', 'bottom', 'validation'].map(kind => {
  const item = element();
  item.dataset = { resizer: kind };
  return item;
});
const workspace = new Blockly.Workspace();
workspace.scroll = () => {};
const timers = [];
const downloads = [];
const anchors = [];
let copied;
let injectedOptions;
const documentListeners = {};
const navigator = { clipboard: { async writeText(text) { copied = text; } } };
class FileReaderMock {
  constructor() { this.listeners = {}; this.result = ''; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  readAsText(file) { this.result = file.textContent ?? ''; this.listeners.load?.(); }
}

const context = vm.createContext({
  Blockly: { ...Blockly, inject: (_id, options) => { injectedOptions = options; return workspace; } },
  javascriptGenerator, Order, validationErrors: [], navigator, Blob, FileReader: FileReaderMock, parseDocument,
  URL: {
    createObjectURL(blob) { downloads.push(blob); return 'blob:yaml'; },
    revokeObjectURL() {}
  },
  setTimeout(callback, delay) { timers.push({ callback, delay }); },
  getComputedStyle() {
    return { getPropertyValue(name) {
      return shell.style[name] ?? (name === '--toolbox-width' ? '240' : name === '--yaml-width' ? '430' : name === '--bottom-height' ? '190' : '500');
    } };
  },
  document: {
    getElementById: id => elements[id],
    body: element(),
    addEventListener(type, handler) { documentListeners[type] = handler; },
    removeEventListener(type) { delete documentListeners[type]; },
    querySelector(selector) {
      if (selector === '.app-shell') return shell;
      if (selector === '.bottom-grid') return bottomGrid;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-block-type]') return paletteItems;
      if (selector === '[data-resizer]') return resizers;
      return [];
    },
    createElement(tag) {
      const node = element();
      if (tag === 'a') anchors.push(node);
      return node;
    }
  }
});
const click = id => elements[id].listeners.click();

try {
  execute(read('blockly_app/src/docker-yaml.ts'), context);
  execute(read('blockly_app/src/docker-validation.ts'), context);
  execute(read('blockly_app/src/validation-ui.ts'), context);
  execute(read('blockly_app/src/docker-example.ts'), context);
  executeScoped(read('blockly_app/src/docker-compose-importer.ts'), context, ['importDockerComposeYaml']);
  execute(read('blockly_app/src/import-inspector.ts'), context);
  execute(read('blockly_app/src/app-bootstrap.ts'), context);
  execute(read('blockly_app/src/blocks.ts'), context);
  execute(read('blockly_app/src/generator.ts'), context);
  execute(main.replace('bootstrapBlocklyApp({', 'globalThis.app = bootstrapBlocklyApp({'), context);

  assert.equal(injectedOptions.move.scrollbars, true);
  assert.deepEqual(elements.exampleSelect.children.map(option => option.textContent), ['Full Compose', 'Service', 'Network']);
  assert.equal(elements.codeOutput.textContent, '');
  assert.match(textContentDeep(elements.errorOutput), /No configuration yet/);
  assert.equal(elements.blocklyDiv.classList.contains('workspace-empty'), true);
  assertNoBlankImportStatus('Empty workspace validation panel');
  click('openImportInspector');
  assert.match(textContentDeep(elements.importInspectorSummary), /No YAML transformation history yet/);
  assert.match(textContentDeep(elements.importInspectorBody), /Import YAML or edit the generated YAML/);
  click('closeImportInspector');

  click('loadExample');
  assert.equal(elements.actionStatus.textContent, 'Full Compose loaded.');
  assert.equal(elements.summaryServices.textContent, '2');
  assert.equal(elements.summaryNetworks.textContent, '1');
  assert.equal(elements.yamlStatus.textContent, 'Valid');
  assert.ok(elements.codeOutput.textContent.includes('healthcheck:'));
  assertNoBlankImportStatus('Valid Blockly validation panel');
  let yamlAfterFullExample = elements.codeOutput.textContent;

  workspace.clear();
  Blockly.serialization.workspaces.load({
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: 'compose',
        inputs: {
          ELEMENTS: {
            block: {
              type: 'service',
              fields: { NAME: 'web' }
            }
          }
        }
      }]
    }
  }, workspace);
  context.app.handleWorkspaceChange();
  assert.match(textContentDeep(elements.errorOutput), /requires an image or build configuration/);
  assert.equal(validationMessages().length, 1);
  assertNoBlankImportStatus('Invalid Blockly validation panel');

  click('loadExample');
  assert.equal(elements.actionStatus.textContent, 'Full Compose loaded.');
  assert.equal(elements.summaryServices.textContent, '2');
  assert.equal(elements.summaryNetworks.textContent, '1');
  assert.equal(elements.yamlStatus.textContent, 'Valid');
  yamlAfterFullExample = elements.codeOutput.textContent;

  click('editYaml');
  assert.equal(elements.importDialog.hidden, false);
  assert.equal(elements.importDialogTitle.textContent, 'Edit Docker Compose YAML');
  assert.equal(elements.importYamlText.value, yamlAfterFullExample);
  assert.equal(elements.chooseYamlFile.hidden, true);
  assert.equal(elements.importYamlSubmit.textContent, 'Apply to Blocks');
  click('importYamlCancel');
  assert.equal(elements.codeOutput.textContent, yamlAfterFullExample, 'Canceling YAML edit preserves workspace');

  click('editYaml');
  elements.importYamlText.value = [
    'services:',
    '  edited:',
    '    image: nginx',
    '    ports:',
    '      - "8080:80"',
    '    command: npm start',
    ''
  ].join('\n');
  click('importYamlSubmit');
  assert.equal(elements.importDialog.hidden, true);
  assert.match(textContentDeep(elements.importStatus), /YAML edit applied with warnings/);
  assertVisibleImportStatus('YAML edit warning status');
  assert.equal(elements.summaryServices.textContent, '1');
  assert.match(elements.codeOutput.textContent, /edited:/);
  assert.match(elements.codeOutput.textContent, /"8080:80"/);
  assert.doesNotMatch(elements.codeOutput.textContent, /command:/);
  assert.equal(elements.yamlStatus.textContent, 'Valid');
  click('openImportInspector');
  assert.match(textContentDeep(elements.importInspectorSummary), /Edited YAML/);
  assert.match(textContentDeep(elements.importInspectorBody), /Edited YAML/);
  assert.match(textContentDeep(elements.importInspectorBody), /command: npm start/);
  click('closeImportInspector');

  const yamlAfterEdit = elements.codeOutput.textContent;
  click('editYaml');
  elements.importYamlText.value = 'services:\n  web: [';
  click('importYamlSubmit');
  assert.equal(elements.codeOutput.textContent, yamlAfterEdit, 'Malformed YAML edit preserves workspace');
  assert.equal(elements.importDialog.hidden, false);
  assert.match(textContentDeep(elements.importStatus), /YAML edit failed/);
  assertVisibleImportStatus('YAML edit failure status');
  click('importYamlCancel');

  elements.exampleSelect.value = 'service';
  assert.equal(elements.summaryServices.textContent, '1', 'Changing example selection alone does not load');
  click('loadExample');
  assert.equal(elements.summaryServices.textContent, '2', 'Service example adds without clearing');
  assert.ok(elements.codeOutput.textContent.length > yamlAfterEdit.length);
  elements.exampleSelect.value = 'network';
  click('loadExample');
  assert.equal(elements.summaryNetworks.textContent, '1', 'Network example adds without clearing');

  click('openImportYaml');
  assert.equal(elements.importDialogTitle.textContent, 'Import Docker Compose YAML');
  assert.equal(elements.chooseYamlFile.hidden, false);
  assert.equal(elements.importYamlSubmit.textContent, 'Import');
  const importedYaml = [
    "version: '3.8'",
    '# Database Service',
    'services:',
    '  web:',
    '    image: nginx:latest',
    '    command: npm start',
    '    depends_on:',
    '      db:',
    '        condition: service_healthy',
    '    ports:',
    '      - "8080:80"',
    '  db:',
    '    image: postgres:16',
    ''
  ].join('\n');
  elements.importYamlText.value = importedYaml;
  click('importYamlSubmit');
  assert.equal(elements.replaceWorkspaceDialog.hidden, false, 'Non-empty workspace import asks before replacing');
  const beforeReplaceYaml = elements.codeOutput.textContent;
  click('cancelReplaceWorkspace');
  assert.equal(elements.replaceWorkspaceDialog.hidden, true);
  assert.equal(elements.codeOutput.textContent, beforeReplaceYaml, 'Canceling replacement preserves workspace');
  click('importYamlSubmit');
  click('confirmReplaceWorkspace');
  assert.equal(elements.importDialog.hidden, true);
  assert.match(textContentDeep(elements.importStatus), /YAML imported with warnings/);
  assert.match(textContentDeep(elements.importStatus), /unsupported\/partial/);
  assertVisibleImportStatus('YAML import warning status');
  assert.equal(validationMessages().length, 0, 'Unsupported fields stay out of normal validation');
  click('openImportInspector');
  assert.equal(elements.importInspectorDialog.hidden, false);
  assert.match(textContentDeep(elements.importInspectorSummary), /Imported YAML/);
  assert.match(textContentDeep(elements.importInspectorSummary), /partial/);
  assert.match(textContentDeep(elements.importInspectorBody), /My Imported YAML/);
  assert.match(textContentDeep(elements.importInspectorBody), /Generated \/ Preserved YAML/);
  assert.match(textContentDeep(elements.importInspectorBody), /version: '3.8'/);
  assert.match(textContentDeep(elements.importInspectorBody), /command: npm start/);
  assert.match(textContentDeep(elements.importInspectorBody), /condition: service_healthy/);
  assert.match(textContentDeep(elements.importInspectorBody), /services:\n  web:\n    image: nginx:latest/);
  const infoButtons = elements.importInspectorBody.children[0].children[0].children[1].children
    .flatMap(row => row.children.filter?.(child => child.className === 'import-code-info') ?? []);
  assert.ok(infoButtons.some(button => /metadata/.test(button.title)), 'Inspector info buttons expose ignored metadata reason');
  assert.ok(infoButtons.some(button => /not supported/.test(button.title)), 'Inspector info buttons expose unsupported or partial reason');
  click('closeImportInspector');

  const beforeMalformed = elements.codeOutput.textContent;
  click('openImportYaml');
  elements.importYamlText.value = 'services:\n  web: [';
  click('importYamlSubmit');
  click('confirmReplaceWorkspace');
  assert.equal(elements.codeOutput.textContent, beforeMalformed, 'Malformed YAML preserves workspace');
  assert.equal(elements.importDialog.hidden, false);
  click('importYamlCancel');

  click('clearWorkspace');
  elements.importYamlFile.files = [{ name: 'docker-compose.yaml', textContent: 'services:\n  worker:\n    image: alpine\n' }];
  elements.importYamlFile.listeners.change();
  assert.equal(elements.summaryServices.textContent, '1', 'File import replaces workspace');
  assertVisibleImportStatus('YAML file import success status');

  resizers[0].listeners.pointerdown({ preventDefault() {}, clientX: 200, clientY: 0 });
  documentListeners.pointermove({ clientX: 260, clientY: 0 });
  documentListeners.pointerup();
  assert.ok(shell.style['--toolbox-width'], 'Resizable layout updates CSS variables');

  click('clearWorkspace');
  assert.equal(elements.importStatus.hidden, true);
  assertNoBlankImportStatus('Cleared workspace validation panel');
  assert.equal(elements.codeOutput.textContent, '');
  assert.equal(elements.blocklyDiv.classList.contains('workspace-empty'), true);
  click('openImportInspector');
  assert.match(textContentDeep(elements.importInspectorSummary), /No YAML transformation history/);
  click('closeImportInspector');

  const trashTarget = element();
  trashTarget.closest = selector => selector === '.blocklyTrash' ? trashTarget : null;
  elements.blocklyDiv.listeners.pointerup({
    target: trashTarget,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; },
    stopImmediatePropagation() { this.immediateStopped = true; }
  });
  assert.equal(elements.clearWorkspaceDialog.hidden, true, 'Empty workspace trash click does nothing');

  click('loadExample');
  elements.blocklyDiv.listeners.pointerup({
    target: trashTarget,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; },
    stopImmediatePropagation() { this.immediateStopped = true; }
  });
  assert.equal(elements.clearWorkspaceDialog.hidden, false, 'Trash click opens only confirmation modal');
  click('cancelTrashClear');
  assert.equal(elements.clearWorkspaceDialog.hidden, true);
  assert.equal(elements.summaryServices.textContent, '2', 'Cancel preserves workspace');
  elements.blocklyDiv.listeners.pointerup({
    target: trashTarget,
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {}
  });
  click('confirmTrashClear');
  assert.equal(elements.codeOutput.textContent, '', 'Confirm clears workspace');

  await click('copyYaml');
  assert.equal(copied, '');
  click('downloadYaml');
  assert.equal(await downloads.at(-1).text(), '');

  const html = read('blockly_app/index.html');
  for (const id of [
    'openImportYaml', 'editYaml', 'openImportInspector', 'importInspectorDialog',
    'replaceWorkspaceDialog', 'confirmReplaceWorkspace', 'cancelReplaceWorkspace',
    'clearWorkspaceDialog', 'confirmTrashClear', 'cancelTrashClear'
  ]) {
    assert.ok(html.includes(`id="${id}"`), `HTML includes ${id}`);
  }
  assert.equal(html.includes('id="validateWorkspace"'), false, 'Manual Validate button is removed');
  assert.equal((html.match(/data-resizer=/g) ?? []).length, 4, 'Four layout resizers are present');
  assert.equal((html.match(/data-block-type=/g) ?? []).length, 12, 'Palette exposes every supported block action');
  assert.ok(html.includes('class="example-loader"'), 'Example select and load button are merged into one control');
  assert.equal(html.includes('Example</span>'), false, 'Toolbar no longer has redundant Example label text');
  assert.ok(html.includes('docker-blocks-icon.svg'), 'Header/browser branding uses the Docker-Blocks icon');
  assert.ok(html.includes('icon-hierarchy') && html.includes('icon-sliders') && html.includes('icon-collection'), 'Toolbox category icons are distinct');
  assert.ok(read('blockly_app/src/app-bootstrap.ts').includes('maxTrashcanContents: 0'), 'Blockly trash history flyout is disabled');
  assert.ok(html.includes('validation-panel-content') && html.includes('overflow-y: auto'), 'Validation body owns the scroll container');
  assert.equal(/\.validation-panel-content\s*\{[^}]*position:\s*(absolute|sticky|fixed)/.test(html), false, 'Validation scroll body avoids overlapping positioning');
  assert.equal(/\.import-status\s*\{[^}]*position:\s*(absolute|sticky|fixed)/.test(html), false, 'Import status remains in normal document flow');
  assert.ok(/\.import-status\[hidden\]\s*\{[^}]*display:\s*none/.test(html), 'Hidden import status occupies no validation panel layout space');
  assert.equal(/#errorOutput[\s\S]*overflow:\s*visible/.test(html), true, 'Validation cards remain normal-flow content inside the scroll body');
  assert.ok(html.includes('.import-status-header'), 'Import status uses a header row for right-aligned actions');
  assert.ok(
    html.includes('.import-details-button') &&
      html.includes('margin-left: auto') &&
      html.includes('justify-content: flex-end') &&
      html.includes('text-align: right'),
    'Import details action is lightweight and right-aligned'
  );
  assert.ok(html.includes('max-height: min(90vh, 900px)'), 'Inspector modal is viewport bounded');
  assert.ok(/#importInspectorBody\s*\{[^}]*overflow-y:\s*auto/.test(html), 'Inspector body owns the shared vertical scrollbar');
  assert.equal(/\.import-code-view,[\s\S]*overflow-y:\s*visible/.test(html), true, 'Inspector panes do not create separate vertical scrollbars');
  assert.ok(read('blockly_app/src/blocks.ts').includes('"name": "CONFIG"'), 'Generated Service uses dynamic CONFIG chain');
  assert.ok(read('blockly_app/src/blocks.ts').includes('"name": "ELEMENTS"'), 'Generated Compose uses dynamic ELEMENTS chain');

  console.log('[PASS] Final UI actions: dynamic examples, import inspector, bounded/resizable layout hooks, copy/download, runtime/template parity');
} finally {
  workspace.dispose();
}
