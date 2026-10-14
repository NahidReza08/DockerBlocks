import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as Blockly from 'blockly';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);

function read(file) {
  return fs.readFileSync(new URL(file, root), 'utf8').replace(/\r\n/g, '\n');
}

function executeScoped(source, expose) {
  const context = vm.createContext({});
  const script = source.replace(/^import type[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const output = ts.transpileModule(script, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText;
  vm.runInContext(`(() => {\n${output}\n${expose.map(name => `globalThis.${name} = ${name};`).join('\n')}\n})();`, context);
  return context;
}

function blockInputs(block) {
  return Object.entries(block)
    .filter(([key]) => /^args\d+$/.test(key))
    .flatMap(([, args]) => args);
}

function findInput(block, name) {
  return blockInputs(block).find((input) => input.name === name);
}

try {
  console.log('\nBlock Connection Rule Tests\n');
  console.log('Testing Docker block connection rules...');

  const { DOCKER_BLOCK_DEFINITIONS, DOCKER_TOOLBOX } = executeScoped(
    read('blockly_app/src/docker-block-definitions.ts'),
    ['DOCKER_BLOCK_DEFINITIONS', 'DOCKER_TOOLBOX']
  );
  const byType = Object.fromEntries(DOCKER_BLOCK_DEFINITIONS.map((block) => [block.type, block]));

  for (const type of [
    'compose', 'service', 'image', 'build', 'restart', 'healthcheck',
    'dependency', 'networkref', 'network', 'port', 'environment', 'volume'
  ]) {
    assert.ok(byType[type], `${type} block should be defined`);
  }

  const toolboxShape = DOCKER_TOOLBOX.contents.map((category) => ({
      name: category.name,
      blocks: category.contents.map((entry) => entry.type)
    }));

  assert.deepEqual(
    JSON.parse(JSON.stringify(toolboxShape)),
    [
      { name: 'Structure', blocks: ['compose', 'service', 'network'] },
      {
        name: 'Service Configuration',
        blocks: ['image', 'build', 'port', 'environment', 'volume', 'dependency', 'networkref', 'restart', 'healthcheck']
      }
    ],
    'Toolbox order stays stable'
  );

  assert.equal(findInput(byType.compose, 'ELEMENTS')?.check, 'compose_element');
  assert.equal(findInput(byType.compose, 'ELEMENTS')?.type, 'input_statement');
  assert.equal(findInput(byType.service, 'CONFIG')?.check, 'service_config');
  assert.equal(findInput(byType.service, 'CONFIG')?.type, 'input_statement');
  assert.match(byType.compose.tooltip, /Supports: Service, Network/);
  assert.match(byType.service.tooltip, /Supports: Image, Build, Ports/);

  assert.equal(byType.service.previousStatement, 'compose_element');
  assert.equal(byType.service.nextStatement, 'compose_element');
  assert.equal(byType.network.previousStatement, 'compose_element');
  assert.equal(byType.network.nextStatement, 'compose_element');

  for (const type of [
    'image', 'build', 'restart', 'healthcheck',
    'dependency', 'networkref', 'port', 'environment', 'volume'
  ]) {
    assert.equal(byType[type].previousStatement, 'service_config', `${type} attaches to Service CONFIG`);
    assert.equal(byType[type].nextStatement, 'service_config', `${type} stacks in Service CONFIG`);
  }

  Blockly.defineBlocksWithJsonArray(DOCKER_BLOCK_DEFINITIONS);
  const workspace = new Blockly.Workspace();
  try {
    const compose = workspace.newBlock('compose');
    const service = workspace.newBlock('service');
    const network = workspace.newBlock('network');
    const image = workspace.newBlock('image');
    const port = workspace.newBlock('port');
    const environment = workspace.newBlock('environment');
    const restart = workspace.newBlock('restart');

    compose.getInput('ELEMENTS').connection.connect(service.previousConnection);
    service.nextConnection.connect(network.previousConnection);
    service.getInput('CONFIG').connection.connect(image.previousConnection);
    image.nextConnection.connect(port.previousConnection);
    port.nextConnection.connect(environment.previousConnection);
    environment.nextConnection.connect(restart.previousConnection);

    assert.equal(compose.getInputTargetBlock('ELEMENTS'), service);
    assert.equal(service.getNextBlock(), network);
    assert.equal(service.getInputTargetBlock('CONFIG'), image);
    assert.equal(image.getNextBlock(), port);
    assert.equal(port.getNextBlock(), environment);
    assert.equal(environment.getNextBlock(), restart);

    assert.equal(
      workspace.connectionChecker.doTypeChecks(
        compose.getInput('ELEMENTS').connection,
        port.previousConnection
      ),
      false,
      'Compose rejects service configuration blocks directly'
    );
    assert.equal(
      workspace.connectionChecker.doTypeChecks(
        service.getInput('CONFIG').connection,
        network.previousConnection
      ),
      false,
      'Service rejects top-level Network blocks'
    );
    assert.equal(
      workspace.connectionChecker.doTypeChecks(
        service.getInput('CONFIG').connection,
        service.previousConnection
      ),
      false,
      'Service rejects nested Service blocks'
    );
  } finally {
    workspace.dispose();
  }

  console.log('[PASS] Maintained Docker block connection rules are enforced');
  console.log('\n✓ All block connection rule tests passed\n');
} catch (error) {
  console.error('\n✗ Block connection rule test failed\n');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
