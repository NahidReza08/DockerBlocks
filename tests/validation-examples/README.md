# DSL Validation Examples

This directory contains reusable DSL validation fixtures for testing and demonstrating validation behavior.

The examples currently serve as test data. Automated execution of these fixtures can be added in later testing tasks.

## Test Cases

| ID | File | Problem | Expected Result |
| --- | --- | --- | --- |
| V01 | `V01-missing-required-property.dsl` | Missing required member role | Error |
| V02 | `V02-invalid-property-value.dsl` | Unsupported member role (`architect`) | Error |
| V03 | `V03-invalid-syntax.dsl` | Project block is not closed | Error |
| V04 | `V04-unexpected-element.dsl` | Unexpected `service` element | Error |
| V05 | `V05-valid-minimal.dsl` | Minimal valid project | Success |
| V06 | `V06-valid-complex.dsl` | Complex project with members, modules, components, tasks, and subtasks | Success |

## Purpose

These fixtures provide a small, repeatable validation test set that can be reused for:

- manual validation testing;
- future automated validation tests;
- regression testing;
- final project demonstrations.

## Expected Behavior

V01-V04 should produce validation errors.

V05-V06 should pass validation successfully.
