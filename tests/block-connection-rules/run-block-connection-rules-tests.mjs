import assert from 'node:assert/strict';
import * as Blockly from 'blockly';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGrammar } from '../../generate_blockly/src/grammar-loader.js';
import { validateGrammar } from '../../generate_blockly/src/validator.js';
import { buildIR } from '../../generate_blockly/src/ir-builder.js';
import { generateBlocksTs } from '../../generate_blockly/src/blockly-ts-target.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const dockerGrammar = path.join(
  repoRoot,
  'generate_blockly',
  'input',
  'docker-compose.langium'
);

function extractBlockDefinitions(blocksTs) {
  const marker = 'Blockly.defineBlocksWithJsonArray(';
  const markerIndex = blocksTs.indexOf(marker);

  assert.notEqual(
    markerIndex,
    -1,
    'Generated blocks.ts should define Blockly blocks.'
  );

  const arrayStart = blocksTs.indexOf('[', markerIndex);
  const arrayEnd = blocksTs.indexOf('\n  );', arrayStart);

  assert.notEqual(
    arrayStart,
    -1,
    'Generated blocks.ts should contain a block definition array.'
  );

  assert.notEqual(
    arrayEnd,
    -1,
    'Generated block definition array should have an end.'
  );

  return JSON.parse(
    blocksTs.slice(arrayStart, arrayEnd).trim()
  );
}

function blockInputs(block) {
  return Object.entries(block)
    .filter(([key]) => /^args\d+$/.test(key))
    .flatMap(([, args]) => args);
}

function findInput(block, name) {
  return blockInputs(block).find((input) => input.name === name);
}

async function testDockerConnectionRules() {
  console.log('Testing Docker block connection rules...');

  const grammar = await loadGrammar(dockerGrammar);
  validateGrammar(grammar);

  const ir = buildIR(grammar);
  const blocksTs = generateBlocksTs(ir);
  const blocks = extractBlockDefinitions(blocksTs);

  const volume = blocks.find((block) => block.type === 'volume');
  assert.ok(volume, 'Volume should be generated');
  assert.equal(volume.previousStatement, 'volume');
  assert.equal(volume.nextStatement, 'volume');
  Blockly.defineBlocksWithJsonArray(blocks);
  const workspace = new Blockly.Workspace();
  try {
    const service = workspace.newBlock('service');
    const first = workspace.newBlock('volume');
    const second = workspace.newBlock('volume');
    const dependency = workspace.newBlock('dependency');
    const build = workspace.newBlock('build');
    const restart = workspace.newBlock('restart');
    const healthcheck = workspace.newBlock('healthcheck');
    const networkRef = workspace.newBlock('networkref');
    const network = workspace.newBlock('network');
    const port = workspace.newBlock('port');
    const environment = workspace.newBlock('environment');
    const compose = workspace.newBlock('compose');
    const dependencies = service.getInput('DEPENDS_ON');
    const buildInput = service.getInput('BUILD');
    const restartInput = service.getInput('RESTART');
    const healthcheckInput = service.getInput('HEALTHCHECK');
    const networks = service.getInput('NETWORKS');
    const composeNetworks = compose.getInput('NETWORKS');
    const volumes = service.getInput('VOLUMES');
    assert.ok(dependencies, 'Service has DEPENDS_ON');
    assert.deepEqual(dependencies.connection.getCheck(), ['dependency']);
    assert.deepEqual(dependency.previousConnection.getCheck(), ['dependency']);
    assert.deepEqual(dependency.nextConnection.getCheck(), ['dependency']);
    dependencies.connection.connect(dependency.previousConnection);
    assert.equal(service.getInputTargetBlock('DEPENDS_ON'), dependency);
    console.log('[PASS] Service DEPENDS_ON accepts Dependency; Dependency stacks with dependency previous/next types');
    assert.ok(buildInput, 'Service has BUILD');
    assert.deepEqual(buildInput.connection.getCheck(), ['build']);
    assert.deepEqual(build.outputConnection.getCheck(), ['build']);
    buildInput.connection.connect(build.outputConnection);
    assert.equal(service.getInputTargetBlock('BUILD'), build);
    console.log('[PASS] Service BUILD accepts Build value block');
    assert.ok(restartInput, 'Service has RESTART');
    assert.deepEqual(restartInput.connection.getCheck(), ['restart']);
    assert.deepEqual(restart.outputConnection.getCheck(), ['restart']);
    restartInput.connection.connect(restart.outputConnection);
    assert.equal(service.getInputTargetBlock('RESTART'), restart);
    console.log('[PASS] Service RESTART accepts Restart value block');
    assert.ok(healthcheckInput, 'Service has HEALTHCHECK');
    assert.deepEqual(healthcheckInput.connection.getCheck(), ['healthcheck']);
    assert.deepEqual(healthcheck.outputConnection.getCheck(), ['healthcheck']);
    healthcheckInput.connection.connect(healthcheck.outputConnection);
    assert.equal(service.getInputTargetBlock('HEALTHCHECK'), healthcheck);
    console.log('[PASS] Service HEALTHCHECK accepts Healthcheck value block');
    assert.ok(networks, 'Service has NETWORKS');
    assert.deepEqual(networks.connection.getCheck(), ['networkref']);
    assert.deepEqual(networkRef.previousConnection.getCheck(), ['networkref']);
    assert.deepEqual(networkRef.nextConnection.getCheck(), ['networkref']);
    networks.connection.connect(networkRef.previousConnection);
    assert.equal(service.getInputTargetBlock('NETWORKS'), networkRef);
    console.log('[PASS] Service NETWORKS accepts network references; NetworkRef stacks with networkref previous/next types');
    assert.ok(composeNetworks, 'Compose has NETWORKS');
    assert.deepEqual(composeNetworks.connection.getCheck(), ['network']);
    assert.deepEqual(network.previousConnection.getCheck(), ['network']);
    assert.deepEqual(network.nextConnection.getCheck(), ['network']);
    composeNetworks.connection.connect(network.previousConnection);
    assert.equal(compose.getInputTargetBlock('NETWORKS'), network);
    console.log('[PASS] Compose NETWORKS accepts top-level Network declarations; Network stacks with network previous/next types');
    assert.ok(volumes, 'Service has VOLUMES');
    assert.deepEqual(volumes.connection.getCheck(), ['volume']);
    assert.deepEqual(first.previousConnection.getCheck(), ['volume']);
    assert.deepEqual(first.nextConnection.getCheck(), ['volume']);
    volumes.connection.connect(first.previousConnection);
    first.nextConnection.connect(second.previousConnection);
    assert.equal(service.getInputTargetBlock('VOLUMES'), first);
    assert.equal(first.getNextBlock(), second);
    console.log('[PASS] Service VOLUMES accepts Volume; Volume stacks with volume previous/next types');
    for (const [label, parent, child] of [
      ['Volume cannot connect to PORTS', service.getInput('PORTS').connection, first.previousConnection],
      ['Volume cannot connect to ENVIRONMENT', service.getInput('ENVIRONMENT').connection, first.previousConnection],
      ['Dependency cannot connect to PORTS', service.getInput('PORTS').connection, dependency.previousConnection],
      ['Dependency cannot connect to VOLUMES', volumes.connection, dependency.previousConnection],
      ['Build cannot connect to RESTART', restartInput.connection, build.outputConnection],
      ['Build cannot connect to HEALTHCHECK', healthcheckInput.connection, build.outputConnection],
      ['Build cannot connect to PORTS', service.getInput('PORTS').connection, build.outputConnection],
      ['Restart cannot connect to BUILD', buildInput.connection, restart.outputConnection],
      ['Restart cannot connect to PORTS', service.getInput('PORTS').connection, restart.outputConnection],
      ['Restart cannot connect to NETWORKS', networks.connection, restart.outputConnection],
      ['Restart cannot connect to HEALTHCHECK', healthcheckInput.connection, restart.outputConnection],
      ['Healthcheck cannot connect to RESTART', restartInput.connection, healthcheck.outputConnection],
      ['Healthcheck cannot connect to PORTS', service.getInput('PORTS').connection, healthcheck.outputConnection],
      ['Healthcheck cannot connect to NETWORKS', networks.connection, healthcheck.outputConnection],
      ['Dependency cannot connect to RESTART', restartInput.connection, dependency.previousConnection],
      ['Dependency cannot connect to BUILD', buildInput.connection, dependency.previousConnection],
      ['Dependency cannot connect to HEALTHCHECK', healthcheckInput.connection, dependency.previousConnection],
      ['NetworkRef cannot connect to RESTART', restartInput.connection, networkRef.previousConnection],
      ['NetworkRef cannot connect to HEALTHCHECK', healthcheckInput.connection, networkRef.previousConnection],
      ['NetworkRef cannot connect to PORTS', service.getInput('PORTS').connection, networkRef.previousConnection],
      ['NetworkRef cannot connect to ENVIRONMENT', service.getInput('ENVIRONMENT').connection, networkRef.previousConnection],
      ['NetworkRef cannot connect to VOLUMES', volumes.connection, networkRef.previousConnection],
      ['NetworkRef cannot connect to DEPENDS_ON', dependencies.connection, networkRef.previousConnection],
      ['NetworkRef cannot connect to Compose SERVICES', compose.getInput('SERVICES').connection, networkRef.previousConnection],
      ['NetworkRef cannot connect to Compose NETWORKS', composeNetworks.connection, networkRef.previousConnection],
      ['Network declaration cannot connect to service NETWORKS', networks.connection, network.previousConnection],
      ['Network declaration cannot connect to service PORTS', service.getInput('PORTS').connection, network.previousConnection],
      ['Network declaration cannot connect to service VOLUMES', volumes.connection, network.previousConnection],
      ['Network declaration cannot connect to Compose SERVICES', compose.getInput('SERVICES').connection, network.previousConnection],
      ['Port cannot connect to DEPENDS_ON', dependencies.connection, port.previousConnection],
      ['Port cannot connect to NETWORKS', networks.connection, port.previousConnection],
      ['Environment cannot connect to DEPENDS_ON', dependencies.connection, environment.previousConnection],
      ['Environment cannot connect to NETWORKS', networks.connection, environment.previousConnection],
      ['Port cannot connect to VOLUMES', volumes.connection, port.previousConnection],
      ['Environment cannot connect to VOLUMES', volumes.connection, environment.previousConnection],
      ['Volume cannot connect to Compose SERVICES', compose.getInput('SERVICES').connection, first.previousConnection],
      ['Dependency cannot connect to Compose SERVICES', compose.getInput('SERVICES').connection, dependency.previousConnection]
    ]) {
      assert.equal(workspace.connectionChecker.doTypeChecks(parent, child), false, label);
      console.log('[PASS] ' + label);
    }
  } finally {
    workspace.dispose();
  }

  const compose = blocks.find(
    (block) => block.type === 'compose'
  );

  const service = blocks.find(
    (block) => block.type === 'service'
  );

  const port = blocks.find(
    (block) => block.type === 'port'
  );

  const dependency = blocks.find(
    (block) => block.type === 'dependency'
  );

  const build = blocks.find(
    (block) => block.type === 'build'
  );

  const restart = blocks.find(
    (block) => block.type === 'restart'
  );

  const healthcheck = blocks.find(
    (block) => block.type === 'healthcheck'
  );

  const networkRef = blocks.find(
    (block) => block.type === 'networkref'
  );

  const network = blocks.find(
    (block) => block.type === 'network'
  );

  const environment = blocks.find(
    (block) => block.type === 'environment'
  );

  assert.ok(
    compose,
    'Compose block should be generated.'
  );

  assert.ok(
    service,
    'Service block should be generated.'
  );

  assert.ok(
    port,
    'Port block should be generated.'
  );

  assert.ok(
    dependency,
    'Dependency block should be generated.'
  );

  assert.ok(
    build,
    'Build block should be generated.'
  );

  assert.ok(
    restart,
    'Restart block should be generated.'
  );

  assert.ok(
    healthcheck,
    'Healthcheck block should be generated.'
  );

  assert.ok(
    networkRef,
    'NetworkRef block should be generated.'
  );

  assert.ok(
    network,
    'Network block should be generated.'
  );

  assert.ok(
    environment,
    'Environment block should be generated.'
  );

  assert.equal(
    port.previousStatement,
    'port',
    'Port should stack above another Port-compatible block.'
  );

  assert.equal(
    port.nextStatement,
    'port',
    'Port should stack below another Port-compatible block.'
  );

  const serviceDependencyInput = findInput(service, 'DEPENDS_ON');

  assert.ok(
    serviceDependencyInput,
    'Service should expose a DEPENDS_ON statement input for stackable Dependency blocks.'
  );

  assert.equal(
    serviceDependencyInput.type,
    'input_statement',
    'Service DEPENDS_ON input should be a Blockly statement input.'
  );

  assert.equal(
    serviceDependencyInput.check,
    'dependency',
    'Service DEPENDS_ON input should only accept Dependency blocks.'
  );

  assert.equal(
    dependency.previousStatement,
    'dependency',
    'Dependency should stack above another Dependency-compatible block.'
  );

  assert.equal(
    dependency.nextStatement,
    'dependency',
    'Dependency should stack below another Dependency-compatible block.'
  );

  const serviceBuildInput = findInput(service, 'BUILD');

  assert.ok(
    serviceBuildInput,
    'Service should expose a BUILD value input for an optional Build block.'
  );

  assert.equal(
    serviceBuildInput.type,
    'input_value',
    'Service BUILD input should be a Blockly value input.'
  );

  assert.equal(
    serviceBuildInput.check,
    'build',
    'Service BUILD input should only accept Build blocks.'
  );

  assert.equal(
    build.output,
    'build',
    'Build should output only into a Build-compatible value input.'
  );

  assert.deepEqual(
    findInput(build, 'CONTEXT'),
    {
      type: 'field_input',
      name: 'CONTEXT',
      text: '.'
    },
    'Build should expose a beginner-friendly default context.'
  );

  const serviceRestartInput = findInput(service, 'RESTART');

  assert.ok(
    serviceRestartInput,
    'Service should expose a RESTART value input for an optional Restart block.'
  );

  assert.equal(
    serviceRestartInput.type,
    'input_value',
    'Service RESTART input should be a Blockly value input.'
  );

  assert.equal(
    serviceRestartInput.check,
    'restart',
    'Service RESTART input should only accept Restart blocks.'
  );

  assert.equal(
    restart.output,
    'restart',
    'Restart should output only into a Restart-compatible value input.'
  );

  const restartPolicyInput = findInput(restart, 'POLICY');

  assert.ok(
    restartPolicyInput,
    'Restart should expose a POLICY dropdown.'
  );

  assert.equal(
    restartPolicyInput.type,
    'field_dropdown',
    'Restart POLICY should use a dropdown.'
  );

  assert.deepEqual(
    restartPolicyInput.options,
    [
      ['no', 'no'],
      ['always', 'always'],
      ['on-failure', 'on-failure'],
      ['unless-stopped', 'unless-stopped']
    ],
    'Restart POLICY dropdown should contain exactly the supported Compose values.'
  );

  const serviceHealthcheckInput = findInput(service, 'HEALTHCHECK');

  assert.ok(
    serviceHealthcheckInput,
    'Service should expose a HEALTHCHECK value input for an optional Healthcheck block.'
  );

  assert.equal(
    serviceHealthcheckInput.type,
    'input_value',
    'Service HEALTHCHECK input should be a Blockly value input.'
  );

  assert.equal(
    serviceHealthcheckInput.check,
    'healthcheck',
    'Service HEALTHCHECK input should only accept Healthcheck blocks.'
  );

  assert.equal(
    healthcheck.output,
    'healthcheck',
    'Healthcheck should output only into a Healthcheck-compatible value input.'
  );

  assert.deepEqual(
    [
      ['COMMAND', 'field_input', 'curl -f http://localhost || exit 1'],
      ['INTERVAL', 'field_input', '30s'],
      ['TIMEOUT', 'field_input', '10s'],
      ['RETRIES', 'field_number', 3]
    ].map(([name, type, defaultValue]) => {
      const input = findInput(healthcheck, name);
      return [input?.name, input?.type, input?.text ?? input?.value, defaultValue];
    }),
    [
      ['COMMAND', 'field_input', 'curl -f http://localhost || exit 1', 'curl -f http://localhost || exit 1'],
      ['INTERVAL', 'field_input', '30s', '30s'],
      ['TIMEOUT', 'field_input', '10s', '10s'],
      ['RETRIES', 'field_number', 3, 3]
    ],
    'Healthcheck should expose beginner-friendly defaults for command, interval, timeout and retries.'
  );

  const serviceNetworksInput = findInput(service, 'NETWORKS');

  assert.ok(
    serviceNetworksInput,
    'Service should expose a NETWORKS statement input for stackable NetworkRef blocks.'
  );

  assert.equal(
    serviceNetworksInput.type,
    'input_statement',
    'Service NETWORKS input should be a Blockly statement input.'
  );

  assert.equal(
    serviceNetworksInput.check,
    'networkref',
    'Service NETWORKS input should only accept NetworkRef blocks.'
  );

  assert.equal(
    networkRef.previousStatement,
    'networkref',
    'NetworkRef should stack above another NetworkRef-compatible block.'
  );

  assert.equal(
    networkRef.nextStatement,
    'networkref',
    'NetworkRef should stack below another NetworkRef-compatible block.'
  );

  const servicePortsInput = findInput(service, 'PORTS');

  assert.ok(
    servicePortsInput,
    'Service should expose a PORTS statement input for stackable Port blocks.'
  );

  assert.equal(
    servicePortsInput.type,
    'input_statement',
    'Service PORTS input should be a Blockly statement input.'
  );

  assert.equal(
    servicePortsInput.check,
    'port',
    'Service PORTS input should only accept Port blocks.'
  );

  const serviceEnvironmentInput = findInput(service, 'ENVIRONMENT');

  assert.ok(
    serviceEnvironmentInput,
    'Service should expose an ENVIRONMENT statement input for stackable Environment blocks.'
  );

  assert.equal(
    serviceEnvironmentInput.type,
    'input_statement',
    'Service ENVIRONMENT input should be a Blockly statement input.'
  );

  assert.equal(
    serviceEnvironmentInput.check,
    'environment',
    'Service ENVIRONMENT input should only accept Environment blocks.'
  );

  assert.equal(
    environment.previousStatement,
    'environment',
    'Environment should stack above another Environment-compatible block.'
  );

  assert.equal(
    environment.nextStatement,
    'environment',
    'Environment should stack below another Environment-compatible block.'
  );

  assert.equal(
    port.previousStatement,
    'port',
    'Port should not attach to an Environment stack.'
  );

  assert.equal(
    port.nextStatement,
    'port',
    'Port should not accept Environment stack connections.'
  );

  assert.equal(
    compose.previousStatement,
    undefined,
    'Compose must not accept Environment blocks directly.'
  );

  const servicesInput = findInput(compose, 'SERVICES');
  const networksInput = findInput(compose, 'NETWORKS');

  assert.ok(
    servicesInput,
    'Compose should contain a SERVICES statement input.'
  );

  assert.equal(
    servicesInput.type,
    'input_statement',
    'Compose SERVICES should be a statement input.'
  );

  assert.equal(
    servicesInput.check,
    'service',
    'Compose SERVICES should accept only Service blocks.'
  );

  assert.ok(
    networksInput,
    'Compose should contain a NETWORKS statement input.'
  );

  assert.equal(
    networksInput.type,
    'input_statement',
    'Compose NETWORKS should be a statement input.'
  );

  assert.equal(
    networksInput.check,
    'network',
    'Compose NETWORKS should accept only Network blocks.'
  );

  assert.equal(
    network.previousStatement,
    'network',
    'Network should connect to a Network-compatible parent or sibling.'
  );

  assert.equal(
    network.nextStatement,
    'network',
    'Network should allow another Network below it.'
  );

  assert.equal(
    service.previousStatement,
    'service',
    'Service should connect to a Service-compatible parent or sibling.'
  );

  assert.equal(
    service.nextStatement,
    'service',
    'Service should allow another Service below it.'
  );

  assert.equal(
    compose.previousStatement,
    undefined,
    'Compose must not connect below a Service.'
  );

  assert.equal(
    compose.nextStatement,
    undefined,
    'Compose must not behave like a Service stack block.'
  );

  console.log('✓ Compose accepts Service blocks');
  console.log('✓ Service blocks can stack with Service blocks');
  console.log('✓ Compose cannot be nested in a Service stack');
  console.log('✓ Docker block connection rules passed');
}

try {
  console.log('\nBlock Connection Rule Tests\n');

  await testDockerConnectionRules();

  console.log(
    '\n✓ All block connection rule tests passed\n'
  );
} catch (error) {
  console.error(
    '\n✗ Block connection rule test failed\n'
  );

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}
