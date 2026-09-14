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
  return name + ':\n  image: ' + image + '\n' + (listedPorts ? '  ports:\n' + listedPorts + '\n' : '');
};

generator.forBlock['port'] = function (block: Blockly.Block): string {
  const hostPort = block.getFieldValue('HOST_PORT') || '0';
  const containerPort = block.getFieldValue('CONTAINER_PORT') || '0';
  return '"' + hostPort + ':' + containerPort + '"\n';
};
