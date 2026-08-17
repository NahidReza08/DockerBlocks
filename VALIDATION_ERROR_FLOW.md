# S1-03 — Validation / Error Flow Trace

## Goal

Trace the exact code path responsible for invalid DSL / grammar errors and identify why those errors currently reach only the terminal instead of the Blockly UI.

---

## 1. Main Generation Flow

The generation process starts in:

`generate_blockly/src/parse.js`

Flow:

```text
grammar.langium
      |
      v
loadGrammar(filename)
      |
      v
validateGrammar(grammar)
      |
      v
buildIR(grammar)
      |
      v
generateBlocklyArtifacts(ir)
      |
      v
blockly_app/src/
```

`parse.js` does not currently wrap `loadGrammar()` or `validateGrammar()` in a try/catch.

---

## 2. Where Is the Validation Error Created?

The main project-specific validation error is created in:

`generate_blockly/src/validator.js`

The validator walks the Langium grammar AST and collects unsupported constructs in an `errors` array.

For example, introducing:

```langium
Address:
    'address' city=[Contact];
```

causes the validator to detect an unsupported `CrossReference`.

When at least one unsupported construct exists, the validator throws:

```js
throw new Error(
    "Grammar uses unsupported constructs:\n" +
    errors.map(e => ` - ${e}`).join("\n")
);
```

Observed runtime error:

```text
Error: Grammar uses unsupported constructs:
 - rule "Address": unsupported node type "CrossReference"
```

Therefore:

```text
Unsupported AST node
      |
      v
errors.push(...)
      |
      v
new Error(...)
      |
      v
throw
```

---

## 3. How Is the Error Represented?

The validator error is represented as a standard JavaScript `Error` object.

Its important information is currently stored mainly in:

```text
error.message
```

Example:

```text
Grammar uses unsupported constructs:
 - rule "Address": unsupported node type "CrossReference"
```

It is not currently represented as a structured validation result such as:

```js
{
    type: "...",
    rule: "...",
    message: "...",
    severity: "error"
}
```

The structured information is converted into one message string before the error is thrown.

---

## 4. Where Is the Error Currently Caught?

It is not caught by project code.

The flow is:

```text
validator.js
    |
    | throw Error
    v
parse.js
    |
    | no try/catch
    v
Node.js runtime
```

Observed stack trace:

```text
at validateGrammar (.../generate_blockly/src/validator.js:54:15)
at .../generate_blockly/src/parse.js:19:1
```

Because the exception reaches the top level of the Node process, Node prints the uncaught exception and stack trace to the terminal.

---

## 5. Why Does It Only Reach the Console / Terminal?

The validation and generation process runs on the Node.js side.

The Blockly application runs separately in the browser.

Current architecture:

```text
GENERATION / NODE SIDE

grammar.langium
      |
      v
loadGrammar()
      |
      v
validateGrammar()
      |
      v
throw Error
      |
      v
Node terminal


        NO ERROR HANDOFF
               X


BLOCKLY / BROWSER SIDE

Blockly workspace
      |
      v
generator.workspaceToCode()
      |
      v
try/catch
      |
      v
#errorOutput
```

There is currently no bridge that transfers a validation error produced during grammar processing into the Blockly browser application.

---

## 6. Existing Blockly Error Display

The Blockly application already has a browser-side error display path.

`blockly_app/src/main.ts` catches errors produced during Blockly code generation around:

```text
generator.workspaceToCode(workspace)
```

and sends the resulting message to the UI error output.

Therefore the UI already has an error-display destination.

The missing piece is getting grammar-validation errors from the Node generation side into that browser-side mechanism.

---

## 7. How Can Blockly Receive the Error?

The best integration boundary is around the call to:

```text
validateGrammar(grammar)
```

in `generate_blockly/src/parse.js`.

Instead of allowing the exception to terminate the process without an application-level handoff, this layer can eventually:

1. catch the validation failure,
2. preserve the useful validation message or structured error information,
3. expose that information to the Blockly application,
4. let Blockly display it using its existing error-output UI.

The exact transport mechanism is an implementation decision for a later story.

S1-03 only identifies the boundary:

```text
validator.js
      |
      v
validation result / Error
      |
      v
parse.js        <-- integration / handoff point
      |
      v
Blockly application
      |
      v
#errorOutput
```

---

## 8. Additional Finding — Parser Errors Are Currently Missed

During S1-03, a malformed grammar was tested:

```langium
grammar

hidden terminal WS: /\s+/;
```

Langium reported:

```text
parserErrors: 1
"Expecting token of type 'ID' but found `hidden`."
```

However:

```text
document.diagnostics: undefined
```

The current `grammar-loader.js` checks `document.diagnostics` to decide whether to throw:

```js
if ((document.diagnostics ?? []).length) {
    throw new Error("Grammar contains errors.");
}
```

Because diagnostics were undefined in the test, the malformed grammar was not rejected and generation continued.

Therefore there are currently two distinct validation concerns:

```text
A. Langium parser error
   parseResult.parserErrors
          |
          X currently not propagated

B. Project-specific validator error
   validateGrammar()
          |
          v
   throw Error
          |
          v
   Node terminal
```

This parser-error behavior should be addressed separately when validation handling is implemented.

---

## 9. Confirmed Error Path

For an unsupported but parseable grammar construct:

```text
generate_blockly/input/grammar.langium
                |
                v
generate_blockly/src/parse.js
                |
                v
loadGrammar(filename)
                |
                v
Langium Grammar AST
                |
                v
validateGrammar(grammar)
generate_blockly/src/validator.js
                |
                v
Unsupported AST node detected
                |
                v
errors[]
                |
                v
throw new Error(...)
                |
                v
parse.js — no catch
                |
                v
Node.js uncaught exception
                |
                v
Terminal output
```

## Conclusion

S1-03 confirms that the project-specific invalid DSL error originates in `generate_blockly/src/validator.js`.

It is represented as a JavaScript `Error`, propagates through `parse.js` without being caught, and is finally printed by Node.js as an uncaught exception.

Blockly already has an error-display UI, but there is currently no connection between Node-side grammar validation and the browser-side Blockly error handler.

The natural handoff point for a future implementation is the generation entry layer in `parse.js`, around `loadGrammar()` / `validateGrammar()`.
