import * as Blockly from 'blockly';

import { javascriptGenerator } from 'blockly/javascript';

export const generator = javascriptGenerator;
generator.INDENT = '  ';

generator.forBlock['compose'] = function (block: Blockly.Block): string {
  const services = generator.statementToCode(block, 'SERVICES').replace(/\n$/, '');
  const code = ("compose" + ' ' + "{" + '\n' + services + '\n' + "}").trim();
  return code;
};

generator.forBlock['service'] = function (block: Blockly.Block): string {
  const name = block.getFieldValue('NAME') || 'Unnamed';
  const image = block.getFieldValue('IMAGE') || 'Unnamed';
  const code = ("service" + ' ' + name + ' ' + "{" + ' ' + "image" + ' ' + image + ' ' + "}").trim();
  return code + '\n';
};
