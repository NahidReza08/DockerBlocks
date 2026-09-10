# Initial Docker Compose Block Model

## Goal

Define the smallest useful Docker Compose block model that can be implemented as the first vertical slice in Sprint 2.

This task is design-only. It does not implement Blockly blocks, YAML generation, or Docker Compose validation.

## Selected Vertical Slice

The initial model contains two block types:

```text
Docker Compose
\-- Service
    +-- Name
    \-- Image
```

For the initial implementation:

- `Docker Compose` is the root block.
- `Service` is contained inside the Docker Compose block.
- `Name` is a text field on the Service block.
- `Image` is a text field on the Service block.

Conceptually:

```text
Docker Compose
\-- Service
    Name:  [frontend]
    Image: [nginx]
```

## Target Docker Compose YAML

The example block structure above should eventually generate:

```yaml
services:
  frontend:
    image: nginx
```

## Block Responsibilities

### Docker Compose Block

The Docker Compose block represents the root of a Compose configuration.

Its initial responsibility is only to contain Service blocks.

### Service Block

The Service block represents one Docker Compose service.

For the first vertical slice it contains only:

- service name
- Docker image

Example values:

```text
Name: frontend
Image: nginx
```

## Initial Structural Relationship

    Compose
    \-- Service (one or more)
        +-- Name  [text field]
        \-- Image [text field]

The model should allow one or more Service blocks inside a Docker Compose block. The first Sprint 2 implementation can begin with a single-service example.

For this first vertical slice, `services:` does not require a separate Blockly block. It is represented structurally by the Docker Compose block containing Service blocks.

`Name` and `Image` are intentionally modeled as fields rather than separate blocks to keep the first implementation small. More complex service properties can be introduced as dedicated blocks later.

## Explicitly Out of Scope

The first vertical slice does not include:

- ports
- environment variables
- volumes
- depends_on
- networks
- build
- commands
- health checks
- secrets
- configs
- deployment configuration
- complete Docker Compose support
- YAML parsing
- YAML validation

These features can be introduced incrementally after the basic Compose -> Service -> Name/Image flow works.

## Sprint 2 Starting Example

The first implementation should be able to visually represent:

```text
Docker Compose
\-- Service
    Name: frontend
    Image: nginx
```

with the eventual YAML result:

```yaml
services:
  frontend:
    image: nginx
```

This provides a minimal end-to-end starting point without attempting to model the complete Docker Compose language.
