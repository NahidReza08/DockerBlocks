# Docker Compose Examples

This directory contains small Docker Compose fixtures used for manual testing,
documentation, and regression coverage of the maintained DockerBlocks editor.

See the [supported subset and limitations](../../README.md#supported-docker-compose-subset)
and [test instructions](../../README.md#tests) for the current application.

## Examples

| ID | File | Scenario | Expected result |
|---|---|---|---|
| D01 | `D01-valid-minimal.yaml` | Minimal service with name and image | Valid |
| D02 | `D02-invalid-missing-name.txt` | Service name is missing | Validation error |
| D03 | `D03-invalid-missing-image.txt` | Service image is missing | Validation error |
| D04 | [D04-valid-multi-service.yaml](D04-valid-multi-service.yaml) | Nginx frontend and Node 20 backend with ports, environment entries, and bind mounts | Valid |

## Multi-Service Demo (D04)

D04 represents the canonical early multi-service YAML output:

- `frontend` uses `nginx`, maps `8080:80`, sets `NODE_ENV`, and mounts
  `./frontend:/usr/share/nginx/html`.
- `backend` uses `node:20`, maps `3000:3000`, sets `NODE_ENV` and `API_PORT`,
  and mounts `./data:/app/data`.

To recreate it manually, run `npm run dev`, add one Compose block, and add two
Service blocks with Image, Port, Environment, and Volume blocks in the same
values shown in the YAML file. Then compare the generated panel output with
[D04-valid-multi-service.yaml](D04-valid-multi-service.yaml).

Run `npm run test:yaml-generation` from the repository root to verify the
current YAML generator against the maintained Docker block model.

