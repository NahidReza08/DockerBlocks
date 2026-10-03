import * as Blockly from 'blockly';

import { javascriptGenerator } from 'blockly/javascript';
import {
  generateDockerComposeYaml,
  generateDockerEnvironmentYaml,
  generateDockerPortYaml,
  generateDockerServiceYaml,
  generateDockerVolumeYaml
} from './docker-yaml';


export const generator = javascriptGenerator;
generator.INDENT = '  ';

generator.forBlock['compose'] = function (block: Blockly.Block): string {
  return generateDockerComposeYaml(block, generator);
};

generator.forBlock['service'] = function (block: Blockly.Block): string {
  return generateDockerServiceYaml(block, generator);
};

generator.forBlock['port'] = function (block: Blockly.Block): string {
  return generateDockerPortYaml(block);
};

generator.forBlock['environment'] = function (block: Blockly.Block): string {
  return generateDockerEnvironmentYaml(block);
};

generator.forBlock['volume'] = function (block: Blockly.Block): string {
  return generateDockerVolumeYaml(block);
};
