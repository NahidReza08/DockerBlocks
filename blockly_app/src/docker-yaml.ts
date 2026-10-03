import type * as Blockly from 'blockly';
import { Order } from 'blockly/javascript';

type DockerYamlGenerator = {
  statementToCode(block: Blockly.Block, name: string): string;
  valueToCode(block: Blockly.Block, name: string, order: Order): string;
};

function listItems(
  text: string,
  prefix: string
): string {
  return text
    ? text
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => prefix + line.trim())
        .join('\n')
    : '';
}

export function generateDockerComposeYaml(
  block: Blockly.Block,
  generator: DockerYamlGenerator
): string {
  const services = generator
    .statementToCode(block, 'SERVICES')
    .replace(/\n$/, '');
  const networks = generator
    .statementToCode(block, 'NETWORKS')
    .replace(/\n$/, '');

  return 'services:\n' + (services ? services + '\n' : '') +
    (networks ? 'networks:\n' + networks + '\n' : '');
}

export function generateDockerServiceYaml(
  block: Blockly.Block,
  generator: DockerYamlGenerator
): string {
  const name = block.getFieldValue('NAME') ?? '';
  const image = block.getFieldValue('IMAGE') ?? '';
  const restart = generator.valueToCode(block, 'RESTART', Order.NONE);
  const healthcheck = generator
    .valueToCode(block, 'HEALTHCHECK', Order.NONE)
    .trimEnd();
  const dependencies = generator.statementToCode(block, 'DEPENDS_ON').trimEnd();
  const networks = generator.statementToCode(block, 'NETWORKS').trimEnd();
  const ports = generator.statementToCode(block, 'PORTS').trimEnd();
  const environments = generator.statementToCode(block, 'ENVIRONMENT').trimEnd();
  const volumes = generator.statementToCode(block, 'VOLUMES').trimEnd();

  const listedDependencies = listItems(dependencies, '    - ');
  const listedNetworks = listItems(networks, '    - ');
  const listedPorts = listItems(ports, '    - ');
  const listedEnvironments = listItems(environments, '    ');
  const listedVolumes = listItems(volumes, '    - ');

  return name + ':\n  image: ' + image + '\n' +
    (restart ? '  restart: ' + restart + '\n' : '') +
    (healthcheck ? '  healthcheck:\n' + healthcheck + '\n' : '') +
    (listedDependencies ? '  depends_on:\n' + listedDependencies + '\n' : '') +
    (listedNetworks ? '  networks:\n' + listedNetworks + '\n' : '') +
    (listedPorts ? '  ports:\n' + listedPorts + '\n' : '') +
    (listedEnvironments ? '  environment:\n' + listedEnvironments + '\n' : '') +
    (listedVolumes ? '  volumes:\n' + listedVolumes + '\n' : '');
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

