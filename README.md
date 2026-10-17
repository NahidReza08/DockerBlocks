# DockerBlocks

DockerBlocks is a Visual Docker Compose Configuration Editor built with
[Blockly](https://developers.google.com/blockly), TypeScript, and Vite. It lets
users assemble a supported Docker Compose configuration visually, validates the
workspace, generates `docker-compose.yml`, and can import/edit Compose YAML back
into Blockly blocks for the supported subset.

This university project originally started from ideas and early code in
[JKlueber/grammar_to_blocks](https://github.com/JKlueber/grammar_to_blocks).
DockerBlocks no longer includes the Langium grammar-to-Blockly generation
pipeline; the Docker Compose blocks and application runtime are now maintained
directly as source code.

## Quick Start

Install dependencies and start the editor from the repository root:

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. Use the toolbox to add Compose, Service,
Network, and service-configuration blocks. The YAML panel updates live.

For a production build:

```powershell
npm run build
npm run preview
```

## Supported Docker Compose Subset

DockerBlocks intentionally supports a practical subset of Compose rather than
the complete Compose specification.

| Block | YAML output | Validation notes |
|---|---|---|
| Compose | `services:` plus optional `networks:` | Root document block. |
| Service | `services.<name>` | Name is required and service names must be unique. A service must have an image or build configuration. |
| Image | `image: ...` | At most one Image block per service. Blank image is allowed only when Build is present. |
| Build | `build: ...` | Short-form build context only. Blank context is rejected. |
| Restart | `restart: no/always/on-failure/unless-stopped` | Dropdown supports exactly `no`, `always`, `on-failure`, `unless-stopped`. `no` is emitted as `"no"` to preserve YAML scalar semantics. |
| Healthcheck | `healthcheck.test`, `interval`, `timeout`, `retries` | Uses `CMD-SHELL` test form. Command, interval, timeout, and retries are validated. |
| Depends On | `depends_on` list | Target is required, must reference an existing service, and cannot be the owning service. |
| Network Ref | service `networks` list | Target is required and must reference a top-level Network block. |
| Network | top-level `networks.<name>` | Name is required and unique. Optional driver field defaults to `bridge`. |
| Port | `ports` short syntax | Host/container ports must be integers from 1 to 65535 and are emitted quoted as `"HOST:CONTAINER"`. |
| Environment | `environment` mapping | Key must be a valid environment identifier. Digit-only values are quoted. Empty values are currently allowed. |
| Volume | `volumes` short syntax | Source and target are required and emitted quoted as `"SOURCE:TARGET"`. |

Unsupported Compose features include Swarm `deploy.restart_policy`, restart
retry counts/delays/windows, commands, secrets, configs, `env_file`, long-form
build options, long-form ports, long-form volumes, top-level volume
declarations, advanced network options, full healthcheck variants, and complete
Compose schema validation.

## YAML Import And Edit

DockerBlocks can import or edit Docker Compose YAML for the supported subset.
Supported fields become Blockly blocks. Unsupported or partially supported
fields are preserved in the import inspector report as warnings instead of being
silently treated as normal validation errors.

The inspector compares the source YAML with the generated/preserved YAML and
marks imported, ignored, partial, and unsupported lines. This is intended to
make reverse generation explainable while keeping the visual language small.

## Architecture

The codebase now separates maintained DockerBlocks source from generated build
artifacts.

```text
blockly_app/
  index.html                    static UI, modals, and panels
  src/
    main.ts                     registers blocks and starts the application
    docker-block-definitions.ts  maintained Blockly block definitions
    generator.ts                Blockly generator wiring for Docker blocks
    docker-yaml.ts              YAML generation helpers
    docker-validation.ts        workspace validation rules
    docker-compose-importer.ts  YAML -> Blockly workspace import engine
    examples/                   Compose YAML example files
    styles/main.css             application styles
    assets/icons.svg            SVG symbol sprite
    docker-example.ts           loads YAML examples through the importer
    app-bootstrap.ts            UI wiring, workspace events, import/edit actions
    validation-ui.ts            validation panel and Blockly warning plumbing
    import-inspector.ts         YAML import/edit inspector rendering
    app-types.ts                shared runtime types
```

`blockly_app/dist/` is Vite build output and is not source.

There is no separate code-generation source-of-truth workflow anymore. To add
or change a Docker block, update the maintained source modules directly:

1. Add or adjust block definitions in
   `blockly_app/src/docker-block-definitions.ts`.
2. Add YAML generation in `blockly_app/src/docker-yaml.ts` and wire it from
   `blockly_app/src/generator.ts`.
3. Add validation in `blockly_app/src/docker-validation.ts` when a constraint
   cannot be guaranteed by the Blockly UI.
4. Update import support in `blockly_app/src/docker-compose-importer.ts` if the
   feature should round-trip from YAML.
5. Add focused regression coverage under `tests/`.

## Tests

Run all checks:

```powershell
npm test
npm run build
```

The test suites cover:

- Blockly connection rules, custom palette, and block definitions.
- Deterministic Docker Compose YAML generation.
- Docker validation regressions for names, image/build requirements, ports,
  environment entries, volumes, dependencies, networks, restart, and
  healthcheck.
- Validation UI plumbing and import inspector behavior.
- YAML import/edit support for the supported Compose subset and unsupported
  field reporting.

Individual scripts:

```powershell
npm run test:block-connections
npm run test:yaml-generation
npm run test:docker-regression
npm run test:docker-validation-ui
npm run test:docker-importer
```

## Built-In Examples

The header example selector includes:

- **Simple Web Service**: one `web` service with `nginx:latest`, port
  `8080:80`, and `restart: unless-stopped`.
- **Multi-Service Application**: a two-service example with image, build,
  ports, environment entries, volume mapping, `depends_on`, a top-level
  `backend` network, service network references, restart policy, and
  healthcheck.

These are demo workspaces only. DockerBlocks generates Compose YAML; it does
not create Dockerfiles, application source files, secrets, or run
`docker compose up`.

## Dependencies

Runtime dependency:

- `blockly`

Development dependencies:

- `@types/node`
- `typescript`
- `vite`
- `yaml`

Workspace names and reference targets are compared exactly (including whitespace);
trimming is used only to check required values. This preserves user-provided names.
Only one Compose root is allowed; standalone Service and Network blocks remain supported.
YAML imports reject duplicate mapping keys and support anchors, aliases, and merge keys.
Examples use the importer without creating an import/edit Inspector report.

The custom palette groups Compose under Structure, Service and its options under
Service Configuration, and Network under Resources. The heading uses a grid icon,
Service uses a server icon, and Image retains its package icon. Native button click
activation supports mouse clicks and Enter/Space alongside pointer drag/drop.
`app-types.ts` remains a shared type-only module so domain validation and UI modules
do not depend on each other at runtime. The network example contains a minimal
Compose wrapper; example loading extracts only its Network block.
