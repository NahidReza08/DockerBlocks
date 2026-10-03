import * as Blockly from 'blockly';

import { javascriptGenerator, Order } from 'blockly/javascript';
import {
  generateDockerComposeYaml,
  generateDockerBuildYaml,
  generateDockerDependencyYaml,
  generateDockerEnvironmentYaml,
  generateDockerHealthcheckYaml,
  generateDockerNetworkRefYaml,
  generateDockerNetworkYaml,
  generateDockerPortYaml,
  generateDockerRestartYaml,
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

generator.forBlock['dependency'] = function (block: Blockly.Block): string {
  return generateDockerDependencyYaml(block);
};

generator.forBlock['build'] = function (block: Blockly.Block): [string, Order] {
  return generateDockerBuildYaml(block);
};

generator.forBlock['restart'] = function (block: Blockly.Block): [string, Order] {
  return generateDockerRestartYaml(block);
};

generator.forBlock['healthcheck'] = function (block: Blockly.Block): [string, Order] {
  return generateDockerHealthcheckYaml(block);
};

generator.forBlock['networkref'] = function (block: Blockly.Block): string {
  return generateDockerNetworkRefYaml(block);
};

generator.forBlock['network'] = function (block: Blockly.Block): string {
  return generateDockerNetworkYaml(block);
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
