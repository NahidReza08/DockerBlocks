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
  return name + ':\n  image: ' + image + '\n';
};

generator.forBlock['port'] = function (): string {
  return '';
};
