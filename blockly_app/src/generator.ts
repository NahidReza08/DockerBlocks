import * as Blockly from 'blockly';
import { javascriptGenerator } from 'blockly/javascript';
import {
  generateDockerComposeYaml,
  generateDockerServiceYaml,
  generateDockerNetworkYaml,
  configGenerators,
  generateComposeElementsYaml,
  generateServiceConfigYaml,
  collectBlockStack
} from './docker-yaml';

export const generator = javascriptGenerator;
generator.INDENT = '  ';

// Connected blocks are assembled by their parent helpers. When a block is
// detached, show a meaningful preview fragment instead of hiding its output.
const blockGenerators = {
  compose: generateDockerComposeYaml,
  service: generateDockerServiceYaml,
  network: generateDockerNetworkYaml,
  ...configGenerators
};

// Blockly's default JavaScript scrubber appends the next statement automatically.
// Our Docker helpers traverse their own stacks, so that would duplicate/misalign YAML.
generator.scrub_ = (_block, code) => code;

function withPreview(
  type: string,
  handler: (block: Blockly.Block) => string
): (block: Blockly.Block) => string {
  return (block) => {
    if (type === 'compose' || block.getParent()) {
      return handler(block);
    }

    const stack = collectBlockStack(block);
    return type === 'service' || type === 'network'
      ? generateComposeElementsYaml(stack)
      : generateServiceConfigYaml(stack, true);
  };
}

for (const [type, handler] of Object.entries(blockGenerators)) {
  generator.forBlock[type] = withPreview(type, handler);
}
