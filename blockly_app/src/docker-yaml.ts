import type * as Blockly from 'blockly';

export function collectBlockStack(first: Blockly.Block | null): Blockly.Block[] {
  const blocks: Blockly.Block[] = [];
  for (let current = first; current; current = current.getNextBlock()) {
    blocks.push(current);
  }
  return blocks;
}

function indentBlock(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text.split('\n').filter(Boolean).map((line) => prefix + line).join('\n');
}

export function formatYamlSection(key: string, content: string): string {
  const value = content.trimEnd();
  return `${key}:\n${value ? indentBlock(value, 2) + '\n' : ''}`;
}

export function generateDockerComposeYaml(block: Blockly.Block): string {
  return generateComposeElementsYaml(collectBlockStack(block.getInputTargetBlock('ELEMENTS')));
}

export function generateComposeElementsYaml(elements: Blockly.Block[]): string {
  const services = elements.filter((block) => block.type === 'service')
    .map(generateDockerServiceYaml).join('');
  const networks = elements.filter((block) => block.type === 'network')
    .map(generateDockerNetworkYaml).join('');
  return (services ? formatYamlSection('services', services) : '') +
    (networks ? formatYamlSection('networks', networks) : '');
}

const CONFIG_ORDER = [
  'image', 'build', 'restart', 'healthcheck', 'dependency',
  'networkref', 'port', 'environment', 'volume'
] as const;

const LIST_KEYS: Record<string, string> = {
  dependency: 'depends_on', networkref: 'networks',
  port: 'ports', volume: 'volumes'
};

// Both Service.CONFIG and disconnected service-config stacks use this one builder.
// Repeated scalar keys are retained for preview; validation reports invalid duplicates.
export function generateServiceConfigYaml(blocks: Blockly.Block[], standalone = false): string {
  let output = '';
  const order: readonly string[] = standalone
    ? [...new Set(blocks.map((block) => block.type))]
    : CONFIG_ORDER;
  for (const type of order) {
    const matching = blocks.filter((block) => block.type === type);
    if (!matching.length) continue;

    if (type === 'environment') {
      output += formatYamlSection('environment', matching.map(generateDockerEnvironmentYaml).join(''));
    } else if (type === 'healthcheck') {
      for (const block of matching) {
        output += formatYamlSection('healthcheck', generateDockerHealthcheckYaml(block));
      }
    } else if (type in LIST_KEYS) {
      const handler = configGenerators[type];
      const entries = matching.map((block) => `- ${handler(block).trimEnd()}\n`).join('');
      output += formatYamlSection(LIST_KEYS[type], entries);
    } else {
      const handler = configGenerators[type];
      for (const block of matching) {
        output += `${type}: ${handler(block).trimEnd()}\n`;
      }
    }
  }
  return output;
}

export function generateDockerServiceYaml(block: Blockly.Block): string {
  const name = String(block.getFieldValue('NAME') ?? '');
  const config = generateServiceConfigYaml(collectBlockStack(block.getInputTargetBlock('CONFIG')));
  return `${name}:\n${config ? indentBlock(config, 2) + '\n' : ''}`;
}

export function generateDockerImageYaml(block: Blockly.Block): string {
  return String(block.getFieldValue('IMAGE') ?? '').trim();
}

export function generateDockerBuildYaml(block: Blockly.Block): string {
  return String(block.getFieldValue('CONTEXT') ?? '');
}

export function generateDockerHealthcheckYaml(block: Blockly.Block): string {
  const command = block.getFieldValue('COMMAND') ?? '';
  const interval = block.getFieldValue('INTERVAL') ?? '';
  const timeout = block.getFieldValue('TIMEOUT') ?? '';
  const retries = block.getFieldValue('RETRIES') ?? '';
  return 'test: ["CMD-SHELL", ' + JSON.stringify(String(command)) + ']\n' +
    'interval: ' + interval + '\n' +
    'timeout: ' + timeout + '\n' +
    'retries: ' + retries + '\n';
}

export function generateDockerRestartYaml(block: Blockly.Block): string {
  const policy = block.getFieldValue('POLICY') ?? '';
  return String(policy === 'no' ? '"no"' : policy);
}

export function generateDockerDependencyYaml(block: Blockly.Block): string {
  return String(block.getFieldValue('TARGET') ?? '') + '\n';
}

export function generateDockerNetworkRefYaml(block: Blockly.Block): string {
  return String(block.getFieldValue('TARGET') ?? '') + '\n';
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

export const configGenerators: Record<string, (block: Blockly.Block) => string> = {
  image: generateDockerImageYaml,
  build: generateDockerBuildYaml,
  restart: generateDockerRestartYaml,
  healthcheck: generateDockerHealthcheckYaml,
  dependency: generateDockerDependencyYaml,
  networkref: generateDockerNetworkRefYaml,
  port: generateDockerPortYaml,
  environment: generateDockerEnvironmentYaml,
  volume: generateDockerVolumeYaml
};
