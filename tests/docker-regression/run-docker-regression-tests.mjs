import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import * as Blockly from 'blockly';
import ts from 'typescript';
import { parse } from 'yaml';

const projectRoot = path.resolve('.');
const tempBlocksPath = path.join(projectRoot, 'tests/docker-regression/.temp-blocks.mjs');
const tempGeneratorPath = path.join(projectRoot, 'tests/docker-regression/.temp-generator.mjs');
const tempDockerYamlPath = path.join(projectRoot, 'tests/docker-regression/.temp-docker-yaml.mjs');

async function loadTypescriptModule(sourcePath, tempPath) {
  const source = await readFile(sourcePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  });
  let moduleText = outputText;

  if (outputText.includes("from './docker-yaml';")) {
    const dockerYamlSource = await readFile(path.join(projectRoot, 'blockly_app/src/docker-yaml.ts'), 'utf8');
    const transpiledDockerYaml = ts.transpileModule(dockerYamlSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
    });
    await writeFile(tempDockerYamlPath, transpiledDockerYaml.outputText);
    moduleText = outputText.replace("from './docker-yaml';", "from './.temp-docker-yaml.mjs';");
  }

  await writeFile(tempPath, moduleText);
  return import(pathToFileURL(tempPath).href + '?cache=' + Date.now());
}

async function loadDockerValidationCollector() {
  const source = await readFile(path.join(projectRoot, 'blockly_app/src/docker-validation.ts'), 'utf8');
  const script = source.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const { outputText } = ts.transpileModule(script, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  });
  return new Function(outputText + '\nreturn collectDockerValidationErrors;')();
}

function block(workspace, type, fields = {}) {
  const result = workspace.newBlock(type);
  for (const [field, value] of Object.entries(fields)) result.setFieldValue(String(value), field);
  return result;
}

function connect(parent, inputName, child) {
  parent.getInput(inputName).connection.connect(child.previousConnection);
  return child;
}

function append(after, child) {
  after.nextConnection.connect(child.previousConnection);
  return child;
}

function service(workspace, name, imageName) {
  const serviceBlock = block(workspace, 'service', { NAME: name });
  if (imageName !== undefined) connect(serviceBlock, 'CONFIG', block(workspace, 'image', { IMAGE: imageName }));
  return serviceBlock;
}

console.log('\nDocker Regression Tests\n');

try {
  const { defineBlocks } = await loadTypescriptModule(path.join(projectRoot, 'blockly_app/src/blocks.ts'), tempBlocksPath);
  const { generator } = await loadTypescriptModule(path.join(projectRoot, 'blockly_app/src/generator.ts'), tempGeneratorPath);
  const collect = await loadDockerValidationCollector();
  defineBlocks();

  const workspace = new Blockly.Workspace();
  try {
    const compose = block(workspace, 'compose');
    const web = connect(compose, 'ELEMENTS', service(workspace, 'web', 'nginx'));
    let webConfigTail = web.getInputTargetBlock('CONFIG');
    webConfigTail = append(webConfigTail, block(workspace, 'port', { HOST_PORT: 8080, CONTAINER_PORT: 80 }));
    webConfigTail = append(webConfigTail, block(workspace, 'environment', { KEY: 'NODE_ENV', VALUE: 'production' }));
    webConfigTail = append(webConfigTail, block(workspace, 'volume', { SOURCE: './html', TARGET: '/usr/share/nginx/html' }));
    const firstRestart = append(webConfigTail, block(workspace, 'restart', { POLICY: 'unless-stopped' }));
    webConfigTail = firstRestart;
    webConfigTail = append(webConfigTail, block(workspace, 'dependency', { TARGET: 'db' }));
    webConfigTail = append(webConfigTail, block(workspace, 'networkref', { TARGET: 'backend' }));

    const db = append(web, service(workspace, 'db', 'postgres:15'));
    append(db.getInputTargetBlock('CONFIG'), block(workspace, 'healthcheck', {
      COMMAND: 'pg_isready -U user -d app',
      INTERVAL: '10s',
      TIMEOUT: '5s',
      RETRIES: 5
    }));
    append(db, block(workspace, 'network', { NAME: 'backend', DRIVER: 'bridge' }));

    assert.deepEqual(collect(workspace), [], 'Full dynamic workspace validates cleanly');
    const yaml = generator.workspaceToCode(workspace);
    assert.deepEqual(parse(yaml), {
      services: {
        web: {
          image: 'nginx',
          restart: 'unless-stopped',
          depends_on: ['db'],
          networks: ['backend'],
          ports: ['8080:80'],
          environment: { NODE_ENV: 'production' },
          volumes: ['./html:/usr/share/nginx/html']
        },
        db: {
          image: 'postgres:15',
          healthcheck: {
            test: ['CMD-SHELL', 'pg_isready -U user -d app'],
            interval: '10s',
            timeout: '5s',
            retries: 5
          }
        }
      },
      networks: { backend: { driver: 'bridge' } }
    });
    console.log('[PASS] Dynamic Docker blocks generate and validate expected Compose YAML');

    const duplicate = append(db, service(workspace, 'web', 'redis'));
    const duplicateErrors = collect(workspace).filter((error) => error.message === 'Duplicate service name "web".');
    assert.equal(duplicateErrors.length, 2, 'Duplicate service validation flags both services');
    duplicate.setFieldValue('cache', 'NAME');
    assert.deepEqual(collect(workspace), [], 'Duplicate service validation clears after rename');

    const secondRestart = block(workspace, 'restart', { POLICY: 'always' });
    webConfigTail.nextConnection.connect(secondRestart.previousConnection);
    assert.deepEqual(
      collect(workspace).filter((error) => error.message.includes('multiple Restart blocks')).map((error) => error.blockId).sort(),
      [firstRestart.id, secondRestart.id].sort(),
      'Singleton Restart cardinality errors attach to both duplicate blocks'
    );
    secondRestart.dispose(true);
    assert.deepEqual(collect(workspace), [], 'Singleton Restart error clears after removal');

    web.getInputTargetBlock('CONFIG').setFieldValue('', 'IMAGE');
    assert.equal(
      collect(workspace).find((error) => error.blockId === web.id)?.message,
      'Service requires an image or build configuration.',
      'Service without image/build keeps existing required configuration validation'
    );
    web.getInputTargetBlock('CONFIG').setFieldValue('nginx', 'IMAGE');
    assert.deepEqual(collect(workspace), [], 'Required configuration validation clears after image is restored');
    console.log('[PASS] Validation covers duplicates, singleton cardinality, and required image/build behavior');
  } finally {
    workspace.dispose();
  }

  console.log('\n[PASS] All Docker regression tests passed\n');
} finally {
  await rm(tempBlocksPath, { force: true });
  await rm(tempGeneratorPath, { force: true });
  await rm(tempDockerYamlPath, { force: true });
}
