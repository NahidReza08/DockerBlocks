# Docker Compose Examples

This directory contains reusable Docker Compose examples for testing and demonstrating Docker block behavior.

The examples currently serve as fixture data. Automated regression tests can reuse these examples in later tasks.

## Examples

| ID | File | Scenario | Expected Result |
|---|---|---|---|
| D01 | `D01-valid-minimal.yaml` | Minimal service with name and image | Valid |
| D02 | `D02-invalid-missing-name.txt` | Service name is missing | Validation error |
| D03 | `D03-invalid-missing-image.txt` | Service image is missing | Validation error |

## Purpose

These fixtures can be reused for:

- manual testing;
- future automated regression tests;
- demonstrations;
- documentation.

## Expected Behavior

D01 represents valid Docker Compose output.

D02 and D03 represent invalid Docker service configurations that should be rejected by validation.
