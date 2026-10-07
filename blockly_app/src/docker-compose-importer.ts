import { parseDocument } from 'yaml';

type WorkspaceState = {
  blocks: {
    languageVersion: number;
    blocks: BlockState[];
  };
};

type BlockState = {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block: BlockState }>;
  next?: { block: BlockState };
};

export type DockerComposeImportIssue = {
  path: string;
  message: string;
};

export type DockerComposeImportResult = {
  success: boolean;
  workspaceState?: WorkspaceState;
  importedServices: number;
  importedNetworks: number;
  warnings: DockerComposeImportIssue[];
  unsupportedFields: DockerComposeImportIssue[];
  errors: DockerComposeImportIssue[];
};

type NormalizedPort = {
  hostPort: number;
  containerPort: number;
};

type NormalizedEnvironment = {
  key: string;
  value: string;
};

type NormalizedVolume = {
  source: string;
  target: string;
};

type NormalizedHealthcheck = {
  command: string;
  interval: string;
  timeout: string;
  retries: number;
};

type NormalizedService = {
  name: string;
  image?: string;
  build?: string;
  restart?: string;
  healthcheck?: NormalizedHealthcheck;
  dependencies: string[];
  networks: string[];
  ports: NormalizedPort[];
  environment: NormalizedEnvironment[];
  volumes: NormalizedVolume[];
};

type NormalizedNetwork = {
  name: string;
  driver?: string;
};

type NormalizedComposeModel = {
  services: NormalizedService[];
  networks: NormalizedNetwork[];
  warnings: DockerComposeImportIssue[];
  unsupportedFields: DockerComposeImportIssue[];
};

const SUPPORTED_SERVICE_KEYS = new Set([
  'image',
  'build',
  'ports',
  'environment',
  'volumes',
  'depends_on',
  'networks',
  'restart',
  'healthcheck'
]);

const SUPPORTED_RESTART_POLICIES = new Set([
  'no',
  'always',
  'on-failure',
  'unless-stopped'
]);

function issue(path: string, message: string): DockerComposeImportIssue {
  return { path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

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

function block(
  type: string,
  fields: Record<string, unknown> = {},
  inputs: Record<string, { block: BlockState }> = {}
): BlockState {
  return { type, fields, inputs };
}

function addInput(
  inputs: Record<string, { block: BlockState }>,
  name: string,
  blocks: BlockState[]
) {
  const first = stack(blocks);
  if (first) inputs[name] = { block: first };
}

function scalarString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function collectUnsupportedKeys(
  object: Record<string, unknown>,
  supportedKeys: Set<string>,
  path: string,
  unsupportedFields: DockerComposeImportIssue[]
) {
  Object.keys(object).forEach((key) => {
    if (supportedKeys.has(key)) return;

    unsupportedFields.push(issue(
      `${path}.${key}`,
      `${path}.${key} is not supported`
    ));
  });
}

export function parseComposeYaml(yamlText: string): {
  parsed?: unknown;
  errors: DockerComposeImportIssue[];
} {
  if (yamlText.trim().length === 0) {
    return {
      errors: [issue('$', 'Docker Compose YAML is empty.')]
    };
  }

  const document = parseDocument(yamlText, {
    uniqueKeys: false
  });

  if (document.errors.length > 0) {
    return {
      errors: document.errors.map((error) => issue('$', error.message))
    };
  }

  return {
    parsed: document.toJS(),
    errors: []
  };
}

function normalizePorts(
  value: unknown,
  path: string,
  warnings: DockerComposeImportIssue[],
  unsupportedFields: DockerComposeImportIssue[]
): NormalizedPort[] {
  if (!Array.isArray(value)) {
    warnings.push(issue(path, `${path} must be a list to import ports.`));
    return [];
  }

  return value.flatMap((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const text = scalarString(entry);

    if (!text) {
      unsupportedFields.push(issue(entryPath, `${entryPath} uses unsupported port syntax`));
      return [];
    }

    const match = text.match(/^(\d+):(\d+)$/);
    if (!match) {
      warnings.push(issue(entryPath, `${entryPath} must use "host:container" syntax.`));
      return [];
    }

    return [{
      hostPort: Number(match[1]),
      containerPort: Number(match[2])
    }];
  });
}

function normalizeEnvironment(
  value: unknown,
  path: string,
  warnings: DockerComposeImportIssue[],
  unsupportedFields: DockerComposeImportIssue[]
): NormalizedEnvironment[] {
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, entryValue]) => {
      const normalizedValue = scalarString(entryValue);
      if (normalizedValue === undefined) {
        unsupportedFields.push(issue(`${path}.${key}`, `${path}.${key} uses unsupported environment value syntax`));
        return [];
      }

      return [{ key, value: normalizedValue }];
    });
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => {
      const entryPath = `${path}[${index}]`;
      const text = scalarString(entry);
      if (!text || !text.includes('=')) {
        unsupportedFields.push(issue(entryPath, `${entryPath} uses unsupported environment syntax`));
        return [];
      }

      const separator = text.indexOf('=');
      return [{
        key: text.slice(0, separator),
        value: text.slice(separator + 1)
      }];
    });
  }

  warnings.push(issue(path, `${path} must be a map or KEY=value list to import environment.`));
  return [];
}

function normalizeVolumes(
  value: unknown,
  path: string,
  warnings: DockerComposeImportIssue[],
  unsupportedFields: DockerComposeImportIssue[]
): NormalizedVolume[] {
  if (!Array.isArray(value)) {
    warnings.push(issue(path, `${path} must be a list to import volumes.`));
    return [];
  }

  return value.flatMap((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const text = scalarString(entry);

    if (!text) {
      unsupportedFields.push(issue(entryPath, `${entryPath} uses unsupported volume syntax`));
      return [];
    }

    const separator = text.indexOf(':');
    if (separator <= 0 || separator === text.length - 1) {
      warnings.push(issue(entryPath, `${entryPath} must use "source:target" syntax.`));
      return [];
    }

    return [{
      source: text.slice(0, separator),
      target: text.slice(separator + 1)
    }];
  });
}

function normalizeStringList(
  value: unknown,
  path: string,
  label: string,
  warnings: DockerComposeImportIssue[],
  unsupportedFields: DockerComposeImportIssue[]
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => {
      const text = scalarString(entry);
      if (!text) {
        unsupportedFields.push(issue(`${path}[${index}]`, `${path}[${index}] uses unsupported ${label} syntax`));
        return [];
      }

      return [text];
    });
  }

  if (isRecord(value)) {
    unsupportedFields.push(issue(path, `${path} object syntax is not fully supported; importing names only`));
    return Object.keys(value);
  }

  warnings.push(issue(path, `${path} must be a list to import ${label}.`));
  return [];
}

function normalizeBuild(
  value: unknown,
  path: string,
  unsupportedFields: DockerComposeImportIssue[]
): string | undefined {
  const scalar = scalarString(value);
  if (scalar !== undefined) return scalar;

  if (isRecord(value)) {
    Object.keys(value).forEach((key) => {
      if (key !== 'context') {
        unsupportedFields.push(issue(`${path}.${key}`, `${path}.${key} is not supported`));
      }
    });

    return scalarString(value.context);
  }

  unsupportedFields.push(issue(path, `${path} uses unsupported build syntax`));
  return undefined;
}

function normalizeHealthcheck(
  value: unknown,
  path: string,
  warnings: DockerComposeImportIssue[],
  unsupportedFields: DockerComposeImportIssue[]
): NormalizedHealthcheck | undefined {
  if (!isRecord(value)) {
    warnings.push(issue(path, `${path} must be a map to import healthcheck.`));
    return undefined;
  }

  const supportedKeys = new Set(['test', 'interval', 'timeout', 'retries']);
  collectUnsupportedKeys(value, supportedKeys, path, unsupportedFields);

  let command: string | undefined;
  if (typeof value.test === 'string') {
    command = value.test;
  } else if (Array.isArray(value.test) &&
    value.test[0] === 'CMD-SHELL' &&
    typeof value.test[1] === 'string') {
    command = value.test[1];
  } else {
    warnings.push(issue(`${path}.test`, `${path}.test must be a string or ["CMD-SHELL", command].`));
  }

  const interval = scalarString(value.interval);
  const timeout = scalarString(value.timeout);
  const retries = typeof value.retries === 'number'
    ? value.retries
    : Number(scalarString(value.retries));

  if (!command || !interval || !timeout || !Number.isInteger(retries)) {
    warnings.push(issue(path, `${path} is missing one or more required Docker-Blocks healthcheck fields.`));
    return undefined;
  }

  return {
    command,
    interval,
    timeout,
    retries
  };
}

function normalizeService(
  name: string,
  value: unknown,
  path: string,
  warnings: DockerComposeImportIssue[],
  unsupportedFields: DockerComposeImportIssue[],
  errors: DockerComposeImportIssue[]
): NormalizedService | undefined {
  if (!isRecord(value)) {
    errors.push(issue(path, `${path} must be a map.`));
    return undefined;
  }

  collectUnsupportedKeys(value, SUPPORTED_SERVICE_KEYS, path, unsupportedFields);

  const service: NormalizedService = {
    name,
    dependencies: [],
    networks: [],
    ports: [],
    environment: [],
    volumes: []
  };

  const image = scalarString(value.image);
  if (image !== undefined) service.image = image;
  else if ('image' in value) warnings.push(issue(`${path}.image`, `${path}.image must be a scalar value.`));

  if ('build' in value) {
    service.build = normalizeBuild(value.build, `${path}.build`, unsupportedFields);
  }

  if ('restart' in value) {
    const restart = scalarString(value.restart);
    if (restart && SUPPORTED_RESTART_POLICIES.has(restart)) {
      service.restart = restart;
    } else {
      warnings.push(issue(`${path}.restart`, `${path}.restart must be one of: no, always, on-failure, unless-stopped.`));
    }
  }

  if ('healthcheck' in value) {
    service.healthcheck = normalizeHealthcheck(
      value.healthcheck,
      `${path}.healthcheck`,
      warnings,
      unsupportedFields
    );
  }

  if ('depends_on' in value) {
    service.dependencies = normalizeStringList(
      value.depends_on,
      `${path}.depends_on`,
      'depends_on',
      warnings,
      unsupportedFields
    );
  }

  if ('networks' in value) {
    service.networks = normalizeStringList(
      value.networks,
      `${path}.networks`,
      'networks',
      warnings,
      unsupportedFields
    );
  }

  if ('ports' in value) {
    service.ports = normalizePorts(value.ports, `${path}.ports`, warnings, unsupportedFields);
  }

  if ('environment' in value) {
    service.environment = normalizeEnvironment(
      value.environment,
      `${path}.environment`,
      warnings,
      unsupportedFields
    );
  }

  if ('volumes' in value) {
    service.volumes = normalizeVolumes(
      value.volumes,
      `${path}.volumes`,
      warnings,
      unsupportedFields
    );
  }

  return service;
}

function normalizeNetworks(
  value: unknown,
  warnings: DockerComposeImportIssue[],
  unsupportedFields: DockerComposeImportIssue[]
): NormalizedNetwork[] {
  if (value === undefined) return [];

  if (!isRecord(value)) {
    warnings.push(issue('networks', 'networks must be a map to import top-level networks.'));
    return [];
  }

  return Object.entries(value).flatMap(([name, networkValue]) => {
    if (networkValue == null) return [{ name }];

    if (!isRecord(networkValue)) {
      warnings.push(issue(`networks.${name}`, `networks.${name} must be a map or empty value.`));
      return [{ name }];
    }

    Object.keys(networkValue).forEach((key) => {
      if (key !== 'driver') {
        unsupportedFields.push(issue(`networks.${name}.${key}`, `networks.${name}.${key} is not supported`));
      }
    });

    const driver = scalarString(networkValue.driver);
    return [{
      name,
      ...(driver ? { driver } : {})
    }];
  });
}

export function normalizeComposeModel(parsed: unknown): {
  model?: NormalizedComposeModel;
  errors: DockerComposeImportIssue[];
} {
  const warnings: DockerComposeImportIssue[] = [];
  const unsupportedFields: DockerComposeImportIssue[] = [];
  const errors: DockerComposeImportIssue[] = [];

  if (!isRecord(parsed)) {
    return {
      errors: [issue('$', 'Docker Compose YAML must be a mapping.')]
    };
  }

  if (!isRecord(parsed.services)) {
    return {
      errors: [issue('services', 'Docker Compose YAML must include a services map.')]
    };
  }

  if (Object.keys(parsed.services).length === 0) {
    return {
      errors: [issue('services', 'Docker Compose services map must not be empty.')]
    };
  }

  collectUnsupportedKeys(
    parsed,
    new Set(['services', 'networks', 'version', 'name']),
    '$',
    unsupportedFields
  );

  const services = Object.entries(parsed.services).flatMap(([name, value]) => {
    const service = normalizeService(
      name,
      value,
      `services.${name}`,
      warnings,
      unsupportedFields,
      errors
    );

    return service ? [service] : [];
  });

  if (errors.length > 0) return { errors };

  return {
    model: {
      services,
      networks: normalizeNetworks(parsed.networks, warnings, unsupportedFields),
      warnings,
      unsupportedFields
    },
    errors: []
  };
}

function portBlock(port: NormalizedPort): BlockState {
  return block('port', {
    HOST_PORT: port.hostPort,
    CONTAINER_PORT: port.containerPort
  });
}

function environmentBlock(environment: NormalizedEnvironment): BlockState {
  return block('environment', {
    KEY: environment.key,
    VALUE: environment.value
  });
}

function volumeBlock(volume: NormalizedVolume): BlockState {
  return block('volume', {
    SOURCE: volume.source,
    TARGET: volume.target
  });
}

function serviceBlock(service: NormalizedService): BlockState {
  const inputs: Record<string, { block: BlockState }> = {};

  if (service.build) {
    inputs.BUILD = {
      block: block('build', { CONTEXT: service.build })
    };
  }

  if (service.restart) {
    inputs.RESTART = {
      block: block('restart', { POLICY: service.restart })
    };
  }

  if (service.healthcheck) {
    inputs.HEALTHCHECK = {
      block: block('healthcheck', {
        COMMAND: service.healthcheck.command,
        INTERVAL: service.healthcheck.interval,
        TIMEOUT: service.healthcheck.timeout,
        RETRIES: service.healthcheck.retries
      })
    };
  }

  addInput(inputs, 'DEPENDS_ON', service.dependencies.map((target) => block('dependency', { TARGET: target })));
  addInput(inputs, 'NETWORKS', service.networks.map((target) => block('networkref', { TARGET: target })));
  addInput(inputs, 'PORTS', service.ports.map(portBlock));
  addInput(inputs, 'ENVIRONMENT', service.environment.map(environmentBlock));
  addInput(inputs, 'VOLUMES', service.volumes.map(volumeBlock));

  return block('service', {
    NAME: service.name,
    IMAGE: service.image ?? ''
  }, inputs);
}

function networkBlock(network: NormalizedNetwork): BlockState {
  return block('network', {
    NAME: network.name,
    DRIVER: network.driver ?? ''
  });
}

export function composeModelToBlocklyState(model: NormalizedComposeModel): WorkspaceState {
  const inputs: Record<string, { block: BlockState }> = {};
  const serviceStack = stack(model.services.map(serviceBlock));
  const networkStack = stack(model.networks.map(networkBlock));

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

export function importDockerComposeYaml(yamlText: string): DockerComposeImportResult {
  const parsed = parseComposeYaml(yamlText);

  if (parsed.errors.length > 0) {
    return {
      success: false,
      importedServices: 0,
      importedNetworks: 0,
      warnings: [],
      unsupportedFields: [],
      errors: parsed.errors
    };
  }

  const normalized = normalizeComposeModel(parsed.parsed);

  if (!normalized.model) {
    return {
      success: false,
      importedServices: 0,
      importedNetworks: 0,
      warnings: [],
      unsupportedFields: [],
      errors: normalized.errors
    };
  }

  return {
    success: true,
    workspaceState: composeModelToBlocklyState(normalized.model),
    importedServices: normalized.model.services.length,
    importedNetworks: normalized.model.networks.length,
    warnings: normalized.model.warnings,
    unsupportedFields: normalized.model.unsupportedFields,
    errors: []
  };
}
