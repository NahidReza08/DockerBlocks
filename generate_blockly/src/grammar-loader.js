import fs from 'node:fs/promises';
import path from 'node:path';

import { EmptyFileSystem, URI } from 'langium';
import { createLangiumGrammarServices } from 'langium/grammar';
import { createValidationError } from './validation-error.js';

export async function loadGrammar(filename) {

    const services = createLangiumGrammarServices(EmptyFileSystem);

    const text = await fs.readFile(filename, 'utf8');

    const uri = URI.file(path.resolve(filename));

    const document =
        services.shared.workspace.LangiumDocumentFactory.fromString(
            text,
            uri
        );

    services.shared.workspace.LangiumDocuments.addDocument(document);

    await services.shared.workspace.DocumentBuilder.build([document]);

    const lexerErrors = (document.parseResult.lexerErrors ?? []).map(error =>
        createValidationError({
            type: 'lexer',
            message: error.message,
            severity: 'error',
            line: error.line,
            column: error.column
        })
    );

    const parserErrors = (document.parseResult.parserErrors ?? []).map(error =>
        createValidationError({
            type: 'parser',
            message: error.message,
            severity: 'error',
            line: error.token?.startLine,
            column: error.token?.startColumn
        })
    );

    const diagnosticErrors = (document.diagnostics ?? []).map(diagnostic =>
        createValidationError({
            type: 'diagnostic',
            message: diagnostic.message,
            severity: diagnostic.severity === 2
                ? 'warning'
                : diagnostic.severity === 3 || diagnostic.severity === 4
                    ? 'info'
                    : 'error',
            line: diagnostic.range?.start.line !== undefined
                ? diagnostic.range.start.line + 1
                : undefined,
            column: diagnostic.range?.start.character !== undefined
                ? diagnostic.range.start.character + 1
                : undefined
        })
    );

    const validationErrors = [
        ...lexerErrors,
        ...parserErrors,
        ...diagnosticErrors
    ];

    if (validationErrors.length) {
        const grammarError = new Error("Grammar contains errors.");
        grammarError.validationErrors = validationErrors;

        throw grammarError;
    }

    return document.parseResult.value;
}
