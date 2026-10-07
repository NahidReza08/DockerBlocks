import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as Blockly from 'blockly';
import { javascriptGenerator, Order } from 'blockly/javascript';
import ts from 'typescript';
import { parseDocument } from 'yaml';

const root = new URL('../../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8').replace(/\r\n/g, '\n');

function execute(source, context) {
  const script = source
    .replace(/^import[\s\S]*?;\r?\n/gm, '')
    .replace(/^export /gm, '');
  vm.runInContext(ts.transpileModule(script, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText, context);
}

const context = vm.createContext({
  Blockly,
  javascriptGenerator,
  Order,
  parseDocument,
  console
});

execute(read('blockly_app/src/docker-yaml.ts'), context);
execute(read('blockly_app/src/blocks.ts'), context);
execute(read('blockly_app/src/generator.ts') + '\nglobalThis.generator = generator;', context);
execute(read('blockly_app/src/docker-compose-importer.ts'), context);

const {
  defineBlocks,
  generator,
  importDockerComposeYaml
} = context;

defineBlocks();

function loadImportedWorkspace(yaml) {
  const result = importDockerComposeYaml(yaml);

  assert.equal(result.success, true, JSON.stringify(result.errors, null, 2));
  assert.ok(result.workspaceState, 'Successful import returns workspace state');

  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(result.workspaceState, workspace);

  return { result, workspace };
}

function blockTypes(workspace) {
  return workspace
    .getAllBlocks(false)
    .map(block => block.type)
    .sort();
}

function findBlock(workspace, type, fieldName, fieldValue) {
  return workspace
    .getAllBlocks(false)
    .find(block => block.type === type &&
      (!fieldName || String(block.getFieldValue(fieldName)) === fieldValue));
}

function generatedYamlFor(yaml) {
  const { workspace } = loadImportedWorkspace(yaml);
  try {
    return generator.workspaceToCode(workspace);
  } finally {
    workspace.dispose();
  }
}

function warningPaths(result) {
  return Array.from(result.warnings, warning => warning.path);
}

function unsupportedPaths(result) {
  return Array.from(result.unsupportedFields, warning => warning.path);
}

try {
  {
    const { result, workspace } = loadImportedWorkspace(`
services:
  web:
    image: nginx
`);
    assert.equal(result.importedServices, 1);
    assert.equal(result.importedNetworks, 0);
    assert.deepEqual(blockTypes(workspace), ['compose', 'service']);
    assert.equal(findBlock(workspace, 'service', 'NAME', 'web').getFieldValue('IMAGE'), 'nginx');
    assert.equal(generatedYamlFor(`
services:
  web:
    image: nginx
`), 'services:\n  web:\n    image: nginx\n');
    workspace.dispose();
  }

  {
    const { result, workspace } = loadImportedWorkspace(`
services:
  web:
    image: nginx
  api:
    image: node
`);
    assert.equal(result.importedServices, 2);
    assert.ok(findBlock(workspace, 'service', 'NAME', 'web'));
    assert.ok(findBlock(workspace, 'service', 'NAME', 'api'));
    workspace.dispose();
  }

  {
    const { workspace } = loadImportedWorkspace(`
services:
  web:
    image: nginx
    ports:
      - "8080:80"
`);
    const port = findBlock(workspace, 'port');
    assert.equal(port.getFieldValue('HOST_PORT'), 8080);
    assert.equal(port.getFieldValue('CONTAINER_PORT'), 80);
    workspace.dispose();
  }

  {
    const { workspace } = loadImportedWorkspace(`
services:
  web:
    image: nginx
    environment:
      NODE_ENV: production
      PORT: 3000
`);
    const entries = workspace.getAllBlocks(false).filter(block => block.type === 'environment');
    assert.deepEqual(entries.map(block => [block.getFieldValue('KEY'), block.getFieldValue('VALUE')]), [
      ['NODE_ENV', 'production'],
      ['PORT', '3000']
    ]);
    workspace.dispose();
  }

  {
    const { workspace } = loadImportedWorkspace(`
services:
  web:
    image: nginx
    volumes:
      - "./html:/usr/share/nginx/html"
`);
    const volume = findBlock(workspace, 'volume');
    assert.equal(volume.getFieldValue('SOURCE'), './html');
    assert.equal(volume.getFieldValue('TARGET'), '/usr/share/nginx/html');
    workspace.dispose();
  }

  {
    const { workspace } = loadImportedWorkspace(`
services:
  web:
    image: nginx
    depends_on:
      - db
  db:
    image: postgres
`);
    assert.equal(findBlock(workspace, 'dependency').getFieldValue('TARGET'), 'db');
    workspace.dispose();
  }

  {
    const { workspace } = loadImportedWorkspace(`
services:
  web:
    image: nginx
    networks:
      - backend
networks:
  backend:
    driver: bridge
`);
    assert.equal(findBlock(workspace, 'networkref').getFieldValue('TARGET'), 'backend');
    const network = findBlock(workspace, 'network');
    assert.equal(network.getFieldValue('NAME'), 'backend');
    assert.equal(network.getFieldValue('DRIVER'), 'bridge');
    workspace.dispose();
  }

  {
    const { workspace } = loadImportedWorkspace(`
services:
  web:
    image: nginx
    restart: unless-stopped
`);
    assert.equal(findBlock(workspace, 'restart').getFieldValue('POLICY'), 'unless-stopped');
    workspace.dispose();
  }

  {
    const { workspace } = loadImportedWorkspace(`
services:
  web:
    build: .
`);
    assert.equal(findBlock(workspace, 'build').getFieldValue('CONTEXT'), '.');
    assert.equal(findBlock(workspace, 'service').getFieldValue('IMAGE'), '');
    workspace.dispose();
  }

  {
    const { result, workspace } = loadImportedWorkspace(`
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile.dev
`);
    assert.equal(findBlock(workspace, 'build').getFieldValue('CONTEXT'), '.');
    assert.deepEqual(unsupportedPaths(result), ['services.web.build.dockerfile']);
    workspace.dispose();
  }

  {
    const { workspace } = loadImportedWorkspace(`
services:
  web:
    image: nginx
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
`);
    const healthcheck = findBlock(workspace, 'healthcheck');
    assert.equal(healthcheck.getFieldValue('COMMAND'), 'curl -f http://localhost || exit 1');
    assert.equal(healthcheck.getFieldValue('INTERVAL'), '30s');
    assert.equal(healthcheck.getFieldValue('TIMEOUT'), '10s');
    assert.equal(healthcheck.getFieldValue('RETRIES'), 3);
    workspace.dispose();
  }

  {
    const expectedSections = [
      'services:',
      '  web:',
      '    image: docker-blocks-demo-web:latest',
      '    build: .',
      '    restart: unless-stopped',
      '    healthcheck:',
      '      test: ["CMD-SHELL", "curl -f http://localhost || exit 1"]',
      '    depends_on:',
      '      - database',
      '    networks:',
      '      - backend',
      '    ports:',
      '      - "8080:80"',
      '    environment:',
      '      APP_ENV: production',
      '      DATABASE_HOST: database',
      '  database:',
      '    image: postgres:latest',
      '    volumes:',
      '      - "./data:/var/lib/postgresql/data"',
      'networks:',
      '  backend:',
      '    driver: bridge'
    ];
    const yaml = generatedYamlFor(`
services:
  web:
    image: docker-blocks-demo-web:latest
    build: .
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
    depends_on:
      - database
    networks:
      - backend
    ports:
      - "8080:80"
    environment:
      APP_ENV: production
      DATABASE_HOST: database
  database:
    image: postgres:latest
    volumes:
      - "./data:/var/lib/postgresql/data"
networks:
  backend:
    driver: bridge
`);
    expectedSections.forEach(section => assert.ok(yaml.includes(section), section));
  }

  {
    const result = importDockerComposeYaml('services:\n  web: [');
    assert.equal(result.success, false);
    assert.match(result.errors[0].message, /Flow sequence/);
  }

  {
    const result = importDockerComposeYaml('   ');
    assert.equal(result.success, false);
    assert.equal(result.errors[0].path, '$');
    assert.match(result.errors[0].message, /empty/i);
  }

  {
    const result = importDockerComposeYaml('name: app\n');
    assert.equal(result.success, false);
    assert.equal(result.errors[0].path, 'services');
  }

  {
    const result = importDockerComposeYaml(`
services:
  web: nginx
`);
    assert.equal(result.success, false);
    assert.equal(result.errors[0].path, 'services.web');
  }

  {
    const { result, workspace } = loadImportedWorkspace(`
services:
  web:
    image: nginx
    command: nginx -g "daemon off;"
`);
    assert.deepEqual(unsupportedPaths(result), ['services.web.command']);
    assert.equal(findBlock(workspace, 'service').getFieldValue('IMAGE'), 'nginx');
    workspace.dispose();
  }

  {
    const { result } = loadImportedWorkspace(`
services:
  web:
    image: nginx
    command: npm start
    profiles:
      - dev
`);
    assert.deepEqual(unsupportedPaths(result), ['services.web.command', 'services.web.profiles']);
  }

  {
    const { result, workspace } = loadImportedWorkspace(`
services:
  web:
    image: nginx
    command: npm start
    profiles:
      - dev
    ports:
      - target: 80
        published: 8080
`);
    assert.equal(result.success, true);
    assert.deepEqual(unsupportedPaths(result), [
      'services.web.command',
      'services.web.profiles',
      'services.web.ports[0]'
    ]);
    assert.equal(findBlock(workspace, 'service').getFieldValue('IMAGE'), 'nginx');
    assert.equal(workspace.getAllBlocks(false).filter(block => block.type === 'port').length, 0);
    workspace.dispose();
  }

  {
    const { result, workspace } = loadImportedWorkspace(`
services:
  web:
    image: nginx
    depends_on:
      db:
        condition: service_healthy
    networks:
      backend:
        aliases:
          - web
  db:
    image: postgres
networks:
  backend:
    driver: bridge
    internal: true
`);
    assert.deepEqual(unsupportedPaths(result), [
      'services.web.depends_on',
      'services.web.networks',
      'networks.backend.internal'
    ]);
    assert.equal(findBlock(workspace, 'dependency').getFieldValue('TARGET'), 'db');
    assert.equal(findBlock(workspace, 'networkref').getFieldValue('TARGET'), 'backend');
    workspace.dispose();
  }

  console.log('[PASS] Docker Compose reverse importer: parsing, normalization, warnings, Blockly state loading');
} finally {
  Blockly.getMainWorkspace()?.dispose?.();
}
