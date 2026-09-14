# langium-to-blockly

Turns a [Langium](https://langium.org/) grammar (`.langium` file) into a working
[Blockly](https://developers.google.com/blockly) block editor: block definitions,
a code generator that emits DSL text (or Docker Compose YAML), and a
minimal Vite/TypeScript app that wires them into a browser UI with a live
"code output" panel.

The pipeline only understands a **restricted subset** of Langium grammars
(see [Supported grammar subset](#supported-grammar-subset-and-limitations)
below). Point it at a grammar file, it validates the grammar against that
subset, converts it to a small intermediate representation (IR), and emits
three TypeScript files that plug directly into `blockly_app/`.

```
.langium grammar
      │
      ▼
 grammar-loader.js   (parse with Langium's own grammar services)
      │
      ▼
 validator.js         (reject anything outside the supported subset)
      │
      ▼
 ir-builder.js         (AST -> RuleIR[])
      │
      ▼
 blockly-ts-target.js  (RuleIR[] -> blocks.ts / generator.ts / main.ts)
      │
      ▼
 blockly_app/src/*.ts  (consumed by the Vite app in the browser)
```

---

## Quick start

For the checked-in DockerBlocks editor, run `npm.cmd install` and
`npm.cmd run dev` from the repository root (use `npm` instead of `npm.cmd`
outside Windows). Open the printed local URL and build a configuration from
the Docker toolbox. The output panel updates with Compose YAML.
Start with the [D04 multi-service demo](tests/docker-compose-examples/README.md#multi-service-demo-d04).

The following commands demonstrate generating an editor for a different grammar
and overwrite the checked-in Docker editor:

```bash
npm install

# Generate blocks.ts / generator.ts / main.ts from a grammar
node generate_blockly/src/parse.js generate_blockly/input/grammar.langium

# Launch the Blockly editor for the grammar you just generated
npm run dev
```

Open the printed local URL; you'll see a Blockly workspace pre-loaded with a
toolbox containing one block per parser rule in the grammar, plus a live
"code output" panel that re-renders the DSL source text as you drag blocks
around.

To point the app at a different grammar, just re-run the `parse.js` command
with a new `.langium` file — it overwrites `blockly_app/src/blocks.ts`,
`generator.ts`, and `main.ts` in place.

> The top-level `README.md` in this repo (before this rewrite) only showed
> the one-line invocation:
> `node generate_blockly/src/parse.js generate_blockly/input/robot.langium`
> — that's the same command shown above, just against a different example
> grammar file (`robot.langium`, not included in this listing).

---

## Supported Docker Compose subset

DockerBlocks supports a Compose root containing multiple Service blocks and
emits a YAML `services:` mapping. The text grammar requires at least one service.

| Block | Supported fields and validation |
|---|---|
| Service | Required, nonblank name and image; zero or more Port, Environment, and Volume blocks. |
| Port | Required host and container ports, each an integer in `1..65535`; emitted as a quoted `HOST:CONTAINER` mapping. |
| Environment | A `KEY=VALUE` entry, entered in separate Blockly fields. Keys must match `[A-Za-z_][A-Za-z0-9_]*`: ASCII letter or underscore first, then letters, digits, or underscores. YAML uses `KEY: VALUE` mapping entries. |
| Volume | Required, nonblank source and target; quoted `SOURCE:TARGET` short syntax only. |

Blockly connection rules restrict Compose's service stack to Service blocks,
and each Service's ports, environment, and volumes stacks to matching block types.
Validation messages appear in the error panel and as warnings on the affected
blocks; warnings do not prevent YAML generation.

Empty environment values are allowed by Blockly validation and currently emit
`KEY:` with no value, not an explicitly quoted empty string. The text DSL instead
requires an `ID` or `INT` value. Digit-only values are quoted in YAML; other values
are emitted as entered, so arbitrary YAML-sensitive strings are not generally escaped.

The [text grammar](generate_blockly/input/docker-compose.langium) orders each
service's image, ports, environment entries, then volumes. It uses
`port HOST -> CONTAINER`, `environment KEY = VALUE`, and
`volume "SOURCE" -> "TARGET"`. Service names and images use its restricted
`ID` token (including simple tags such as `node:20`), not the full Docker
image-reference syntax. Blockly name/image validation only checks nonblank fields.

Unsupported features include `depends_on`, `networks`, top-level named volume
declarations, long volume syntax, `secrets`, `env_file`, `build`, commands, and
health checks. Volume validation checks only nonblank fields; it does not verify
paths or implement mount options.

## Run and verify

These commands exist in [package.json](package.json). Run from the repository
root after installing dependencies (use `npm` instead of `npm.cmd` outside Windows):

```powershell
npm.cmd run dev                     # Vite development server
npm.cmd test                        # All five regression/integration suites
npm.cmd run test:yaml-generation    # YAML generation, including D04
npm.cmd run test:docker-regression  # Docker regression coverage
npm.cmd run build                   # TypeScript check and Vite production build
npm.cmd run preview                 # Preview the production build
```

The full test command covers grammar validation, block connections, YAML
generation, Docker regression, and Docker validation UI integration.
The build writes to `blockly_app/dist`.

---

## Repository layout

```
generate_blockly/
  input/
    grammar.langium       example grammar (AddressBook) used above
  src/
    parse.js               CLI entry point / pipeline orchestrator
    grammar-loader.js       Step 1: parse .langium text -> Langium AST
    validator.js             Step 2: reject unsupported grammar constructs
    ast-utils.js               $type predicate helpers used throughout
    ir-builder.js            Step 3: Langium AST -> RuleIR[] (the IR)
    blockly-ts-target.js      Step 4: RuleIR[] -> blocks.ts/generator.ts/main.ts
    block-json-generator.js  standalone/legacy: RuleIR[] -> plain Blockly JSON
    code-generator.js        standalone/legacy: RuleIR[] -> forBlock JS source

blockly_app/
  index.html               page hosting the Blockly workspace + code/error panels
  src/
    main.ts                 generated: workspace + toolbox + change listener
    blocks.ts                generated: Blockly.defineBlocksWithJsonArray(...)
    generator.ts              generated: generator.forBlock[...] functions

package.json / package-lock.json  npm project + dependency lockfile (blockly, langium, vite, TS)
tsconfig.json                     TS config, scoped to blockly_app/src
vite.config.ts                    Vite root = blockly_app/
.gitignore                        ignores node_modules
```

---

## The generation pipeline, file by file

### `generate_blockly/src/parse.js` — CLI entry point

Run as:

```bash
node generate_blockly/src/parse.js <path-to-grammar.langium>
```

It does exactly four things, matching the diagram above:

1. `loadGrammar(filename)` — parse the grammar file into a Langium AST.
2. `validateGrammar(grammar)` — throw if the grammar uses anything outside
   the supported subset.
3. `buildIR(grammar, { onWarning })` — build the intermediate representation,
   logging any simplifications made along the way (e.g. `console.warn`).
4. Write `generateBlocksTs(ir)`, `generateGeneratorTs(ir)`, and
   `generateMainTs(ir)` to `blockly_app/src/blocks.ts`, `generator.ts`, and
   `main.ts` respectively, then print how many blocks were generated.

If no filename is given, it prints usage and exits with status 1.

### `generate_blockly/src/grammar-loader.js` — parsing `.langium` text

`loadGrammar(filename)` spins up Langium's own grammar language services
(`createLangiumGrammarServices(EmptyFileSystem)`), reads the file, builds a
`LangiumDocument` from its text, and asks the `DocumentBuilder` to fully
build/validate it. If the document has any diagnostics (syntax or semantic
errors in the grammar itself), it throws `"Grammar contains errors."`.
Otherwise it returns `document.parseResult.value` — the parsed `Grammar` AST
node, with `.rules` being the list of parser/terminal rules.

### `generate_blockly/src/ast-utils.js` — AST type predicates

Small `$type`-checking helpers (`isParserRule`, `isTerminalRule`,
`isKeyword`, `isAssignment`, `isGroup`, `isAlternatives`, `isRuleCall`,
`isAction`, plus `getCardinality(node)` for reading a node's `?`/`*`/`+`
repetition marker) used by the validator and IR builder so nobody has to
compare `.$type` string literals by hand. Also declares (but doesn't yet
use) `isUnorderedGroup` and `isCrossReference`, left as forward-compatibility
hooks for when those Langium constructs get support added.

### `generate_blockly/src/validator.js` — enforcing the supported subset

`validateGrammar(grammar, options?)` walks every **parser rule's**
definition tree (terminal rules are skipped) and collects — rather than
throws on the first — every construct that falls outside:

- `DEFAULT_ALLOWED_TYPES`: `Grammar`, `ParserRule`, `Group`, `Alternatives`,
  `Assignment`, `Keyword`, `RuleCall`.
- `DEFAULT_ALLOWED_CARDINALITIES`: no cardinality at all, `?`, `*`, `+`.

If it finds unsupported node types or cardinalities anywhere in a rule, it
throws one `Error` whose message lists every problem found, each tagged with
the rule it came from (so you get a full report instead of playing whack-a-mole).
On success it returns `true`.

You can override which types/cardinalities are allowed via
`options.allowedTypes` / `options.allowedCardinalities` if you extend the
rest of the pipeline to support more constructs (the file's docstring
specifically calls out `UnorderedGroup` and `CrossReference` as the likely
next additions).

### `generate_blockly/src/ir-builder.js` — grammar AST → IR

This is the heart of the "what does this grammar rule *mean* as a UI
input" logic. `buildIR(grammar, { onWarning })` returns an array of:

```ts
RuleIR = {
  name: string,       // parser rule name, e.g. "Contact"
  parts: IRPart[]      // ordered pieces that make up the rule's block
}

IRPart = {
  kind: "keyword" | "field" | "dropdown" | "value" | "statement",
  text?: string,              // literal text, for "keyword"
  feature?: string,            // grammar feature name, for the other kinds
                                //   (see "merged statement parts" below for
                                //   how this is derived when several
                                //   features feed one shared input)
  fieldType?: "text"|"number", // for "field"
  options?: [string,string][], // for "dropdown"
  refRuleName?: string,        // the referenced rule, for "value" parts and
                                //   for the common single-rule "statement"
                                //   case (feature+=Rule); undefined when a
                                //   "statement" part names more than one rule
  refRuleNames?: string[],     // every rule allowed to fill a "statement"
                                //   part - see below
  optional?: boolean,          // cardinality "?"
  repeatable?: boolean         // cardinality "*"/"+" or operator "+="
}
```

Traversal is dispatched through the `nodeHandlers` registry (`Group`,
`Alternatives`, `Keyword`, `Assignment`, `RuleCall`), each appending
`IRPart`s to a per-rule context. The interesting decisions:

- **`Assignment` (`feature=...`)** is where most of the mapping logic lives
  (`handleAssignment`):
  - `feature += X` (a list assignment) always becomes a `"statement"` IR
    part — i.e. a Blockly statement input where the user stacks one block
    per list item. If the repeated element is a plain rule reference, the
    referenced rule name is recorded in **both** `refRuleName` (a single
    string, for convenience) and `refRuleNames` (a one-element array), so
    downstream code can always read `refRuleNames` regardless of which path
    built the part — see the next bullet.
  - `feature=ID` / `feature=INT` become `"field"` IR parts (`field_input` /
    `field_number` in Blockly terms).
  - `feature=SomeOtherRule` becomes a `"value"` IR part (a plug-in
    `input_value` socket) tagged with `refRuleName`.
  - `feature=(A | B | C)` where all alternatives are keywords becomes a
    `"dropdown"` IR part with one `[label, value]` option per keyword.
  - Anything else (mixed alternatives, nested groups, etc.) falls back to a
    generic `"value"` part.
- **Bare `Alternatives`** (no `feature=` in front of the whole group) is
  checked against three shapes, in order:
  1. *All branches are keywords* (`'a' | 'b' | 'c'`) → one anonymous
     `"dropdown"` part (feature name auto-generated as `anon0`, `anon1`,
     ...), one option per keyword.
  2. *All branches are list assignments to different features*
     (`phones+=Phone | addresses+=Address`) → **merged statement parts**.
     This is the case the bundled `AddressBook` grammar uses
     (`(phones+=Phone | addresses+=Address)*`). Since the DSL only cares
     about the interleaved *order* entries appear in, not which grammar
     feature they were assigned to, all branches collapse into **one**
     shared Blockly statement input instead of one input per feature.
     Its `feature` is every branch's feature name joined with `_`
     (`"phones_addresses"`), and its `refRuleNames` lists every rule that
     can drop into that slot (`["Phone", "Address"]`). Downstream, this is
     what lets `Phone` and `Address` blocks stack directly above/below each
     other in the same input — see
     [`blockly-ts-target.js`](#generate_blockly-src-blockly-ts-target-js--ir--the-actual-output-files)
     below for how that shared "check" type is computed.
  3. *Anything else* (keywords mixed with rule calls, nested groups, etc.)
     isn't representable as a single Blockly input yet. The IR builder
     falls back to visiting **only the first branch**, so the pipeline
     still produces something, and pushes a warning so the simplification
     is visible instead of silent.
- **Bare `RuleCall`** (no assignment) becomes an anonymous `"value"` part —
  kept mostly for forward compatibility, since the restricted subset
  doesn't commonly produce these.
- Any node type with no registered handler pushes a warning and is skipped
  rather than crashing the whole build.

Warnings collected during the walk are all passed to `options.onWarning`
(if provided) once IR building finishes — `parse.js` wires this to
`console.warn`.

### `generate_blockly/src/blockly-ts-target.js` — IR → the actual output files

This is the module `parse.js` actually calls to produce output (the other
two generator modules below are **not** wired into the CLI — see the note
at the end of this section). It exports three functions:

- **`generateBlocksTs(irRules)`** → contents of `blocks.ts`. Converts each
  rule's `parts` into a Blockly JSON block definition (`message0` built by
  concatenating keyword text and `%N` placeholders, `args0` built via the
  shared `argBuilders` from `block-json-generator.js`, arg names upper-
  snake-cased via `toArgName`). Rules that are the target of some `+=` list
  elsewhere in the grammar (`computeStackTypes`) get
  `previousStatement`/`nextStatement` set to a shared "check" type computed
  from every rule named in that statement part's `refRuleNames` (sorted and
  joined with `_or_`, e.g. `"address_or_phone"` for the AddressBook
  grammar's merged `Phone`/`Address` input); a rule that's the sole target
  of its own `+=` list reduces to just its own lowercase name, so existing
  single-type grammars generate identical output to before this feature
  was added. Rules that aren't a `+=` target at all get `null`/`null`.
- **`generateGeneratorTs(irRules)`** → contents of `generator.ts`. For each
  rule, emits a `generator.forBlock['<ruletype>'] = function (block) {...}`
  that reads each field/value/statement input back out (via
  `block.getFieldValue`, `generator.valueToCode`, or
  `generator.statementToCode`) and concatenates them — keywords included —
  back into the rule's original concrete syntax, trimmed of extra
  whitespace where relevant. Docker-specific templates instead emit Compose
  YAML for Compose, Service, Port, Environment, and Volume blocks. Keep changes
  to generated files consistent with their templates in `blockly-ts-target.js`.
- **`generateMainTs(irRules)`** → contents of `main.ts`. Wires up
  `defineBlocks()`, injects the Blockly workspace into `#blocklyDiv` with a
  category toolbox listing one block per rule, and adds a change listener
  that calls `generator.workspaceToCode(workspace)` on every edit, writing
  the result into `#codeOutput` (or the caught error into `#errorOutput`).

### `generate_blockly/src/block-json-generator.js` — standalone JSON generator (not called by `parse.js`)

Exports `generateBlockJson(irRules)`, which maps each `RuleIR` to a plain
Blockly JSON block definition (`{ type, message0, args0, previousStatement,
nextStatement, colour }`) suitable for
`Blockly.defineBlocksWithJsonArray(...)` directly — feature names are used
as-is (not upper-snake-cased) and every block defaults to
`previousStatement`/`nextStatement: null` regardless of whether it's used
in a `+=` list (this file predates the merged-statement/`refRuleNames`
support described above, so it doesn't compute shared "check" types).
Also exports its `argBuilders` registry, which `blockly-ts-target.js`
actually imports and reuses. Useful if you want Blockly JSON without the
TypeScript/generator/main scaffolding that `blockly-ts-target.js` produces.

### `generate_blockly/src/code-generator.js` — standalone JS forBlock generator (not called by `parse.js`)

Exports `generateCodeGenerators(irRules, { generatorName })`, which emits
plain JavaScript `<generatorName>.forBlock[...] = function (block, generator) {...}`
definitions (default `generatorName: "Blockly.JavaScript"`) using its own
`partTemplates` registry — a JS/CommonJS-flavored counterpart to
`ruleToGeneratorFunction` in `blockly-ts-target.js`, useful if you're
integrating generated blocks into a plain-JS (non-Vite/TS) Blockly setup
instead of the `blockly_app/` scaffold in this repo.

---

## The generated/consumed app: `blockly_app/`

- **`index.html`** — static page with a `#blocklyDiv` workspace container,
  a `#codeOutput` panel (green-on-black, monospace) and `#errorOutput`
  panel (red), plus some unused CSS for an `#evaluator` section (a hook for
  adding a domain-specific "run this DSL" panel by hand later — not wired
  up by anything generated). Loads `./src/main.ts` as a module script.
- **`src/main.ts`**, **`src/blocks.ts`**, **`src/generator.ts`** — these
  three files are **overwritten every time you run `parse.js`**. The checked-in
  copies implement the Docker Compose subset documented above, with a Docker
  toolbox and block-specific validation warnings.

`generator.ts` imports Blockly's `javascriptGenerator` as a vehicle for its
`forBlock`/`statementToCode`/`valueToCode` machinery. Docker blocks emit Compose
YAML; the generic templates reconstruct DSL syntax.

---

## Supported grammar subset and limitations

Only **parser rules** are processed (terminal rules like `ID`/`INT`/`WS`
are recognized by name inside assignments but not independently converted
to blocks). Within a parser rule's definition, the validator currently
allows only:

| Construct | Support |
|---|---|
| `Group` (sequencing) | ✅ |
| `Alternatives` (`\|`) | ✅ (all-keyword → dropdown; all-list-assignment → merged statement input; other mixed alternatives → first branch only, with a warning) |
| `Assignment` (`feature=`, `feature+=`) | ✅ |
| `Keyword` (literal text) | ✅ |
| `RuleCall` (reference to another rule) | ✅ |
| Cardinality `?`, `*`, `+`, none | ✅ |
| `UnorderedGroup` | ❌ not yet — flagged by the validator, hooks exist in `ast-utils.js`/`ir-builder.js` |
| `CrossReference` | ❌ not yet — same |
| `Action` | ❌ not referenced by the validator's allowed-types set |
| Any other cardinality value | ❌ |

Running the validator against a grammar that uses unsupported constructs
throws an `Error` listing every offending location — nothing is generated.

`ID`-typed and `INT`-typed features become Blockly `field_input` /
`field_number` inputs; any other rule reference becomes a plug-in
`input_value` socket; `feature+=X` becomes a stacking `input_statement`
socket, and `X`'s own block gets self-typed `previousStatement`/
`nextStatement` so multiple instances chain together. When several `+=`
branches are merged via alternatives (`(a+=A | b+=B)*`), every named rule
instead gets a shared check type so instances of *any* of them can chain
together in that one input — see "merged statement parts" above.

---

## Extending the pipeline

To support a new Langium construct end-to-end you generally touch three
places:

1. **`validator.js`** — add the new `$type` to `allowedTypes` (or pass a
   custom set) and, if it's a container node, add a `case` in the `walk`
   switch so its children get validated too.
2. **`ir-builder.js`** — add a handler to the `nodeHandlers` registry (or a
   branch inside `handleAssignment`) that appends the right kind of
   `IRPart`.
3. **`blockly-ts-target.js`** (and/or `block-json-generator.js` /
   `code-generator.js` if you use those instead) — if it's a genuinely new
   `IRPart.kind`, add an entry to the relevant `argBuilders`/
   `partTemplates` registry so the JSON/codegen output knows how to render it.

---

## Dependencies

From `package.json`:

- **Runtime**: `blockly` (^12.5.1), `langium` (^4.1.0)
- **Dev**: `typescript` (^6.0.3), `vite` (^8.1.5), `@types/node`

npm scripts:

```bash
npm run dev       # vite dev server for blockly_app/
npm run build      # tsc (type-check blockly_app/src) then vite build
npm run preview     # preview the production build
```

`tsconfig.json` only type-checks `blockly_app/src` — the `generate_blockly/`
CLI pipeline is plain Node.js (ESM, `"type": "module"` in `package.json`)
and isn't type-checked by `tsc`.
