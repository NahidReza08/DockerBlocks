import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as Blockly from 'blockly';
import { javascriptGenerator, Order } from 'blockly/javascript';
import ts from 'typescript';
import { loadGrammar } from '../../generate_blockly/src/grammar-loader.js';
import { buildIR } from '../../generate_blockly/src/ir-builder.js';
import { generateMainTs } from '../../generate_blockly/src/blockly-ts-target.js';

const root = new URL('../../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8').replace(/\r\n/g, '\n');
const main = read('blockly_app/src/main.ts');
const grammar = await loadGrammar(fileURLToPath(new URL('generate_blockly/input/docker-compose.langium', root)));
assert.equal(generateMainTs(buildIR(grammar)), main, 'Runtime main.ts matches regenerated template exactly');

// Execute the real handlers with real headless Blockly and a minimal DOM surface.
function execute(source, context) {
  const script = source
    .replace(/^import[\s\S]*?;\r?\n/gm, '')
    .replace(/^export /gm, '');
  vm.runInContext(ts.transpileModule(script, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText, context);
}

function element() {
  return {
    textContent: '', children: [], listeners: {},
    className: '',
    hidden: false,
    value: '',
    title: '',
    attributes: {},
    style: {},
    dataset: {},
    classList: {
      values: new Set(),
      add(...names) { names.forEach(name => this.values.add(name)); },
      remove(...names) { names.forEach(name => this.values.delete(name)); },
      contains(name) { return this.values.has(name); }
    },
    appendChild(child) { this.children.push(child); return child; },
    get lastElementChild() { return this.children.at(-1) ?? null; },
    replaceChildren() { this.children = []; this.textContent = ''; },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'title') this.title = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    getBoundingClientRect() { return this.rect ?? { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    cloneNode() {
      const clone = element();
      clone.className = this.className;
      clone.textContent = this.textContent;
      clone.dataset = { ...this.dataset };
      return clone;
    },
    click() { this.clicked = true; this.listeners.click?.(); },
    remove() { this.removed = true; }
  };
}

function textContentDeep(node) {
  return (node.textContent ?? '') + (node.children ?? []).map(textContentDeep).join('');
}

function validationMessages() {
  return elements.errorOutput.children
    .filter(child => child.className === 'validation-error')
    .map(child => {
    const message = child.children?.[1]?.children?.find(grandchild =>
      grandchild.className === 'validation-error-title'
    );
    return message?.textContent ?? textContentDeep(child);
  });
}

const ids = [
  'codeOutput', 'lineNumbers', 'errorOutput', 'actionStatus', 'yamlStatus',
  'summaryEmpty', 'summaryServicesItem', 'summaryNetworksItem', 'summaryVolumesItem',
  'summaryDependenciesItem', 'summaryHealthchecksItem',
  'summaryEmptyTitle', 'summaryEmptyMessage', 'blocklyDiv',
  'summaryServices', 'summaryNetworks', 'summaryVolumes', 'summaryDependencies', 'summaryHealthchecks',
  'exampleSelect', 'loadExample', 'validateWorkspace', 'clearWorkspace', 'copyYaml', 'downloadYaml'
];
const elements = Object.fromEntries(ids.map(id => [id, element()]));
elements.blocklyDiv.rect = { left: 100, top: 100, right: 700, bottom: 500, width: 600, height: 400 };
elements.copyYaml.setAttribute('title', 'Copy YAML');
elements.copyYaml.setAttribute('aria-label', 'Copy YAML');
elements.downloadYaml.setAttribute('title', 'Download YAML');
elements.downloadYaml.setAttribute('aria-label', 'Download YAML');
const paletteItems = [
  'compose', 'service', 'service', 'build', 'port', 'environment',
  'volume', 'dependency', 'networkref', 'restart', 'healthcheck', 'network'
].map(type => {
  const item = element();
  item.dataset = { blockType: type };
  return item;
});
paletteItems[2].dataset.paletteFeature = 'image';
const workspace = new Blockly.Workspace();
workspace.scroll = () => {};
const anchors = [];
const downloads = [];
const revoked = [];
const timers = [];
const documentListeners = {};
let copied;
let injectedOptions;
const navigator = { clipboard: { async writeText(text) { copied = text; } } };
const context = vm.createContext({
  Blockly: { ...Blockly, inject: (_id, options) => { injectedOptions = options; return workspace; } }, javascriptGenerator, Order,
  validationErrors: [], navigator, Blob,
  URL: {
    createObjectURL(blob) { downloads.push(blob); return 'blob:yaml'; },
    revokeObjectURL(url) { revoked.push(url); }
  },
  setTimeout(callback, delay) { timers.push({ callback, delay }); },
  document: {
    getElementById: id => elements[id], body: element(),
    addEventListener(type, handler) { documentListeners[type] = handler; },
    removeEventListener(type, handler) {
      if (documentListeners[type] === handler) delete documentListeners[type];
    },
    querySelectorAll(selector) {
      return selector === '[data-block-type]' ? paletteItems : [];
    },
    createElement(tag) {
      const node = element();
      if (tag === 'a') anchors.push(node);
      return node;
    }
  }
});
const click = id => elements[id].listeners.click();
const keyboardCreate = (item, key = 'Enter') => item.listeners.keydown({
  key,
  preventDefault() { this.defaultPrevented = true; }
});
const pointerEvent = (clientX, clientY) => ({
  button: 0,
  clientX,
  clientY,
  preventDefault() { this.defaultPrevented = true; }
});
const dragPaletteItem = (item, clientX, clientY) => {
  item.listeners.pointerdown(pointerEvent(12, 12));
  documentListeners.pointerup(pointerEvent(clientX, clientY));
};
const clean = () => {
  assert.ok(
    elements.errorOutput.children.length >= 1,
    'Validation panel should show empty state or relevant successful checks'
  );
  assert.equal(validationMessages().some(message => message.includes('Validation issue')), false);
};

function validationText() {
  return textContentDeep(elements.errorOutput);
}

try {
  execute(read('blockly_app/src/docker-yaml.ts'), context);
  execute(read('blockly_app/src/docker-validation.ts'), context);
  execute(read('blockly_app/src/validation-ui.ts'), context);
  execute(read('blockly_app/src/docker-example.ts'), context);
  execute(read('blockly_app/src/app-bootstrap.ts'), context);
  execute(read('blockly_app/src/blocks.ts'), context);
  execute(read('blockly_app/src/generator.ts'), context);
  execute(main.replace('bootstrapBlocklyApp({', 'globalThis.app = bootstrapBlocklyApp({'), context);
  assert.equal(injectedOptions.move.scrollbars, true, 'Blockly native scrollbars are enabled');
  assert.equal(injectedOptions.move.drag, true, 'Blockly workspace drag panning is enabled');
  assert.equal(injectedOptions.move.wheel, true, 'Blockly wheel navigation is enabled');
  const simpleExpected = [
    'services:',
    '  web:',
    '    image: nginx:latest',
    '    restart: unless-stopped',
    '    ports:',
    '      - "8080:80"',
    ''
  ].join('\n');
  const multiExpectedSections = [
    '  web:',
    '    image: docker-blocks-demo-web:latest',
    '    build: .',
    '    restart: unless-stopped',
    '    healthcheck:',
    '      test: ["CMD-SHELL", "curl -f http://localhost || exit 1"]',
    '    depends_on:',
    '      - database',
    '    networks:',
    '      - backend',
    '    ports:',
    '      - "8080:80"',
    '    environment:',
    '      APP_ENV: production',
    '      DATABASE_HOST: database',
    '  database:',
    '    image: postgres:latest',
    '      POSTGRES_PASSWORD: example',
    '    volumes:',
    '      - "./data:/var/lib/postgresql/data"',
    'networks:',
    '  backend:',
    '    driver: bridge'
  ];
  assert.deepEqual(
    elements.exampleSelect.children.map(option => option.textContent),
    ['Simple Web Service', 'Multi-Service Application'],
    'Example selector exposes the polished demo examples'
  );
  assert.equal(elements.exampleSelect.value, 'simple-web-service');
  assert.equal(elements.codeOutput.textContent, '', 'Initial workspace has no generated YAML');
  assert.equal(elements.lineNumbers?.textContent ?? '', '');
  assert.equal(elements.yamlStatus.textContent, 'Invalid');
  assert.equal(elements.summaryServices.textContent, '0');
  assert.equal(elements.summaryEmpty.hidden, false);
  assert.equal(elements.summaryServicesItem.hidden, true);
  assert.equal(workspace.getAllBlocks(false).length, 0);
  assert.match(validationText(), /No configuration yet/);
  assert.match(validationText(), /Start by adding a Compose block/);
  assert.equal(elements.errorOutput.children[0].className, 'validation-empty-state');
  assert.equal(validationText().includes('Ports valid'), false, 'Empty workspace does not show unrelated green validation');

  paletteItems[1].click();
  assert.equal(workspace.getAllBlocks(false).length, 0, 'Clicking a palette row does not create a block');
  dragPaletteItem(paletteItems[1], 20, 20);
  assert.equal(workspace.getAllBlocks(false).length, 0, 'Dropping outside the workspace creates nothing');
  dragPaletteItem(paletteItems[0], 280, 180);
  assert.equal(workspace.getAllBlocks(false).filter(block => block.type === 'compose').length, 1,
    'Dragging Compose into the workspace creates a Compose block');
  assert.equal(elements.codeOutput.textContent, 'services:\n');
  assert.match(validationText(), /Compose structure is incomplete/);
  assert.match(validationText(), /Add at least one Service block/);
  keyboardCreate(paletteItems[1], 'Enter');
  assert.equal(workspace.getAllBlocks(false).filter(block => block.type === 'service').length, 1,
    'Keyboard activation still creates blocks for accessibility');
  dragPaletteItem(paletteItems[11], 320, 220);
  assert.equal(workspace.getAllBlocks(false).filter(block => block.type === 'network').length, 1,
    'Multiple palette blocks can be dragged in');
  click('clearWorkspace');
  dragPaletteItem(paletteItems[11], 320, 220);
  assert.equal(workspace.getAllBlocks(false).filter(block => block.type === 'network').length, 1,
    'A resource-only workspace can be represented');
  assert.equal(elements.summaryNetworksItem.hidden, false);
  assert.equal(elements.summaryEmpty.hidden, false);
  assert.match(elements.summaryEmptyTitle.textContent, /No valid service configuration yet/);
  assert.match(validationText(), /No valid service configuration yet/);
  click('clearWorkspace');
  assert.equal(workspace.getAllBlocks(false).length, 0);
  assert.equal(elements.codeOutput.textContent, '');
  assert.equal(elements.yamlStatus.textContent, 'Invalid');
  assert.equal(elements.summaryEmpty.hidden, false);
  assert.match(validationText(), /No configuration yet/);

  keyboardCreate(paletteItems[0], 'Enter');
  const initialCompose = workspace
    .getAllBlocks(false)
    .find(block => block.type === 'compose');
  const invalid = workspace.newBlock('service');
  invalid.setFieldValue('', 'NAME');
  invalid.setFieldValue('', 'IMAGE');
  initialCompose.getInput('SERVICES').connection.connect(invalid.previousConnection);
  invalid.lastValidationWarning = undefined;
  invalid.setWarningText = (text, id) => {
    if (id === 'captured-validation-error') {
      invalid.lastValidationWarning = text;
    }
  };
  vm.runInContext('app.handleWorkspaceChange()', context);
  assert.equal(elements.errorOutput.children[0].className, 'validation-error-summary');
  assert.deepEqual(validationMessages(), [
    'Service name is required.',
    'Service requires an image or build configuration.'
  ]);
  assert.match(invalid.lastValidationWarning, /Service name is required/);
  assert.match(invalid.lastValidationWarning, /Service requires an image or build configuration/);
  assert.equal(elements.yamlStatus.textContent, 'Invalid');
  assert.equal(validationText().includes('Healthcheck valid'), false, 'Invalid state omits unrelated success rows');
  invalid.setFieldValue('web', 'NAME');
  invalid.setFieldValue('nginx:latest', 'IMAGE');
  vm.runInContext('app.handleWorkspaceChange()', context);
  assert.equal(invalid.lastValidationWarning, null);
  assert.equal(elements.yamlStatus.textContent, 'Valid');
  assert.equal(validationText().includes('No errors found.'), true);
  assert.equal(validationText().includes('Ports valid'), false, 'No ports means no Ports valid row');
  click('clearWorkspace');
  assert.equal(workspace.getAllBlocks(false).length, 0);
  assert.equal(elements.codeOutput.textContent, '');
  assert.equal(elements.yamlStatus.textContent, 'Invalid');
  assert.equal(elements.exampleSelect.value, 'simple-web-service');
  assert.equal(elements.summaryEmpty.hidden, false);
  clean();
  // A queued Blockly event must not bring cleared errors back.
  vm.runInContext('app.handleWorkspaceChange()', context);
  clean();
  click('clearWorkspace');
  keyboardCreate(paletteItems[0], 'Enter');
  const compose = workspace
    .getAllBlocks(false)
    .find(block => block.type === 'compose');
  const duplicateA = workspace.newBlock('service');
  const duplicateB = workspace.newBlock('service');
  duplicateA.setFieldValue('web', 'NAME');
  duplicateA.setFieldValue('nginx', 'IMAGE');
  duplicateB.setFieldValue('web', 'NAME');
  duplicateB.setFieldValue('node', 'IMAGE');
  compose.getInput('SERVICES').connection.connect(duplicateA.previousConnection);
  duplicateA.nextConnection.connect(duplicateB.previousConnection);
  for (const block of [duplicateA, duplicateB]) {
    block.lastValidationWarning = undefined;
    block.setWarningText = (text, id) => {
      if (id === 'captured-validation-error') {
        block.lastValidationWarning = text;
      }
    };
  }
  vm.runInContext('app.handleWorkspaceChange()', context);
  assert.equal(elements.errorOutput.children.length, 3, 'Duplicate service names render summary plus both errors');
  assert.deepEqual(validationMessages(), ['Duplicate service name "web".', 'Duplicate service name "web".']);
  assert.equal(duplicateA.lastValidationWarning, 'Duplicate service name "web".');
  assert.equal(duplicateB.lastValidationWarning, 'Duplicate service name "web".');
  assert.equal(elements.summaryServices.textContent, '2');
  duplicateB.setFieldValue('api', 'NAME');
  vm.runInContext('app.handleWorkspaceChange()', context);
  clean();
  assert.equal(duplicateA.lastValidationWarning, null);
  assert.equal(duplicateB.lastValidationWarning, null);
  const dependency = workspace.newBlock('dependency');
  dependency.setFieldValue('missing-service', 'TARGET');
  duplicateA.getInput('DEPENDS_ON').connection.connect(dependency.previousConnection);
  dependency.lastValidationWarning = undefined;
  dependency.setWarningText = (text, id) => {
    if (id === 'captured-validation-error') {
      dependency.lastValidationWarning = text;
    }
  };
  vm.runInContext('app.handleWorkspaceChange()', context);
  assert.equal(elements.errorOutput.children.length, 2, 'Dependency validation renders summary plus one error');
  assert.deepEqual(validationMessages(), ['Unknown dependency service "missing-service".']);
  assert.equal(dependency.lastValidationWarning, 'Unknown dependency service "missing-service".');
  dependency.setFieldValue('api', 'TARGET');
  vm.runInContext('app.handleWorkspaceChange()', context);
  clean();
  assert.equal(dependency.lastValidationWarning, null);
  const networkRef = workspace.newBlock('networkref');
  networkRef.setFieldValue('missing-network', 'TARGET');
  duplicateA.getInput('NETWORKS').connection.connect(networkRef.previousConnection);
  networkRef.lastValidationWarning = undefined;
  networkRef.setWarningText = (text, id) => {
    if (id === 'captured-validation-error') {
      networkRef.lastValidationWarning = text;
    }
  };
  vm.runInContext('app.handleWorkspaceChange()', context);
  assert.equal(elements.errorOutput.children.length, 2, 'Network validation renders summary plus one error');
  assert.deepEqual(validationMessages(), ['Unknown network "missing-network".']);
  assert.equal(networkRef.lastValidationWarning, 'Unknown network "missing-network".');
  const network = workspace.newBlock('network');
  network.setFieldValue('missing-network', 'NAME');
  network.setFieldValue('bridge', 'DRIVER');
  compose.getInput('NETWORKS').connection.connect(network.previousConnection);
  vm.runInContext('app.handleWorkspaceChange()', context);
  clean();
  assert.equal(networkRef.lastValidationWarning, null);
  const healthcheck = workspace.newBlock('healthcheck');
  healthcheck.setFieldValue('', 'COMMAND');
  healthcheck.setFieldValue('30s', 'INTERVAL');
  healthcheck.setFieldValue('10s', 'TIMEOUT');
  healthcheck.setFieldValue('3', 'RETRIES');
  duplicateA.getInput('HEALTHCHECK').connection.connect(healthcheck.outputConnection);
  healthcheck.lastValidationWarning = undefined;
  healthcheck.setWarningText = (text, id) => {
    if (id === 'captured-validation-error') {
      healthcheck.lastValidationWarning = text;
    }
  };
  vm.runInContext('app.handleWorkspaceChange()', context);
  assert.equal(elements.errorOutput.children.length, 2, 'Healthcheck validation renders summary plus one error');
  assert.deepEqual(validationMessages(), ['Healthcheck command is required.']);
  assert.equal(healthcheck.lastValidationWarning, 'Healthcheck command is required.');
  healthcheck.setFieldValue('curl -f http://localhost || exit 1', 'COMMAND');
  vm.runInContext('app.handleWorkspaceChange()', context);
  clean();
  assert.equal(healthcheck.lastValidationWarning, null);
  const build = workspace.newBlock('build');
  build.setFieldValue('', 'CONTEXT');
  duplicateA.getInput('BUILD').connection.connect(build.outputConnection);
  build.lastValidationWarning = undefined;
  build.setWarningText = (text, id) => {
    if (id === 'captured-validation-error') {
      build.lastValidationWarning = text;
    }
  };
  vm.runInContext('app.handleWorkspaceChange()', context);
  assert.equal(elements.errorOutput.children.length, 2, 'Build validation renders summary plus one error');
  assert.deepEqual(validationMessages(), ['Build context is required.']);
  assert.equal(build.lastValidationWarning, 'Build context is required.');
  build.setFieldValue('.', 'CONTEXT');
  vm.runInContext('app.handleWorkspaceChange()', context);
  clean();
  assert.equal(build.lastValidationWarning, null);
  click('clearWorkspace');
  clean();
  for (let i = 0; i < 2; i++) {
    click('loadExample');
    assert.equal(elements.actionStatus.textContent, 'Simple Web Service loaded.');
    assert.equal(elements.codeOutput.textContent, simpleExpected, 'Load Example generates exact simple YAML');
    assert.equal(workspace.getAllBlocks(false).length, 4, 'Reload replaces blocks with compact simple example');
    assert.equal(elements.summaryServices.textContent, '1');
    assert.equal(elements.summaryNetworks.textContent, '0');
    assert.equal(elements.summaryVolumes.textContent, '0');
    assert.equal(elements.summaryDependencies.textContent, '0');
    assert.equal(elements.summaryHealthchecks.textContent, '0');
    assert.equal(elements.summaryEmpty.hidden, true);
    assert.equal(elements.summaryServicesItem.hidden, false);
    assert.equal(elements.summaryNetworksItem.hidden, true);
    assert.equal(elements.summaryVolumesItem.hidden, true);
    assert.equal(elements.summaryDependenciesItem.hidden, true);
    assert.equal(elements.summaryHealthchecksItem.hidden, true);
    assert.equal(elements.yamlStatus.textContent, 'Valid');
    assert.equal(validationText().includes('No errors found.'), true);
    assert.equal(validationText().includes('Your Docker Compose configuration is valid.'), true);
    assert.equal(validationText().includes('Ports valid'), false);
    assert.equal(validationText().includes('Dependencies valid'), false);
    assert.equal(validationText().includes('Healthcheck valid'), false);
    clean();
  }
  elements.exampleSelect.value = 'multi-service-application';
  click('loadExample');
  assert.equal(elements.actionStatus.textContent, 'Multi-Service Application loaded.');
  assert.equal(elements.summaryServices.textContent, '2');
  assert.equal(elements.summaryNetworks.textContent, '1');
  assert.equal(elements.summaryVolumes.textContent, '1');
  assert.equal(elements.summaryDependencies.textContent, '1');
  assert.equal(elements.summaryHealthchecks.textContent, '1');
  assert.equal(elements.summaryEmpty.hidden, true);
  assert.equal(elements.summaryServicesItem.hidden, false);
  assert.equal(elements.summaryNetworksItem.hidden, false);
  assert.equal(elements.summaryVolumesItem.hidden, false);
  assert.equal(elements.summaryDependenciesItem.hidden, false);
  assert.equal(elements.summaryHealthchecksItem.hidden, false);
  assert.equal(elements.yamlStatus.textContent, 'Valid');
  assert.equal(validationText().includes('No errors found.'), true);
  assert.equal(validationText().includes('Your Docker Compose configuration is valid.'), true);
  assert.equal(validationText().includes('Build settings valid'), false);
  assert.equal(validationText().includes('Dependencies valid'), false);
  assert.equal(validationText().includes('Networks valid'), false);
  assert.equal(validationText().includes('Healthcheck valid'), false);
  assert.equal(validationText().includes('Volumes valid'), false);
  for (const expectedSection of multiExpectedSections) {
    assert.ok(
      elements.codeOutput.textContent.includes(expectedSection),
      `Multi-service example YAML should include: ${expectedSection}`
    );
  }
  clean();
  click('validateWorkspace');
  assert.equal(elements.actionStatus.textContent, 'Workspace validation passed.');
  const validYaml = elements.codeOutput.textContent;
  await click('copyYaml');
  assert.equal(copied, validYaml, 'Copy preserves valid YAML content');
  assert.equal(elements.copyYaml.getAttribute('title'), 'YAML copied');
  assert.equal(timers.at(-1).delay, 1400, 'Copy feedback resets after a short delay');
  timers.pop().callback();
  assert.equal(elements.copyYaml.getAttribute('title'), 'Copy YAML');
  click('downloadYaml');
  assert.equal(await downloads.at(-1).text(), validYaml, 'Download preserves valid YAML content');
  assert.equal(anchors.at(-1).download, 'docker-compose.yml');
  assert.equal(anchors.at(-1).href, 'blob:yaml');
  assert.ok(anchors.at(-1).clicked && anchors.at(-1).removed);
  timers.shift().callback();
  assert.equal(revoked.at(-1), 'blob:yaml');

  click('clearWorkspace');
  const clearedYaml = elements.codeOutput.textContent;
  assert.equal(clearedYaml, '', 'Clear leaves no partial services/networks YAML behind');
  await click('copyYaml');
  assert.equal(copied, clearedYaml, 'Copy preserves cleared initial YAML content');
  assert.equal(elements.copyYaml.getAttribute('aria-label'), 'YAML copied');
  timers.pop().callback();
  click('downloadYaml');
  assert.equal(await downloads.at(-1).text(), clearedYaml, 'Download preserves cleared initial YAML content');
  timers.shift().callback();
  navigator.clipboard.writeText = async () => { throw new Error('Permission denied'); };
  await click('copyYaml');
  assert.match(elements.actionStatus.textContent, /Could not copy YAML/);
  delete navigator.clipboard;
  await click('copyYaml');
  assert.match(elements.actionStatus.textContent, /copy it manually/);
  clean();
  const html = read('blockly_app/index.html');
  for (const [id, label] of [['exampleSelect', 'Example'], ['loadExample', 'Load Example'], ['validateWorkspace', 'Validate'], ['clearWorkspace', 'Clear'],
    ['copyYaml', 'Copy'], ['downloadYaml', 'Download']]) {
    assert.ok(html.includes(`id="${id}"`));
    assert.ok(html.includes(label));
  }
  for (const label of [
    'Structure', 'Service Configuration', 'Resources', 'Compose', 'Service', 'Network',
    'Image', 'Build', 'Ports', 'Environment', 'Volumes', 'Depends On',
    'Networks', 'Restart', 'Healthcheck'
  ]) {
    assert.ok(html.includes(label), `Palette includes ${label}`);
  }
  assert.equal(html.includes('name": "Docker"'), false, 'Generated generic Docker category is absent from app HTML');
  assert.equal((html.match(/data-block-type=/g) ?? []).length, 12, 'Palette exposes every supported block action');
  assert.equal((html.match(/id="copyYaml"/g) ?? []).length, 1, 'Copy appears once');
  assert.equal((html.match(/id="downloadYaml"/g) ?? []).length, 1, 'Download appears once');
  assert.ok(html.includes('validation-empty-state'), 'Validation empty state uses a stable icon-and-copy layout');
  assert.ok(html.includes('white-space: nowrap'), 'Headers and status controls guard against narrow wrapping');
  assert.ok(html.includes('minmax(430px, 32%)'), 'YAML column keeps enough width for title, status, and actions');
  assert.ok(html.includes('Docker-Blocks'));
  assert.ok(html.includes('Visual Docker Compose Generator'));
  assert.ok(html.includes('docker-compose.yml'));
  assert.ok(html.includes('Workspace Summary'));
  console.log('[PASS] Final UI actions: example selector, YAML refresh, clear/validation, copy success/failure, download content/cleanup, runtime/template parity');
} finally {
  workspace.dispose();
}
