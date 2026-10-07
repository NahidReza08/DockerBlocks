import * as Blockly from 'blockly';

type ScrollableWorkspace = Blockly.Workspace & {
  scroll?: (x: number, y: number) => void;
};

export type DockerComposeExampleId =
  | 'full-compose'
  | 'service'
  | 'network';

type WorkspaceState = Parameters<typeof Blockly.serialization.workspaces.load>[0];

export type DockerComposeExample = {
  id: DockerComposeExampleId;
  name: string;
  description: string;
  behavior: 'replace' | 'add-service' | 'add-network';
};

type BlockState = Blockly.serialization.blocks.State;

function stack(blocks: BlockState[]): BlockState | undefined {
  if (blocks.length === 0) return undefined;

  const [first, ...rest] = blocks;
  let current = first;

  rest.forEach((block) => {
    current.next = { block };
    current = block;
  });

  return first;
}

function block(type: string, fields = {}, inputs = {}): BlockState {
  return { type, fields, inputs };
}

function image(value: string): BlockState {
  return block('image', { IMAGE: value });
}

function port(hostPort: number, containerPort: number): BlockState {
  return block('port', {
    HOST_PORT: hostPort,
    CONTAINER_PORT: containerPort
  });
}

function environment(key: string, value: string): BlockState {
  return block('environment', {
    KEY: key,
    VALUE: value
  });
}

function volume(source: string, target: string): BlockState {
  return block('volume', {
    SOURCE: source,
    TARGET: target
  });
}

function dependency(target: string): BlockState {
  return block('dependency', { TARGET: target });
}

function networkRef(target: string): BlockState {
  return block('networkref', { TARGET: target });
}

function restart(policy: string): BlockState {
  return block('restart', { POLICY: policy });
}

function build(context: string): BlockState {
  return block('build', { CONTEXT: context });
}

function healthcheck(
  command: string,
  interval: string,
  timeout: string,
  retries: number
): BlockState {
  return block('healthcheck', {
    COMMAND: command,
    INTERVAL: interval,
    TIMEOUT: timeout,
    RETRIES: retries
  });
}

function network(name: string, driver = 'bridge'): BlockState {
  return block('network', {
    NAME: name,
    DRIVER: driver
  });
}

function service(options: {
  name: string;
  configuration: BlockState[];
}): BlockState {
  const config = stack(options.configuration);
  const inputs: Record<string, { block: BlockState }> = {};

  if (config) inputs.CONFIG = { block: config };

  return block('service', {
    NAME: options.name
  }, inputs);
}

function compose(elements: BlockState[]): WorkspaceState {
  const elementStack = stack(elements);
  const inputs: Record<string, { block: BlockState }> = {};

  if (elementStack) inputs.ELEMENTS = { block: elementStack };

  return {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: 'compose',
        x: 32,
        y: 32,
        inputs
      }]
    }
  };
}

function fullComposeState(): WorkspaceState {
  return compose([
    service({
      name: 'web',
      configuration: [
        image('docker-blocks-demo-web:latest'),
        build('.'),
        restart('unless-stopped'),
        healthcheck('curl -f http://localhost || exit 1', '30s', '10s', 3),
        dependency('database'),
        networkRef('backend'),
        port(8080, 80),
        environment('APP_ENV', 'production'),
        environment('DATABASE_HOST', 'database'),
        volume('./web', '/usr/share/nginx/html')
      ]
    }),
    service({
      name: 'database',
      configuration: [
        image('postgres:latest'),
        restart('unless-stopped'),
        networkRef('backend'),
        environment('POSTGRES_DB', 'app'),
        environment('POSTGRES_USER', 'app'),
        environment('POSTGRES_PASSWORD', 'example'),
        volume('./data', '/var/lib/postgresql/data')
      ]
    }),
    network('backend')
  ]);
}

function serviceTemplateState(): BlockState {
  return service({
    name: 'api',
    configuration: [
      image('node:20-alpine'),
      restart('unless-stopped'),
      networkRef('backend'),
      port(3000, 3000),
      environment('NODE_ENV', 'development'),
      volume('./app', '/usr/src/app')
    ]
  });
}

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

function appendComposeElement(workspace: Blockly.Workspace, blockType: string) {
  const composeBlock = workspace
    .getAllBlocks(false)
    .find((block) => block.type === 'compose');
  const addedBlock = workspace.newBlock(blockType);

  if (blockType === 'service') {
    addedBlock.setFieldValue('api', 'NAME');
    const configInput = addedBlock.getInput('CONFIG')?.connection;
    const state = serviceTemplateState();
    const configState = state.inputs?.CONFIG?.block;
    if (configState) Blockly.serialization.blocks.append(configState, workspace);
    const configBlock = workspace
      .getAllBlocks(false)
      .find((block) => block.type === 'image' && block.getSurroundParent() === null);
    if (configInput && configBlock?.previousConnection) {
      configInput.connect(configBlock.previousConnection);
    }
  }

  if (blockType === 'network') {
    addedBlock.setFieldValue('backend', 'NAME');
    addedBlock.setFieldValue('bridge', 'DRIVER');
  }

  if (composeBlock && addedBlock.previousConnection) {
    const firstElement = composeBlock.getInputTargetBlock('ELEMENTS');
    if (firstElement) {
      const lastElement = lastBlockInStack(firstElement);
      lastElement.nextConnection?.connect(addedBlock.previousConnection);
    } else {
      composeBlock.getInput('ELEMENTS')?.connection?.connect(addedBlock.previousConnection);
    }
  } else {
    addedBlock.moveBy?.(64 + workspace.getAllBlocks(false).length * 12, 64);
  }

  initAndRender(addedBlock);
  return addedBlock;
}

export function loadDockerComposeExample(
  workspace: Blockly.Workspace,
  exampleId: string = DOCKER_COMPOSE_EXAMPLES[0].id
): DockerComposeExample {
  const selectedExample = DOCKER_COMPOSE_EXAMPLES.find((example) => example.id === exampleId) ??
    DOCKER_COMPOSE_EXAMPLES[0];

  if (selectedExample.behavior === 'replace') {
    workspace.clear();
    Blockly.serialization.workspaces.load(fullComposeState(), workspace);
    (workspace as ScrollableWorkspace).scroll?.(0, 0);
    return selectedExample;
  }

  appendComposeElement(
    workspace,
    selectedExample.behavior === 'add-network' ? 'network' : 'service'
  );

  return selectedExample;
}
