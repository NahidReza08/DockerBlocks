import * as Blockly from 'blockly';

type ScrollableWorkspace = Blockly.Workspace & {
  scroll?: (x: number, y: number) => void;
};

function service(
  name: string,
  image: string,
  hostPort: number,
  containerPort: number,
  source: string,
  target: string,
  apiPort = false
): Blockly.serialization.blocks.State {
  const environment: Blockly.serialization.blocks.State = {
    type: 'environment',
    fields: { KEY: 'NODE_ENV', VALUE: 'production' }
  };

  if (apiPort) {
    environment.next = {
      block: {
        type: 'environment',
        fields: { KEY: 'API_PORT', VALUE: '3000' }
      }
    };
  }

  return {
    type: 'service',
    fields: { NAME: name, IMAGE: image },
    inputs: {
      PORTS: {
        block: {
          type: 'port',
          fields: { HOST_PORT: hostPort, CONTAINER_PORT: containerPort }
        }
      },
      ENVIRONMENT: { block: environment },
      VOLUMES: {
        block: {
          type: 'volume',
          fields: { SOURCE: source, TARGET: target }
        }
      }
    }
  };
}

export function loadDockerComposeExample(
  workspace: Blockly.Workspace
) {
  const frontend = service(
    'frontend',
    'nginx',
    8080,
    80,
    './frontend',
    '/usr/share/nginx/html'
  );

  frontend.next = {
    block: service(
      'backend',
      'node:20',
      3000,
      3000,
      './data',
      '/app/data',
      true
    )
  };

  Blockly.serialization.workspaces.load({
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: 'compose',
        x: 24,
        y: 24,
        inputs: { SERVICES: { block: frontend } }
      }]
    }
  }, workspace);

  (workspace as ScrollableWorkspace).scroll?.(0, 0);
}

