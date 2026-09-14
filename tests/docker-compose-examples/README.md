# Docker Compose Examples

This directory contains reusable Docker Compose examples for testing and demonstrating Docker block behavior.

The examples serve as fixture data and demos. D04 is checked by the existing YAML generation tests.

## Examples

| ID | File | Scenario | Expected Result |
|---|---|---|---|
| D01 | `D01-valid-minimal.yaml` | Minimal service with name and image | Valid |
| D02 | `D02-invalid-missing-name.txt` | Service name is missing | Validation error |
| D03 | `D03-invalid-missing-image.txt` | Service image is missing | Validation error |
| D04 | [D04-valid-multi-service.dsl](D04-valid-multi-service.dsl) / [expected YAML](D04-valid-multi-service.yaml) | Nginx frontend and Node 20 backend with ports, environment entries and bind mounts | Valid |

## Purpose

These fixtures can be reused for:

- manual testing;
- future automated regression tests;
- demonstrations;
- documentation.

## Expected Behavior

D01 represents valid Docker Compose output.

D02 and D03 represent invalid Docker service configurations that should be rejected by validation.

## Multi-service demo (D04)

Open `D04-valid-multi-service.dsl` for the complete supported Docker subset:
two named services and images, port mappings, environment entries, and short volume mappings.
The frontend maps port 8080 to 80 and mounts `./frontend` at `/usr/share/nginx/html`.
The backend maps port 3000 to 3000 and mounts `./data` at `/app/data`.
Both use `NODE_ENV = production`; the backend also sets `API_PORT = 3000`.

The DSL follows `generate_blockly/input/docker-compose.langium`: image first,
then ports, environments, and volumes. Volume paths are quoted strings;
the numeric environment value is unquoted in DSL and emitted as `"3000"` in YAML.

For a Blockly demo, run `npm run dev` and recreate the DSL using one Compose
block with two Service blocks, adding their Port, Environment, and Volume blocks
in the listed order. Enter volume paths without the DSL quote delimiters in
Blockly fields. Compare the output panel with `D04-valid-multi-service.yaml`.
This is a configuration/generation demo: application files and a backend startup
command are not supplied, so it does not provide a running full-stack application.

Run `npm run test:yaml-generation` (also included in `npm test`) to parse D04
with the actual grammar, populate a test workspace from that parsed example,
and verify generated YAML against the companion file and expected service values.
