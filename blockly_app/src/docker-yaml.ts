import type * as Blockly from 'blockly';

type StatementGenerator = {
  statementToCode(block: Blockly.Block, name: string): string;
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
  generator: StatementGenerator
): string {
  const services = generator
    .statementToCode(block, 'SERVICES')
    .replace(/\n$/, '');

  return 'services:\n' + (services ? services + '\n' : '');
}

export function generateDockerServiceYaml(
  block: Blockly.Block,
  generator: StatementGenerator
): string {
  const name = block.getFieldValue('NAME') ?? '';
  const image = block.getFieldValue('IMAGE') ?? '';
  const dependencies = generator.statementToCode(block, 'DEPENDS_ON').trimEnd();
  const ports = generator.statementToCode(block, 'PORTS').trimEnd();
  const environments = generator.statementToCode(block, 'ENVIRONMENT').trimEnd();
  const volumes = generator.statementToCode(block, 'VOLUMES').trimEnd();

  const listedDependencies = listItems(dependencies, '    - ');
  const listedPorts = listItems(ports, '    - ');
  const listedEnvironments = listItems(environments, '    ');
  const listedVolumes = listItems(volumes, '    - ');

  return name + ':\n  image: ' + image + '\n' +
    (listedDependencies ? '  depends_on:\n' + listedDependencies + '\n' : '') +
    (listedPorts ? '  ports:\n' + listedPorts + '\n' : '') +
    (listedEnvironments ? '  environment:\n' + listedEnvironments + '\n' : '') +
    (listedVolumes ? '  volumes:\n' + listedVolumes + '\n' : '');
}

export function generateDockerDependencyYaml(block: Blockly.Block): string {
  const target = block.getFieldValue('TARGET') ?? '';

  return target + '\n';
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

