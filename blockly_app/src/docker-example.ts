import * as Blockly from 'blockly';

type ScrollableWorkspace = Blockly.Workspace & {
  scroll?: (x: number, y: number) => void;
};

export type DockerComposeExampleId =
  | 'simple-web-service'
  | 'multi-service-application';

type WorkspaceState = Parameters<typeof Blockly.serialization.workspaces.load>[0];

export type DockerComposeExample = {
  id: DockerComposeExampleId;
  name: string;
  description: string;
  buildWorkspaceState: () => WorkspaceState;
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
  image?: string;
  build?: BlockState;
  restart?: BlockState;
  healthcheck?: BlockState;
  dependencies?: BlockState[];
  networks?: BlockState[];
  ports?: BlockState[];
  environment?: BlockState[];
  volumes?: BlockState[];
}): BlockState {
  const inputs: Record<string, { block: BlockState }> = {};

  if (options.build) inputs.BUILD = { block: options.build };
  if (options.restart) inputs.RESTART = { block: options.restart };
  if (options.healthcheck) inputs.HEALTHCHECK = { block: options.healthcheck };

  const dependencies = stack(options.dependencies ?? []);
  const networks = stack(options.networks ?? []);
  const ports = stack(options.ports ?? []);
  const environmentEntries = stack(options.environment ?? []);
  const volumes = stack(options.volumes ?? []);

  if (dependencies) inputs.DEPENDS_ON = { block: dependencies };
  if (networks) inputs.NETWORKS = { block: networks };
  if (ports) inputs.PORTS = { block: ports };
  if (environmentEntries) inputs.ENVIRONMENT = { block: environmentEntries };
  if (volumes) inputs.VOLUMES = { block: volumes };

  return block('service', {
    NAME: options.name,
    IMAGE: options.image ?? ''
  }, inputs);
}

function compose(
  services: BlockState[],
  networks: BlockState[] = []
): WorkspaceState {
  const serviceStack = stack(services);
  const networkStack = stack(networks);
  const inputs: Record<string, { block: BlockState }> = {};

  if (serviceStack) inputs.SERVICES = { block: serviceStack };
  if (networkStack) inputs.NETWORKS = { block: networkStack };

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

function simpleWebService(): WorkspaceState {
  return compose([
    service({
      name: 'web',
      image: 'nginx:latest',
      restart: restart('unless-stopped'),
      ports: [port(8080, 80)]
    })
  ]);
}

function multiServiceApplication(): WorkspaceState {
  return compose([
    service({
      name: 'web',
      image: 'docker-blocks-demo-web:latest',
      build: build('.'),
      restart: restart('unless-stopped'),
      healthcheck: healthcheck(
        'curl -f http://localhost || exit 1',
        '30s',
        '10s',
        3
      ),
      dependencies: [dependency('database')],
      networks: [networkRef('backend')],
      ports: [port(8080, 80)],
      environment: [
        environment('APP_ENV', 'production'),
        environment('DATABASE_HOST', 'database')
      ]
    }),
    service({
      name: 'database',
      image: 'postgres:latest',
      restart: restart('unless-stopped'),
      networks: [networkRef('backend')],
      environment: [
        environment('POSTGRES_DB', 'app'),
        environment('POSTGRES_USER', 'app'),
        environment('POSTGRES_PASSWORD', 'example')
      ],
      volumes: [volume('./data', '/var/lib/postgresql/data')]
    })
  ], [
    network('backend')
  ]);
}

export const DOCKER_COMPOSE_EXAMPLES: DockerComposeExample[] = [
  {
    id: 'simple-web-service',
    name: 'Simple Web Service',
    description: 'One nginx service with a port mapping and restart policy.',
    buildWorkspaceState: simpleWebService
  },
  {
    id: 'multi-service-application',
    name: 'Multi-Service Application',
    description: 'Web and database services with build, dependency, network, healthcheck, environment, volume, and restart blocks.',
    buildWorkspaceState: multiServiceApplication
  }
];

export function loadDockerComposeExample(
  workspace: Blockly.Workspace,
  exampleId: string = DOCKER_COMPOSE_EXAMPLES[0].id
): DockerComposeExample {
  const selectedExample = DOCKER_COMPOSE_EXAMPLES.find((example) => example.id === exampleId) ??
    DOCKER_COMPOSE_EXAMPLES[0];

  workspace.clear();
  Blockly.serialization.workspaces.load(
    selectedExample.buildWorkspaceState(),
    workspace
  );

  (workspace as ScrollableWorkspace).scroll?.(0, 0);

  return selectedExample;
}
