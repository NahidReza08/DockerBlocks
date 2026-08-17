import fs from 'node:fs/promises';

import { loadGrammar } from './grammar-loader.js';
import { validateGrammar } from './validator.js';
import { buildIR } from './ir-builder.js';
import { generateBlocksTs, generateGeneratorTs, generateMainTs } from './blockly-ts-target.js';

const filename = process.argv[2];

const validationErrorFile = "blockly_app/src/validation-errors.ts";

async function writeValidationErrors(errors) {
    const contents =
        `export const validationErrors = ${JSON.stringify(errors, null, 2)};\n`;

    await fs.writeFile(validationErrorFile, contents);
}

if (!filename) {
    console.error("Usage:");
    console.error("node generate_blockly/src/parse.js generate_blockly/input/grammar.langium");
    process.exit(1);
}

try {
    // 1. Load + restrict: parse the .langium file and reject constructs
    //    outside the currently supported subset.
    const grammar = await loadGrammar(filename);
    validateGrammar(grammar);

    // 2. Grammar AST -> simple intermediate representation.
    const ir = buildIR(grammar, {
        onWarning: (msg) => console.warn(`Warning: ${msg}`)
    });

    // Successful generation clears any previous validation errors.
    await writeValidationErrors([]);

    // 3. IR -> a drop-in blocks.ts / generator.ts / main.ts trio.
    await fs.writeFile("blockly_app/src/blocks.ts", generateBlocksTs(ir));
    await fs.writeFile("blockly_app/src/generator.ts", generateGeneratorTs(ir));
    await fs.writeFile("blockly_app/src/main.ts", generateMainTs(ir));

    console.log(`Generated ${ir.length} blocks -> blocks.ts, generator.ts, main.ts`);
} catch (error) {
    const validationErrors =
        Array.isArray(error?.validationErrors) && error.validationErrors.length > 0
            ? error.validationErrors
            : [
                {
                    type: 'generation',
                    message: error instanceof Error ? error.message : String(error),
                    severity: 'error'
                }
            ];

    await writeValidationErrors(validationErrors);

    console.error(
        `Generation failed with ${validationErrors.length} validation error(s).`
    );

    for (const validationError of validationErrors) {
        const location =
            validationError.line !== undefined
                ? ` at line ${validationError.line}` +
                  (validationError.column !== undefined
                      ? `, column ${validationError.column}`
                      : '')
                : '';

        console.error(
            `[${validationError.type}] ${validationError.message}${location}`
        );
    }

    process.exitCode = 1;
}