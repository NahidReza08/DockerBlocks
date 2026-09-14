import * as Blockly from 'blockly';

import { javascriptGenerator } from 'blockly/javascript';

export const generator = javascriptGenerator;
generator.INDENT = '  ';

generator.forBlock['compose'] = function (block: Blockly.Block): string {
  const services = generator.statementToCode(block, 'SERVICES').replace(/\n$/, '');
  return 'services:\n' + (services ? services + '\n' : '');
};

generator.forBlock['service'] = function (block: Blockly.Block): string {
  const name = block.getFieldValue('NAME') ?? '';
  const image = block.getFieldValue('IMAGE') ?? '';
  const ports = generator.statementToCode(block, 'PORTS').trimEnd();
  const listedPorts = ports
    ? ports
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => '    - ' + line.trim())
        .join('\n')
    : '';
  const environments = generator.statementToCode(block, 'ENVIRONMENT').trimEnd();
  const listedEnvironments = environments
    ? environments
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => '    ' + line.trim())
        .join('\n')
    : '';
  const volumes = generator.statementToCode(block, 'VOLUMES').trimEnd();
  const listedVolumes = volumes
    ? volumes
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => '    - ' + line.trim())
        .join('\n')
    : '';
  return name + ':\n  image: ' + image + '\n' + (listedPorts ? '  ports:\n' + listedPorts + '\n' : '') + (listedEnvironments ? '  environment:\n' + listedEnvironments + '\n' : '') + (listedVolumes ? '  volumes:\n' + listedVolumes + '\n' : '');
};

generator.forBlock['port'] = function (block: Blockly.Block): string {
  const hostPort = block.getFieldValue('HOST_PORT') || '0';
  const containerPort = block.getFieldValue('CONTAINER_PORT') || '0';
  return '"' + hostPort + ':' + containerPort + '"\n';
};

generator.forBlock['environment'] = function (block: Blockly.Block): string {
  const key = block.getFieldValue('KEY') ?? '';
  const value = block.getFieldValue('VALUE') ?? '';
  const safeValue = /^\d+$/.test(value) ? '"' + value + '"' : value;
  return key + ': ' + safeValue + '\n';
};

generator.forBlock['volume'] = function (block: Blockly.Block): string {
  const source = block.getFieldValue('SOURCE') ?? '';
  const target = block.getFieldValue('TARGET') ?? '';
  return '"' + source + ':' + target + '"\n';
};
