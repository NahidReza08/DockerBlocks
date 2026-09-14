# DockerBlocks final demo (S3-12)

Demonstrate the implemented Compose configuration vertical slice using D04.

## Prepare and verify

Prerequisites: Node.js compatible with the installed Vite version, npm, and a
modern browser. From the repository root, install dependencies with
`npm.cmd install` if needed. See [README setup](README.md#quick-start).
Use `npm` instead of `npm.cmd` outside Windows.

Run the existing automated checks before presenting:

```powershell
npm.cmd test
npm.cmd run build
```

The test command runs all five suites, including D04 YAML generation and
validation UI integration. The build type-checks TypeScript and builds Vite into
`blockly_app/dist`; leave that output for manual cleanup if needed.
These checks do not replace the browser walkthrough below.

Start the checked-in editor:

```powershell
npm.cmd run dev
```

Open the local URL printed by Vite. Do not run the README's grammar-generation
example: it overwrites the checked-in editor. Stop the server with Ctrl+C after
the demo. All three npm scripts above are defined in [package.json](package.json).

## Valid Blockly walkthrough

1. Begin with an empty workspace and open the **Docker** toolbox category.
   Drag one **compose** root into the workspace.
2. Attach a **Service** block inside the root's **Services** slot. Set
   **Name** to `frontend` and **Image** to `nginx`.
3. Fill its matching slots with blocks from the toolbox:
   - **Ports**: one Port, host `8080`, container `80`.
   - **Environment**: one Environment, key `NODE_ENV`, value `production`.
   - **Volumes**: one Volume, source `./frontend`, target `/usr/share/nginx/html`.
4. Attach a second **Service** below frontend in the same **Services** stack.
   Set **Name** to `backend` and **Image** to `node:20`.
5. Fill backend's matching slots:
   - **Ports**: one Port, host `3000`, container `3000`.
   - **Environment**: stack `NODE_ENV` / `production`, then `API_PORT` / `3000`.
   - **Volumes**: one Volume, source `./data`, target `/app/data`.
6. Finish each field edit with Enter or by clicking outside the field. Enter
   values and paths without quotes. Temporary warnings while building are
   expected (new ports default to zero). Keep all blocks connected to the root.
7. Show **Generated Code** updating to the YAML below. Point out the two services,
   quoted port/volume mappings, and quoted numeric environment value. Confirm
   **Console Errors** says `No errors detected.` and no block has a validation warning.

```yaml
services:
  frontend:
    image: nginx
    ports:
      - "8080:80"
    environment:
      NODE_ENV: production
    volumes:
      - "./frontend:/usr/share/nginx/html"
  backend:
    image: node:20
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      API_PORT: "3000"
    volumes:
      - "./data:/app/data"
```

## Invalid values and live correction

Starting from the valid workspace, demonstrate each row separately. Finish the
edit, show the affected block's warning icon (click it to inspect the message),
and show the corresponding **Console Errors** entry with its block ID.
Then restore the value before moving to the next row.

| Frontend field | Invalid edit | Expected message | Restore |
|---|---|---|---|
| Port host | `65536` | Host port must be an integer between 1 and 65535. | `8080` |
| Environment key | `1INVALID` | Environment key must start with a letter or underscore and contain only letters, numbers, and underscores. | `NODE_ENV` |
| Volume source | Clear the field | Volume source is required. | `./frontend` |
| Service image | Clear the field | Image is required | `nginx` |

After **each correction**, finish the edit and confirm the corresponding block
warning and error entry disappear without reloading the page. The panel should
return to `No errors detected.` and the YAML should match the valid example.
Warnings do not prevent YAML generation; output alone is not evidence of validity.

## D04 reference and supported scope

Show the existing [D04 DSL](tests/docker-compose-examples/D04-valid-multi-service.dsl)
and [D04 expected YAML](tests/docker-compose-examples/D04-valid-multi-service.yaml)
beside the result. This walkthrough recreates that fixture manually; it is not a
DSL import flow. The existing YAML suite parses D04 with the actual grammar,
populates a test workspace, and compares generated output with the YAML fixture.
See the [D04 notes](tests/docker-compose-examples/README.md#multi-service-demo-d04).

Scope: Compose root, multiple services, names/images, ports, environment entries,
and short source-to-target volumes only. See the
[supported subset and limitations](README.md#supported-docker-compose-subset).
This project is a browser-based Vite/TypeScript application and does not require
a separate backend service. Automated tests verify the Docker block model,
validation, connection rules, and YAML generation. Final browser layout,
drag-and-drop interaction, block warning display, and live validation refresh
must still be checked manually by the presenter using this walkthrough.
