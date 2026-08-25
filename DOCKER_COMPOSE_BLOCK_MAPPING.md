# Docker Compose to Blockly Mapping Research

## Goal

Investigate the important structures of a Docker Compose file and identify how they could eventually be represented as visual Blockly concepts.

## Scope

This task is research and design only. It does **not** implement Docker Compose blocks, YAML generation, or YAML validation.

The purpose is to identify a small, useful set of Docker Compose concepts that can become the foundation for a future visual Docker Compose editor.

---

## Example Docker Compose File

A simple Docker Compose configuration may look like this:

```yaml
services:
  web:
    image: nginx
    ports:
      - "8080:80"
```

A slightly larger example is:

```yaml
services:
  web:
    image: nginx
    ports:
      - "8080:80"
    environment:
      APP_ENV: production
    volumes:
      - ./html:/usr/share/nginx/html
    depends_on:
      - api

  api:
    image: example-api:latest
```

The `services` section is the main top-level structure for defining application components. Each service contains configuration describing how its container should be created and run.

---

## Candidate Compose Concepts

For an initial visual block representation, the following hierarchy is a reasonable starting point:

```text
Docker Compose
│
└── Services
     │
     └── Service
          ├── Image
          ├── Ports
          ├── Environment
          ├── Volumes
          └── Depends On
```

The initial research focuses on these commonly used service-level concepts rather than attempting to represent the complete Docker Compose specification.

Docker Compose supports many additional features, including networks, configs, secrets, build configuration, restart policies, commands, health checks, resource constraints, and deployment configuration. These can be considered later as extensions.

---

## Proposed Compose-to-Block Mapping

| Docker Compose Structure | Example YAML | Potential Blockly Concept | Purpose |
|---|---|---|---|
| Compose document | `services:` | **Docker Compose block** | Root block representing the complete Compose configuration |
| `services` | `services:` | **Services container/input** | Holds one or more service definitions |
| Service | `web:` | **Service block** | Represents one containerized application component |
| `image` | `image: nginx` | **Image block/field** | Specifies the Docker image used by the service |
| `ports` | `- "8080:80"` | **Port Mapping block** | Maps a host port to a container port |
| `environment` | `APP_ENV: production` | **Environment Variable block** | Defines environment variables for a service |
| `volumes` | `- ./data:/data` | **Volume Mount block** | Defines bind mounts or named volume mounts |
| `depends_on` | `- api` | **Depends On block** | Represents a dependency between services |

---

## 1. Docker Compose Block

### Compose concept

The Compose document is the root of the configuration.

### Potential visual representation

```text
Docker Compose
    |
    +-- Services
```

### Possible Blockly behavior

- Acts as the root/top-level block.
- Contains service blocks.
- Eventually generates the top-level `services:` YAML structure.
- A workspace would normally contain one root Compose block.

### Example generated YAML

```yaml
services:
```

---

## 2. Service Block

### Compose concept

A service represents an application component backed by one or more containers.

Examples may include:

- frontend
- backend
- database
- web server
- cache

### Potential visual representation

```text
Service: web
    |
    +-- Image
    +-- Ports
    +-- Environment
    +-- Volumes
    +-- Depends On
```

### Possible Blockly behavior

The service block should:

- contain a service name,
- contain service-level configuration blocks,
- allow multiple services inside one Compose document,
- act as the parent for properties such as image, ports, environment variables, and dependencies.

### Example generated YAML

```yaml
services:
  web:
```

---

## 3. Image Block

### Compose concept

The `image` property specifies the container image used by a service.

### Example

```yaml
services:
  web:
    image: nginx
```

or:

```yaml
services:
  api:
    image: example-api:latest
```

### Potential block

```text
Image [nginx]
```

### Suggested Blockly design

A simple value block or service property containing a text field for the image name.

Possible fields:

- repository/image name
- optional tag

For an initial implementation, a single text field is sufficient.

---

## 4. Ports Block

### Compose concept

The `ports` property publishes container ports to the host.

### Example

```yaml
services:
  web:
    ports:
      - "8080:80"
```

The example maps host port `8080` to container port `80`.

### Potential block

```text
Port Mapping
Host Port:      [8080]
Container Port: [80]
```

### Suggested Blockly design

A service may contain multiple Port Mapping blocks.

For example:

```text
Service web
    |
    +-- Port Mapping 8080 -> 80
    +-- Port Mapping 8443 -> 443
```

This is preferable to storing the complete `"8080:80"` expression in one text field because Blockly can expose the meaning of each value visually.

Future versions could support:

- protocol (`tcp` / `udp`),
- host IP,
- long Compose port syntax.

---

## 5. Environment Variable Block

### Compose concept

The `environment` property defines environment variables available inside a service container.

### Example

```yaml
services:
  web:
    environment:
      APP_ENV: production
      DEBUG: "false"
```

### Potential block

```text
Environment Variable
Name:  [APP_ENV]
Value: [production]
```

### Suggested Blockly design

A service may contain multiple Environment Variable blocks.

For example:

```text
Service web
    |
    +-- Environment APP_ENV = production
    +-- Environment DEBUG = false
```

This maps naturally to a key/value visual block.

---

## 6. Volume Mount Block

### Compose concept

The service-level `volumes` property defines filesystem mounts available to the service container.

### Example bind mount

```yaml
services:
  web:
    volumes:
      - ./html:/usr/share/nginx/html
```

### Example named volume

```yaml
services:
  database:
    volumes:
      - db-data:/var/lib/database

volumes:
  db-data:
```

### Potential block

```text
Volume Mount
Source:      [./html]
Destination: [/usr/share/nginx/html]
```

### Suggested Blockly design

For the initial visual language, the block could expose:

- source
- target/destination

Later versions could distinguish between:

- bind mounts,
- named volumes,
- read-only mounts,
- long volume syntax.

### Important design note

Named volumes can also require a top-level `volumes:` declaration. Therefore, a future implementation may need both:

1. a **service-level Volume Mount block**, and
2. a **top-level Named Volume definition block**.

For the first implementation, service-level volume mounting should be considered the primary concept.

---

## 7. Depends On Block

### Compose concept

The `depends_on` property expresses dependencies between services.

### Example

```yaml
services:
  web:
    depends_on:
      - api

  api:
    image: example-api:latest
```

### Potential block

```text
Depends On [api]
```

### Suggested Blockly design

The value should ideally reference an existing service rather than being arbitrary free text.

For example, if these services exist:

```text
web
api
database
```

the block could eventually provide a dropdown:

```text
Depends On [api ▼]
```

This would help prevent references to nonexistent services.

A service may depend on multiple services, so multiple dependency blocks should be allowed.

---

## Example Visual Structure

The following Compose YAML:

```yaml
services:
  web:
    image: nginx
    ports:
      - "8080:80"
    environment:
      APP_ENV: production
    volumes:
      - ./html:/usr/share/nginx/html
    depends_on:
      - api

  api:
    image: example-api:latest
```

could conceptually be represented as:

```text
Docker Compose
│
├── Service: web
│    ├── Image: nginx
│    ├── Port Mapping
│    │      Host: 8080
│    │      Container: 80
│    ├── Environment Variable
│    │      APP_ENV = production
│    ├── Volume Mount
│    │      ./html -> /usr/share/nginx/html
│    └── Depends On: api
│
└── Service: api
     └── Image: example-api:latest
```

---

## Initial Block Set Recommendation

The first Docker Compose feature should start with a deliberately small block set.

### Core blocks

1. **Docker Compose**
2. **Service**
3. **Image**
4. **Port Mapping**
5. **Environment Variable**
6. **Volume Mount**
7. **Depends On**

These blocks are enough to visually model useful multi-container examples while keeping the first implementation manageable.

---

## Possible Future Extensions

The following Compose concepts are useful but should not be required for the initial block set.

### High-value future candidates

- `build`
- `command`
- `restart`
- `networks`
- named `volumes`
- `healthcheck`
- `configs`
- `secrets`

### More advanced candidates

- `entrypoint`
- `profiles`
- `deploy`
- resource limits
- custom DNS configuration
- logging configuration
- container capabilities
- device mappings
- advanced port syntax
- advanced volume syntax

Trying to model the entire Compose specification immediately would significantly increase both Blockly complexity and YAML-generation complexity.

---

## Top-Level Concepts for Future Consideration

In addition to `services`, Docker Compose supports reusable application-level resources.

A possible expanded hierarchy could eventually become:

```text
Docker Compose
│
├── Services
│    └── Service
│         ├── Image
│         ├── Ports
│         ├── Environment
│         ├── Volumes
│         ├── Networks
│         └── Depends On
│
├── Volumes
├── Networks
├── Configs
└── Secrets
```

These concepts should be added only when required by future stories.

---

## Design Considerations for Blockly

### Parent-child relationships

Some blocks only make sense inside a service.

For example:

```text
Image
Port Mapping
Environment Variable
Volume Mount
Depends On
```

should normally be children of a Service block.

This provides a natural structural constraint and can prevent invalid visual configurations.

### Repeating properties

Properties such as:

- ports,
- environment variables,
- volumes,
- dependencies

can occur multiple times.

The block design should therefore allow multiple child blocks of these types.

### Unique properties

Some properties, such as `image`, normally represent one service-level value.

A future validator could detect duplicate Image blocks inside the same service.

### References between blocks

`depends_on` is different from simple values because it refers to another service.

A future implementation could use service-aware dropdowns or reference validation to ensure the target service exists.

### YAML generation

The visual representation does not need to copy YAML syntax exactly.

For example:

```yaml
ports:
  - "8080:80"
```

can be represented more clearly as:

```text
Host Port      8080
Container Port 80
```

The generator can later transform the structured visual values into valid YAML.

This is one of the main advantages of using Blockly.

---

## Recommended Initial Scope

For the first Docker Compose implementation, support:

```text
Docker Compose
└── Service
     ├── Image
     ├── Port Mapping
     ├── Environment Variable
     ├── Volume Mount
     └── Depends On
```

Do not initially attempt full support for:

- advanced networking,
- configs,
- secrets,
- deployment configuration,
- resource constraints,
- every short/long Compose syntax variation.

This keeps the first Docker feature small enough to implement and validate incrementally.

---

## Conclusion

Docker Compose maps naturally to hierarchical visual blocks because the Compose model itself is structured around services and nested service configuration.

The recommended starting hierarchy is:

```text
Docker Compose
     │
     └── Service
          ├── Image
          ├── Ports
          ├── Environment
          ├── Volumes
          └── Depends On
```

This provides a useful minimum feature set while leaving room to introduce more advanced Compose concepts later.

The next implementation stories can use this mapping to decide:

- Blockly block definitions,
- connection rules between blocks,
- Docker Compose YAML generation,
- validation rules,
- YAML-to-block conversion.

---

## References

Research is based primarily on the current Docker Compose documentation:

- Docker Compose file reference — Services: https://docs.docker.com/reference/compose-file/services/
- Docker Compose application model: https://docs.docker.com/compose/intro/compose-application-model/
- Docker Compose volumes: https://docs.docker.com/reference/compose-file/volumes/
- Docker Compose networks: https://docs.docker.com/reference/compose-file/networks/
- Docker Compose configs: https://docs.docker.com/reference/compose-file/configs/
- Docker Compose secrets: https://docs.docker.com/reference/compose-file/secrets/

---

## S1-11 Deliverable Summary

**Story:** S1-11 — Research Docker Compose/YAML requirements

**Result:** The initial Docker Compose visual language should focus on a root Compose structure containing services, with service-level blocks for image, port mappings, environment variables, volume mounts, and service dependencies.

**Recommended initial blocks:**

```text
Docker Compose
Service
Image
Port Mapping
Environment Variable
Volume Mount
Depends On
```

Advanced Compose concepts should remain future extensions rather than part of the first Docker block implementation.
