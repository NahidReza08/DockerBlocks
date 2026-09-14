import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as Blockly from 'blockly';
import { javascriptGenerator } from 'blockly/javascript';
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
  const script = source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
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
  Blockly: { ...Blockly, inject: () => workspace }, javascriptGenerator,
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
  execute(read('blockly_app/src/blocks.ts'), context);
  execute(read('blockly_app/src/generator.ts'), context);
  execute(main, context);
  const expected = read('tests/docker-compose-examples/D04-valid-multi-service.yaml');
  assert.equal(elements.codeOutput.textContent, '', 'Initial output is empty YAML');
  const invalid = workspace.newBlock('service');
  invalid.setFieldValue('', 'NAME');
  vm.runInContext('handleWorkspaceChange()', context);
  assert.equal(elements.errorOutput.children[0].className, 'validation-error');
  click('clearWorkspace');
  assert.equal(workspace.getAllBlocks(false).length, 0);
  assert.equal(elements.codeOutput.textContent, '');
  clean();
  // A queued Blockly event must not bring cleared errors back.
  vm.runInContext('handleWorkspaceChange()', context);
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
