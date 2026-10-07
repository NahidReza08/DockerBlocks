import type * as Blockly from 'blockly';
import { Order } from 'blockly/javascript';

type DockerYamlGenerator = {
  statementToCode(block: Blockly.Block, name: string): string;
  valueToCode(block: Blockly.Block, name: string, order: Order): string;
};

function statementBlocks(block: Blockly.Block, inputName: string): Blockly.Block[] {
  const blocks: Blockly.Block[] = [];
  let current = block.getInputTargetBlock(inputName);

  while (current) {
    blocks.push(current);
    current = current.getNextBlock();
  }

  return blocks;
}

function indentBlock(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => prefix + line)
    .join('\n');
}

export function generateDockerComposeYaml(
  block: Blockly.Block,
  _generator: DockerYamlGenerator
): string {
  const elements = statementBlocks(block, 'ELEMENTS');
  const serviceYaml = elements
    .filter((element) => element.type === 'service')
    .map((service) => generateDockerServiceYaml(service, _generator).trimEnd())
    .filter(Boolean)
    .join('\n');
  const networkYaml = elements
    .filter((element) => element.type === 'network')
    .map((network) => generateDockerNetworkYaml(network).trimEnd())
    .filter(Boolean)
    .join('\n');

  return 'services:\n' + (serviceYaml ? indentBlock(serviceYaml, 2) + '\n' : '') +
    (networkYaml ? 'networks:\n' + indentBlock(networkYaml, 2) + '\n' : '');
}

export function generateDockerServiceYaml(
  block: Blockly.Block,
  _generator: DockerYamlGenerator
): string {
  const name = block.getFieldValue('NAME') ?? '';
  const config = statementBlocks(block, 'CONFIG');
  const images = config.filter((child) => child.type === 'image');
  const builds = config.filter((child) => child.type === 'build');
  const restarts = config.filter((child) => child.type === 'restart');
  const healthchecks = config.filter((child) => child.type === 'healthcheck');
  const dependencies = config.filter((child) => child.type === 'dependency');
  const networks = config.filter((child) => child.type === 'networkref');
  const ports = config.filter((child) => child.type === 'port');
  const environments = config.filter((child) => child.type === 'environment');
  const volumes = config.filter((child) => child.type === 'volume');

  const image = images
    .map((imageBlock) => String(imageBlock.getFieldValue('IMAGE') ?? '').trim())
    .find((value) => value.length > 0) ?? '';
  const build = builds.length > 0 ? generateDockerBuildYaml(builds[0])[0] : '';
  const restart = restarts.length > 0 ? generateDockerRestartYaml(restarts[0])[0] : '';
  const healthcheck = healthchecks.length > 0
    ? generateDockerHealthcheckYaml(healthchecks[0])[0].trimEnd()
    : '';
  const listedDependencies = dependencies
    .map((dependency) => '    - ' + generateDockerDependencyYaml(dependency).trim())
    .filter((line) => line.trim().length > 2)
    .join('\n');
  const listedNetworks = networks
    .map((network) => '    - ' + generateDockerNetworkRefYaml(network).trim())
    .filter((line) => line.trim().length > 2)
    .join('\n');
  const listedPorts = ports
    .map((port) => '    - ' + generateDockerPortYaml(port).trim())
    .join('\n');
  const listedEnvironments = environments
    .map((environment) => '    ' + generateDockerEnvironmentYaml(environment).trim())
    .join('\n');
  const listedVolumes = volumes
    .map((volume) => '    - ' + generateDockerVolumeYaml(volume).trim())
    .join('\n');

  return name + ':\n' +
    (image ? '  image: ' + image + '\n' : '') +
    (build ? '  build: ' + build + '\n' : '') +
    (restart ? '  restart: ' + restart + '\n' : '') +
    (healthcheck ? '  healthcheck:\n' + healthcheck + '\n' : '') +
    (listedDependencies ? '  depends_on:\n' + listedDependencies + '\n' : '') +
    (listedNetworks ? '  networks:\n' + listedNetworks + '\n' : '') +
    (listedPorts ? '  ports:\n' + listedPorts + '\n' : '') +
    (listedEnvironments ? '  environment:\n' + listedEnvironments + '\n' : '') +
    (listedVolumes ? '  volumes:\n' + listedVolumes + '\n' : '');
}

export function generateDockerImageYaml(block: Blockly.Block): string {
  const image = block.getFieldValue('IMAGE') ?? '';

  return 'image: ' + image + '\n';
}

export function generateDockerBuildYaml(block: Blockly.Block): [string, Order] {
  const context = block.getFieldValue('CONTEXT') ?? '';

  return [String(context), Order.ATOMIC];
}

export function generateDockerHealthcheckYaml(block: Blockly.Block): [string, Order] {
  const command = block.getFieldValue('COMMAND') ?? '';
  const interval = block.getFieldValue('INTERVAL') ?? '';
  const timeout = block.getFieldValue('TIMEOUT') ?? '';
  const retries = block.getFieldValue('RETRIES') ?? '';

  return [
    '    test: ["CMD-SHELL", ' + JSON.stringify(String(command)) + ']\n' +
      '    interval: ' + interval + '\n' +
      '    timeout: ' + timeout + '\n' +
      '    retries: ' + retries,
    Order.ATOMIC
  ];
}

export function generateDockerRestartYaml(block: Blockly.Block): [string, Order] {
  const policy = block.getFieldValue('POLICY') ?? '';
  const safePolicy = policy === 'no' ? '"no"' : policy;

  return [safePolicy, Order.ATOMIC];
}

export function generateDockerDependencyYaml(block: Blockly.Block): string {
  const target = block.getFieldValue('TARGET') ?? '';

  return target + '\n';
}

export function generateDockerNetworkRefYaml(block: Blockly.Block): string {
  const target = block.getFieldValue('TARGET') ?? '';

  return target + '\n';
}

export function generateDockerNetworkYaml(block: Blockly.Block): string {
  const name = block.getFieldValue('NAME') ?? '';
  const driver = String(block.getFieldValue('DRIVER') ?? '').trim();

  return name + ':\n' + (driver ? '  driver: ' + driver + '\n' : '');
}

export function generateDockerPortYaml(block: Blockly.Block): string {
  const hostPort = block.getFieldValue('HOST_PORT') || '0';
  const containerPort = block.getFieldValue('CONTAINER_PORT') || '0';

  return '"' + hostPort + ':' + containerPort + '"\n';
}

export function generateDockerEnvironmentYaml(block: Blockly.Block): string {
  const key = block.getFieldValue('KEY') ?? '';
  const value = block.getFieldValue('VALUE') ?? '';
  const safeValue = /^\d+$/.test(value) ? '"' + value + '"' : value;

  return key + ': ' + safeValue + '\n';
}

export function generateDockerVolumeYaml(block: Blockly.Block): string {
  const source = block.getFieldValue('SOURCE') ?? '';
  const target = block.getFieldValue('TARGET') ?? '';

  return '"' + source + ':' + target + '"\n';
}

