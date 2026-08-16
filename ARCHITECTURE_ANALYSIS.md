# S1-02 — Current Architecture Analysis

## Objective

Understand the existing Grammar-to-Blockly architecture and identify which components are responsible for:

- grammar parsing,
- grammar validation,
- internal representation,
- Blockly block creation,
- Blockly workspace initialization,
- DSL generation,
- runtime error display.

---

## 1. High-Level Architecture

The current generation pipeline is:

```text
Langium Grammar (.langium)
        |
        v
grammar-loader.js
        |
        | Langium Grammar AST
        v
validator.js
        |
        v
ir-builder.js
        |
        | RuleIR[]
        v
blockly-ts-target.js
        |
        +--------------------+
        |                    |
        v                    v
    blocks.ts           generator.ts
        |                    |
        +---------+----------+
                  |
                  v
               main.ts
                  |
                  v
          Blockly Workspace
                  |
                  v
       generator.workspaceToCode()
                  |
                  v
            Generated DSL
```

The CLI entry point that orchestrates the generation pipeline is:

```text
generate_blockly/src/parse.js
```

---

## 2. Grammar Input

### `generate_blockly/input/grammar.langium`

This is the input Langium grammar used by the generator.

The currently checked-in grammar is an `AddressBook` grammar containing:

- `AddressBook`
- `Contact`
- `Phone`
- `Address`

Terminal rules such as `ID`, `INT`, and `WS` are used by parser rules but are not converted into Blockly blocks themselves.

---

## 3. Grammar Loading and Parsing

### `generate_blockly/src/grammar-loader.js`

Responsibility:

- reads the `.langium` grammar file,
- creates Langium grammar services,
- creates and builds a Langium document,
- checks Langium diagnostics,
- returns the parsed Langium Grammar AST.

Main function:

```text
loadGrammar(filename)
```

Output:

```text
Langium Grammar AST
```

If Langium reports diagnostics for the grammar, this component throws an error.

---

## 4. Grammar Validation

### `generate_blockly/src/validator.js`

Responsibility:

Validates whether the parsed grammar uses only the subset of Langium constructs currently supported by the Grammar-to-Blockly generator.

Currently supported node types include:

- `ParserRule`
- `Group`
- `Alternatives`
- `Assignment`
- `Keyword`
- `RuleCall`

Supported cardinalities are:

- no cardinality
- `?`
- `*`
- `+`

This validation concerns the structure of the input grammar.

It does **not** validate DSL text generated from the Blockly workspace.

---

## 5. AST Utilities

### `generate_blockly/src/ast-utils.js`

Responsibility:

Provides reusable helper functions for identifying Langium AST node types, including:

- `isParserRule`
- `isTerminalRule`
- `isKeyword`
- `isAssignment`
- `isGroup`
- `isAlternatives`
- `isRuleCall`
- `getCardinality`

It is primarily used by the validator and IR builder.

It also contains helpers for future constructs such as:

- `CrossReference`
- `UnorderedGroup`
- `Action`

These constructs are not currently supported by the full generation pipeline.

---

## 6. Internal Representation

### `generate_blockly/src/ir-builder.js`

Responsibility:

Transforms the Langium-specific Grammar AST into a simpler Blockly-oriented Intermediate Representation (IR).

Main function:

```text
buildIR(grammar)
```

The primary representation is:

```text
RuleIR
  name
  entry
  parts[]
```

A rule can contain IR parts of the following kinds:

```text
keyword
field
dropdown
value
statement
```

Important mappings include:

```text
feature=ID
    -> text field

feature=INT
    -> number field

feature=('a' | 'b')
    -> dropdown

feature=SomeRule
    -> value input

feature+=SomeRule
    -> statement input

(a+=A | b+=B)*
    -> shared statement input
```

This layer separates Langium AST details from Blockly generation details.

The IR builder may also emit warnings when a grammar construct must be simplified.

---

## 7. Blockly JSON Helper

### `generate_blockly/src/block-json-generator.js`

Responsibility:

Provides builders that map IR part types to Blockly JSON arguments.

Examples:

```text
field
    -> field_input / field_number

dropdown
    -> field_dropdown

value
    -> input_value

statement
    -> input_statement
```

It also exposes a standalone `generateBlockJson()` function.

However, `generateBlockJson()` is **not** part of the main CLI generation path.

The main pipeline only reuses its `argBuilders` registry through `blockly-ts-target.js`.

---

## 8. TypeScript Target Generation

### `generate_blockly/src/blockly-ts-target.js`

Responsibility:

Transforms the IR into the TypeScript files consumed by the Blockly application.

It generates:

```text
blockly_app/src/blocks.ts
blockly_app/src/generator.ts
blockly_app/src/main.ts
```

Important functions:

```text
generateBlocksTs()
generateGeneratorTs()
generateMainTs()
```

It also determines Blockly connection types using logic such as:

```text
input_value.check
input_statement.check
output
previousStatement
nextStatement
```

Therefore, part of the structural validation of block connections originates in this component.

---

## 9. CLI / Pipeline Orchestrator

### `generate_blockly/src/parse.js`

Responsibility:

Coordinates the complete generation process.

The actual sequence is:

```text
loadGrammar()
    |
validateGrammar()
    |
buildIR()
    |
generateBlocksTs()
generateGeneratorTs()
generateMainTs()
    |
write generated files to blockly_app/src/
```

The command format is:

```text
node generate_blockly/src/parse.js <grammar-file>
```

This is the primary entry point for Grammar-to-Blockly generation.

---

## 10. Generated Blockly Block Definitions

### `blockly_app/src/blocks.ts`

Responsibility:

Registers Blockly block definitions using:

```text
Blockly.defineBlocksWithJsonArray(...)
```

The file defines:

- fields,
- dropdowns,
- statement inputs,
- value inputs,
- connection constraints,
- block colours.

**Important:** This is a generated file.

It is overwritten when `parse.js` runs, so architectural changes to block generation should normally be made in the generation pipeline rather than directly in `blocks.ts`.

---

## 11. Generated DSL Generator

### `blockly_app/src/generator.ts`

Responsibility:

Defines Blockly `forBlock` generator functions.

The generator converts blocks in the Blockly workspace back into textual DSL syntax.

Main pattern:

```text
Blockly Block
    |
generator.forBlock[...]
    |
    v
DSL fragment
```

The complete workspace is converted using:

```text
generator.workspaceToCode(workspace)
```

The generated output is the DSL's own textual syntax, not JavaScript.

The project currently uses Blockly's JavaScript generator infrastructure as the underlying generation mechanism.

This file is also generated by `blockly-ts-target.js`.

---

## 12. Blockly Workspace Initialization

### `blockly_app/src/main.ts`

Responsibility:

- calls `defineBlocks()`,
- creates the Blockly workspace using `Blockly.inject()`,
- configures the toolbox,
- finds the code/error output elements,
- listens for workspace changes,
- calls `generator.workspaceToCode(workspace)`,
- displays generated DSL,
- catches generation exceptions and displays their messages.

Runtime flow:

```text
Blockly Workspace change
        |
        v
generateCode()
        |
        v
generator.workspaceToCode(workspace)
        |
        +------ success ------> #codeOutput
        |
        +------ exception ----> #errorOutput
```

This file is generated by `blockly-ts-target.js`.

---

## 13. Browser Application Entry

### `blockly_app/index.html`

Responsibility:

Provides the browser UI containers:

```text
#blocklyDiv
    -> Blockly workspace

#codeOutput
    -> generated DSL

#errorOutput
    -> error messages
```

It loads:

```text
./src/main.ts
```

Vite is configured with `blockly_app` as the application root.

---

## 14. Current Validation Architecture

There are currently multiple distinct forms of validation.

### A. Langium grammar validation

Handled by:

```text
grammar-loader.js
```

Langium diagnostics detect problems in the input grammar itself.

### B. Supported-subset validation

Handled by:

```text
validator.js
```

It checks whether the grammar contains constructs supported by the current Grammar-to-Blockly pipeline.

### C. Blockly structural constraints

Generated primarily by:

```text
blockly-ts-target.js
```

and represented in generated `blocks.ts` using connection types such as:

```text
check
output
previousStatement
nextStatement
```

These prevent some structurally incompatible blocks from being connected.

### D. Runtime error display

Handled by generated:

```text
main.ts
```

`workspaceToCode()` runs inside a `try/catch`, and exceptions are displayed in:

```text
#errorOutput
```

However, the repository currently contains **no runtime step** that takes the generated DSL text and reparses or semantically validates it using Langium.

Therefore:

```text
Blockly
   |
   v
Generated DSL
   |
   X  No Langium runtime validation currently exists
```

The existing error panel is capable of displaying errors, but it is not currently connected to a DSL parser/validator.

---

## 15. Important Architecture Rule for Future Features

The files:

```text
blockly_app/src/blocks.ts
blockly_app/src/generator.ts
blockly_app/src/main.ts
```

are generated artifacts.

Therefore, features that must survive grammar regeneration should generally be implemented in the generator/source architecture, especially:

```text
generate_blockly/src/blockly-ts-target.js
```

or in a new reusable runtime component that generated `main.ts` imports.

Directly modifying generated TypeScript files risks losing those changes the next time `parse.js` runs.

---

## 16. Repository Consistency Findings

Two documentation/state inconsistencies were identified during S1-02.

### Current grammar vs generated TypeScript

The checked-in grammar currently describes:

```text
AddressBook
Contact
Phone
Address
```

but the checked-in generated TypeScript files currently define blocks such as:

```text
project
metadata
member
module
component
task
subtask
```

Therefore, the currently committed generated files do not appear to correspond to the currently committed `grammar.langium`.

Running `parse.js` with the current grammar would overwrite these generated files.

### README mismatch

The README states that the checked-in generated TypeScript corresponds to the bundled AddressBook grammar, but the actual checked-in TypeScript currently contains the project/task language instead.

The README also references `generate_blockly/src/code-generator.js`, but this file was not present in the current `generate_blockly/src` directory listing.

These are documentation/repository consistency findings and are not changed as part of S1-02.

---

## 17. Component Responsibility Summary

| Responsibility | Component |
|---|---|
| CLI orchestration | `generate_blockly/src/parse.js` |
| Read/parse Langium grammar | `generate_blockly/src/grammar-loader.js` |
| Langium grammar diagnostics | `grammar-loader.js` / Langium |
| Supported grammar subset validation | `generate_blockly/src/validator.js` |
| AST helper utilities | `generate_blockly/src/ast-utils.js` |
| Grammar AST -> Internal Representation | `generate_blockly/src/ir-builder.js` |
| IR -> Blockly argument helpers | `generate_blockly/src/block-json-generator.js` |
| IR -> generated TypeScript | `generate_blockly/src/blockly-ts-target.js` |
| Blockly block definitions | generated `blockly_app/src/blocks.ts` |
| Blockly -> DSL generation | generated `blockly_app/src/generator.ts` |
| Blockly workspace initialization | generated `blockly_app/src/main.ts` |
| Browser containers/UI | `blockly_app/index.html` |
| Generated DSL runtime validation | Not currently implemented |

---

## 18. Final Architecture Map

```text
Grammar
  |
  | grammar.langium
  v
Parser / Grammar Loader
  |
  | grammar-loader.js
  | Langium Grammar AST
  v
Grammar Validation
  |
  | validator.js
  v
Internal Representation
  |
  | ir-builder.js
  | RuleIR[]
  v
Blockly Target Generator
  |
  | blockly-ts-target.js
  v
Generated Blockly Application
  |
  +--> blocks.ts
  |
  +--> generator.ts
  |
  +--> main.ts
          |
          v
     Blockly Workspace
          |
          v
     Generated DSL
```

---

## Definition of Done Check

S1-02 identified the components responsible for:

- [x] Grammar parsing
- [x] Grammar validation
- [x] Internal Representation construction
- [x] Blockly block creation
- [x] Blockly workspace initialization
- [x] DSL generation
- [x] Runtime error display
- [x] Current validation boundary
- [x] Generated-file ownership
- [x] Relevant repository/documentation inconsistencies

S1-02 therefore provides the architectural baseline needed to decide where upcoming features should be implemented.
