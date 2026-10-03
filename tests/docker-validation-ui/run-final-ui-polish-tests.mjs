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
    appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; this.textContent = ''; },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    click() { this.clicked = true; },
    remove() { this.removed = true; }
  };
}

const ids = ['codeOutput', 'errorOutput', 'actionStatus', 'loadExample', 'clearWorkspace', 'copyYaml', 'downloadYaml'];
const elements = Object.fromEntries(ids.map(id => [id, element()]));
const workspace = new Blockly.Workspace();
workspace.scroll = () => {};
const anchors = [];
const downloads = [];
const revoked = [];
const timers = [];
let copied;
const navigator = { clipboard: { async writeText(text) { copied = text; } } };
const context = vm.createContext({
  Blockly: { ...Blockly, inject: () => workspace }, javascriptGenerator, Order,
  validationErrors: [], navigator, Blob,
  URL: {
    createObjectURL(blob) { downloads.push(blob); return 'blob:yaml'; },
    revokeObjectURL(url) { revoked.push(url); }
  },
  setTimeout(callback) { timers.push(callback); },
  document: {
    getElementById: id => elements[id], body: element(),
    createElement(tag) {
      const node = element();
      if (tag === 'a') anchors.push(node);
      return node;
    }
  }
});
const click = id => elements[id].listeners.click();
const clean = () => {
  assert.equal(elements.errorOutput.children.length, 1);
  assert.equal(elements.errorOutput.children[0].textContent, 'No errors detected.');
};

try {
  execute(read('blockly_app/src/docker-yaml.ts'), context);
  execute(read('blockly_app/src/docker-validation.ts'), context);
  execute(read('blockly_app/src/validation-ui.ts'), context);
  execute(read('blockly_app/src/docker-example.ts'), context);
  execute(read('blockly_app/src/app-bootstrap.ts'), context);
  execute(read('blockly_app/src/blocks.ts'), context);
  execute(read('blockly_app/src/generator.ts'), context);
  execute(main.replace('bootstrapBlocklyApp({', 'globalThis.app = bootstrapBlocklyApp({'), context);
  const expected = read('tests/docker-compose-examples/D04-valid-multi-service.yaml');
  assert.equal(elements.codeOutput.textContent, '', 'Initial output is empty YAML');
  const invalid = workspace.newBlock('service');
  invalid.setFieldValue('', 'NAME');
  vm.runInContext('app.handleWorkspaceChange()', context);
  assert.equal(elements.errorOutput.children[0].className, 'validation-error');
  click('clearWorkspace');
  assert.equal(workspace.getAllBlocks(false).length, 0);
  assert.equal(elements.codeOutput.textContent, '');
  clean();
  // A queued Blockly event must not bring cleared errors back.
  vm.runInContext('app.handleWorkspaceChange()', context);
  clean();
  const compose = workspace.newBlock('compose');
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
  assert.equal(elements.errorOutput.children.length, 2, 'Duplicate service names render both errors');
  for (const child of elements.errorOutput.children) {
    assert.equal(child.children[1].textContent, 'Duplicate service name "web".');
  }
  assert.equal(duplicateA.lastValidationWarning, 'Duplicate service name "web".');
  assert.equal(duplicateB.lastValidationWarning, 'Duplicate service name "web".');
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
  assert.equal(elements.errorOutput.children.length, 1, 'Dependency validation renders one error');
  assert.equal(elements.errorOutput.children[0].children[1].textContent, 'Unknown dependency service "missing-service".');
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
  assert.equal(elements.errorOutput.children.length, 1, 'Network validation renders one error');
  assert.equal(elements.errorOutput.children[0].children[1].textContent, 'Unknown network "missing-network".');
  assert.equal(networkRef.lastValidationWarning, 'Unknown network "missing-network".');
  const network = workspace.newBlock('network');
  network.setFieldValue('missing-network', 'NAME');
  network.setFieldValue('bridge', 'DRIVER');
  compose.getInput('NETWORKS').connection.connect(network.previousConnection);
  vm.runInContext('app.handleWorkspaceChange()', context);
  clean();
  assert.equal(networkRef.lastValidationWarning, null);
  click('clearWorkspace');
  clean();
  for (let i = 0; i < 2; i++) {
    click('loadExample');
    assert.equal(elements.codeOutput.textContent, expected, 'Load Example generates exact D04 YAML');
    assert.equal(workspace.getAllBlocks(false).length, 10, 'Reload replaces blocks');
    clean();
  }
  for (const yaml of [expected, '']) {
    if (!yaml) click('clearWorkspace');
    await click('copyYaml');
    assert.equal(copied, yaml, 'Copy preserves all YAML content');
    assert.equal(elements.actionStatus.textContent, 'YAML copied.');
    click('downloadYaml');
    assert.equal(await downloads.at(-1).text(), yaml, 'Download preserves all YAML content');
    assert.equal(anchors.at(-1).download, 'docker-compose.yml');
    assert.equal(anchors.at(-1).href, 'blob:yaml');
    assert.ok(anchors.at(-1).clicked && anchors.at(-1).removed);
    timers.shift()();
    assert.equal(revoked.at(-1), 'blob:yaml');
  }
  navigator.clipboard.writeText = async () => { throw new Error('Permission denied'); };
  await click('copyYaml');
  assert.match(elements.actionStatus.textContent, /Could not copy YAML/);
  delete navigator.clipboard;
  await click('copyYaml');
  assert.match(elements.actionStatus.textContent, /copy it manually/);
  clean();
  const html = read('blockly_app/index.html');
  for (const [id, label] of [['loadExample', 'Load Example'], ['clearWorkspace', 'Clear'],
    ['copyYaml', 'Copy YAML'], ['downloadYaml', 'Download YAML']]) {
    assert.ok(html.includes(`<button id="${id}" type="button">${label}</button>`));
  }
  console.log('[PASS] Final UI actions: D04 YAML, clear/validation, copy success/failure, download content/cleanup, runtime/template parity');
} finally {
  workspace.dispose();
}
