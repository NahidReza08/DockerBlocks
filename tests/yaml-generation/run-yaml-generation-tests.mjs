import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as Blockly from 'blockly';
import ts from 'typescript';
import { parse } from 'yaml';
import { createServicesForGrammar } from 'langium/grammar';

import { loadGrammar } from '../../generate_blockly/src/grammar-loader.js';
import { validateGrammar } from '../../generate_blockly/src/validator.js';
import { buildIR } from '../../generate_blockly/src/ir-builder.js';
import { generateBlocksTs, generateGeneratorTs } from '../../generate_blockly/src/blockly-ts-target.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const dockerGrammar = path.join(repoRoot, 'generate_blockly/input/docker-compose.langium');

function extractBlockDefinitions(blocksTs) {
  const marker = 'Blockly.defineBlocksWithJsonArray(';
  const arrayStart = blocksTs.indexOf('[', blocksTs.indexOf(marker));
  const arrayEnd = blocksTs.indexOf('\n  );', arrayStart);
  return JSON.parse(blocksTs.slice(arrayStart, arrayEnd).trim());
}

async function loadGeneratedGenerator(generatorTs) {
  const dockerYamlSource = fs.readFileSync(path.join(repoRoot, 'blockly_app/src/docker-yaml.ts'), 'utf8');
  const tempModule = path.join(__dirname, `.generated-generator-${process.pid}.mjs`);
  const tempDockerYamlModule = path.join(__dirname, `.generated-docker-yaml-${process.pid}.mjs`);
  const transpiledDockerYaml = ts.transpileModule(dockerYamlSource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  });
  const transpiled = ts.transpileModule(generatorTs, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
  });
  fs.writeFileSync(tempDockerYamlModule, transpiledDockerYaml.outputText, 'utf8');
  fs.writeFileSync(
    tempModule,
    transpiled.outputText.replace("from './docker-yaml';", `from './${path.basename(tempDockerYamlModule)}';`),
    'utf8'
  );

  try {
    return await import(pathToFileURL(tempModule).href + `?t=${Date.now()}`);
  } finally {
    fs.unlinkSync(tempModule);
    fs.unlinkSync(tempDockerYamlModule);
  }
}

function connect(parent, inputName, child) {
  parent.getInput(inputName).connection.connect(child.previousConnection);
  return child;
}

function append(after, child) {
  after.nextConnection.connect(child.previousConnection);
  return child;
}

function block(workspace, type, fields = {}) {
  const result = workspace.newBlock(type);
  for (const [field, value] of Object.entries(fields)) {
    result.setFieldValue(String(value), field);
  }
  return result;
}

function image(workspace, value) {
  return block(workspace, 'image', { IMAGE: value });
}

try {
  console.log('\nDocker Compose YAML Generation Tests\n');
  console.log('Testing Docker Compose YAML generation...');

  const grammar = await loadGrammar(dockerGrammar);
  validateGrammar(grammar);
  const ir = buildIR(grammar);
  const blockDefinitions = extractBlockDefinitions(generateBlocksTs(ir));
  Blockly.defineBlocksWithJsonArray(blockDefinitions);
  const { generator } = await loadGeneratedGenerator(generateGeneratorTs(ir));
  const grammarServices = await createServicesForGrammar({ grammar });

  for (const [label, source] of [
    ['image-only service', 'compose { service web { image nginx } }'],
    ['build-only service', 'compose { service web { build "." } }'],
    ['full service', 'compose { service web { image nginx restart always port 8080 -> 80 environment NODE_ENV = production volume "./data" -> "/data" } network backend driver bridge }']
  ]) {
    const parsed = grammarServices.parser.LangiumParser.parse(source);
    assert.deepEqual(parsed.lexerErrors, [], `${label} has no lexer errors`);
    assert.deepEqual(parsed.parserErrors, [], `${label} parses`);
  }

  const workspace = new Blockly.Workspace();
  try {
    const compose = block(workspace, 'compose');
    const web = connect(compose, 'ELEMENTS', block(workspace, 'service', { NAME: 'web' }));
    let config = connect(web, 'CONFIG', image(workspace, 'nginx:latest'));
    config = append(config, block(workspace, 'volume', { SOURCE: './data', TARGET: '/data' }));
    config = append(config, block(workspace, 'environment', { KEY: 'NODE_ENV', VALUE: 'production' }));
    config = append(config, block(workspace, 'port', { HOST_PORT: 8080, CONTAINER_PORT: 80 }));
    config = append(config, block(workspace, 'restart', { POLICY: 'unless-stopped' }));
    config = append(config, block(workspace, 'healthcheck', {
      COMMAND: 'curl -f http://localhost || exit 1',
      INTERVAL: '30s',
      TIMEOUT: '10s',
      RETRIES: 3
    }));
    config = append(config, block(workspace, 'dependency', { TARGET: 'db' }));
    config = append(config, block(workspace, 'networkref', { TARGET: 'backend' }));

    const db = append(web, block(workspace, 'service', { NAME: 'db' }));
    let dbConfig = connect(db, 'CONFIG', image(workspace, 'postgres:15'));
    dbConfig = append(dbConfig, block(workspace, 'environment', { KEY: 'POSTGRES_PASSWORD', VALUE: 'example' }));
    dbConfig = append(dbConfig, block(workspace, 'volume', { SOURCE: 'pgdata', TARGET: '/var/lib/postgresql/data' }));
    append(db, block(workspace, 'network', { NAME: 'backend', DRIVER: 'bridge' }));

    const yaml = generator.workspaceToCode(workspace);
    const expected =
      'services:\n' +
      '  web:\n' +
      '    image: nginx:latest\n' +
      '    restart: unless-stopped\n' +
      '    healthcheck:\n' +
      '      test: ["CMD-SHELL", "curl -f http://localhost || exit 1"]\n' +
      '      interval: 30s\n' +
      '      timeout: 10s\n' +
      '      retries: 3\n' +
      '    depends_on:\n' +
      '      - db\n' +
      '    networks:\n' +
      '      - backend\n' +
      '    ports:\n' +
      '      - "8080:80"\n' +
      '    environment:\n' +
      '      NODE_ENV: production\n' +
      '    volumes:\n' +
      '      - "./data:/data"\n' +
      '  db:\n' +
      '    image: postgres:15\n' +
      '    environment:\n' +
      '      POSTGRES_PASSWORD: example\n' +
      '    volumes:\n' +
      '      - "pgdata:/var/lib/postgresql/data"\n' +
      'networks:\n' +
      '  backend:\n' +
      '    driver: bridge\n';

    assert.equal(yaml, expected, 'YAML generation uses canonical key order independent of visual config order');
    assert.deepEqual(parse(yaml), {
      services: {
        web: {
          image: 'nginx:latest',
          restart: 'unless-stopped',
          healthcheck: {
            test: ['CMD-SHELL', 'curl -f http://localhost || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3
          },
          depends_on: ['db'],
          networks: ['backend'],
          ports: ['8080:80'],
          environment: { NODE_ENV: 'production' },
          volumes: ['./data:/data']
        },
        db: {
          image: 'postgres:15',
          environment: { POSTGRES_PASSWORD: 'example' },
          volumes: ['pgdata:/var/lib/postgresql/data']
        }
      },
      networks: {
        backend: { driver: 'bridge' }
      }
    });
    assert.equal(generator.workspaceToCode(workspace), yaml, 'YAML generation is deterministic');
    console.log('[PASS] Dynamic service config chain generates deterministic Docker Compose YAML');
  } finally {
    workspace.dispose();
  }

  for (const [policy, expectedScalar] of [
    ['no', '"no"'],
    ['always', 'always'],
    ['on-failure', 'on-failure'],
    ['unless-stopped', 'unless-stopped']
  ]) {
    const restartWorkspace = new Blockly.Workspace();
    try {
      const compose = block(restartWorkspace, 'compose');
      const service = connect(compose, 'ELEMENTS', block(restartWorkspace, 'service', { NAME: 'web' }));
      const img = connect(service, 'CONFIG', image(restartWorkspace, 'nginx'));
      append(img, block(restartWorkspace, 'restart', { POLICY: policy }));
      const yaml = generator.workspaceToCode(restartWorkspace);
      assert.equal(yaml, `services:\n  web:\n    image: nginx\n    restart: ${expectedScalar}\n`);
      assert.equal(parse(yaml).services.web.restart, policy);
    } finally {
      restartWorkspace.dispose();
    }
  }
  console.log('[PASS] Restart policies generate parse-safe YAML including quoted no');

  console.log('\n✓ All Docker Compose YAML generation tests passed\n');
} catch (error) {
  console.error('\n✗ Docker Compose YAML generation test failed\n');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
