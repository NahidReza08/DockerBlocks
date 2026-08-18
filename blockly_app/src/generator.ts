import * as Blockly from 'blockly';

import { javascriptGenerator, Order } from 'blockly/javascript';
export const generator = javascriptGenerator;

generator.INDENT = '  ';

function dedentOnce(code: string): string {
  return code
    .split('\n')
    .map(line => line.startsWith(generator.INDENT) ? line.slice(generator.INDENT.length) : line)
    .join('\n');
}

generator.forBlock['project'] = function (block: Blockly.Block): string {
  const name = block.getFieldValue('NAME');
  const metadata = generator.valueToCode(block, 'METADATA', Order.NONE) || '';
  const members = dedentOnce(generator.statementToCode(block, 'MEMBERS').replace(/\n$/, ''));
  const modules = dedentOnce(generator.statementToCode(block, 'MODULES').replace(/\n$/, ''));
  const tasks = dedentOnce(generator.statementToCode(block, 'TASKS').replace(/\n$/, ''));
  const code = ("project" + ' ' + name + ' ' + "{" + ' ' + metadata + '\n' + members + '\n' + modules + '\n' + tasks + '\n' + "}").trim();
  return code;
};

generator.forBlock['metadata'] = function (block: Blockly.Block): string {
  const version = block.getFieldValue('VERSION');
  const visibility = block.getFieldValue('VISIBILITY');
  const code = ("metadata" + ' ' + "{" + ' ' + version + ' ' + visibility + ' ' + "}").trim();
  return code;
};

generator.forBlock['member'] = function (block: Blockly.Block): string {
  const name = block.getFieldValue('NAME');
  const role = block.getFieldValue('ROLE');
  const code = ("member" + ' ' + name + ' ' + role).trim();
  return code + '\n';
};

generator.forBlock['module'] = function (block: Blockly.Block): string {
  const name = block.getFieldValue('NAME');
  const type = block.getFieldValue('TYPE');
  const components = generator.statementToCode(block, 'COMPONENTS').replace(/\n$/, '');
  const code = ("module" + ' ' + name + ' ' + type + ' ' + "{" + '\n' + components + '\n' + "}").trim();
  return code + '\n';
};

generator.forBlock['component'] = function (block: Blockly.Block): string {
  const name = block.getFieldValue('NAME');
  const language = block.getFieldValue('LANGUAGE');
  const lines = block.getFieldValue('LINES');
  const code = ("component" + ' ' + name + ' ' + language + ' ' + lines).trim();
  return code + '\n';
};

generator.forBlock['task'] = function (block: Blockly.Block): string {
  const title = block.getFieldValue('TITLE');
  const priority = block.getFieldValue('PRIORITY');
  const status = block.getFieldValue('STATUS');
  const assignee = generator.valueToCode(block, 'ASSIGNEE', Order.NONE) || '';
  const module = generator.valueToCode(block, 'MODULE', Order.NONE) || '';
  const estimate = block.getFieldValue('ESTIMATE');
  const subtasks = generator.statementToCode(block, 'SUBTASKS').replace(/\n$/, '');
  const code = ("task" + ' ' + title + ' ' + priority + ' ' + status + ' ' + assignee + ' ' + module + ' ' + estimate + ' ' + "{" + '\n' + subtasks + '\n' + "}").trim();
  return code + '\n';
};

generator.forBlock['subtask'] = function (block: Blockly.Block): string {
  const title = block.getFieldValue('TITLE');
  const completed = block.getFieldValue('COMPLETED');
  const code = ("subtask" + ' ' + title + ' ' + completed).trim();
  return code + '\n';
};
