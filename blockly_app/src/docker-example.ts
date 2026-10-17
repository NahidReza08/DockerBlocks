import * as Blockly from 'blockly';
import { importDockerComposeYaml } from './docker-compose-importer';
import fullComposeYaml from './examples/full-compose.yaml?raw';
import serviceYaml from './examples/service.yaml?raw';
import networkYaml from './examples/network.yaml?raw';

type ScrollableWorkspace = Blockly.Workspace & {
  scroll?: (x: number, y: number) => void;
};

export type DockerComposeExampleId =
  | 'full-compose'
  | 'service'
  | 'network';

export type DockerComposeExample = {
  id: DockerComposeExampleId;
  name: string;
  description: string;
  behavior: 'replace' | 'add-service' | 'add-network';
};

const EXAMPLE_YAML = {
  'full-compose': fullComposeYaml,
  service: serviceYaml,
  network: networkYaml
};

export const DOCKER_COMPOSE_EXAMPLES: DockerComposeExample[] = [
  {
    id: 'full-compose',
    name: 'Full Compose',
    description: 'Complete two-service Docker Compose scenario for demos.',
    behavior: 'replace'
  },
  {
    id: 'service',
    name: 'Service',
    description: 'Add one ready-made service to the current workspace.',
    behavior: 'add-service'
  },
  {
    id: 'network',
    name: 'Network',
    description: 'Add one top-level backend network resource.',
    behavior: 'add-network'
  }
];

function initAndRender(block: Blockly.Block) {
  (block as Blockly.Block & { initSvg?: () => void; render?: () => void }).initSvg?.();
  (block as Blockly.Block & { initSvg?: () => void; render?: () => void }).render?.();
}

function lastBlockInStack(block: Blockly.Block): Blockly.Block {
  let current = block;
  while (current.getNextBlock()) {
    current = current.getNextBlock()!;
  }

  return current;
}

function appendComposeElement(
  workspace: Blockly.Workspace,
  state: Blockly.serialization.blocks.State
) {
  const composeBlock = workspace.getAllBlocks(false).find((block) => block.type === 'compose');
  const addedBlock = Blockly.serialization.blocks.append(state, workspace);

  if (composeBlock && addedBlock.previousConnection) {
    const firstElement = composeBlock.getInputTargetBlock('ELEMENTS');
    if (firstElement) {
      lastBlockInStack(firstElement).nextConnection?.connect(addedBlock.previousConnection);
    } else {
      composeBlock.getInput('ELEMENTS')?.connection?.connect(addedBlock.previousConnection);
    }
  } else {
    addedBlock.moveBy?.(64 + workspace.getAllBlocks(false).length * 12, 64);
  }

  initAndRender(addedBlock);
}

export function loadDockerComposeExample(
  workspace: Blockly.Workspace,
  exampleId: string = DOCKER_COMPOSE_EXAMPLES[0].id
): DockerComposeExample {
  const selectedExample = DOCKER_COMPOSE_EXAMPLES.find((example) => example.id === exampleId) ??
    DOCKER_COMPOSE_EXAMPLES[0];

  const imported = importDockerComposeYaml(EXAMPLE_YAML[selectedExample.id]);
  if (!imported.success || !imported.workspaceState) {
    throw new Error(imported.errors.map((error) => error.message).join('\n'));
  }

  if (selectedExample.behavior === 'replace') {
    workspace.clear();
    Blockly.serialization.workspaces.load(imported.workspaceState, workspace);
    (workspace as ScrollableWorkspace).scroll?.(0, 0);
    return selectedExample;
  }

  const blockType = selectedExample.behavior === 'add-network' ? 'network' : 'service';
  let element = imported.workspaceState.blocks.blocks[0].inputs?.ELEMENTS?.block;
  while (element && element.type !== blockType) element = element.next?.block;
  if (!element) throw new Error('Example contains no ' + blockType + ' block.');
  delete element.next;
  appendComposeElement(workspace, element);

  return selectedExample;
}
