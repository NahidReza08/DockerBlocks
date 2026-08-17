import { isParserRule } from './ast-utils.js';
import { createValidationError } from './validation-error.js';

/**
 * Node types currently supported end-to-end (parser rules, groups,
 * alternatives, assignments, keywords, rule calls). Extend this set
 * (or pass a custom `allowedTypes` option) to support more Langium
 * constructs, e.g. add "UnorderedGroup" or "CrossReference" once the
 * IR builder and generators know how to handle them.
 */
export const DEFAULT_ALLOWED_TYPES = new Set([
    'Grammar',
    'ParserRule',
    'Group',
    'Alternatives',
    'Assignment',
    'Keyword',
    'RuleCall'
]);

/**
 * Cardinalities considered "simple repetition" and currently supported.
 * `undefined` means "no cardinality at all".
 */
export const DEFAULT_ALLOWED_CARDINALITIES = new Set([undefined, '?', '*', '+']);

/**
 * Walks every parser rule's definition and collects every unsupported
 * construct it finds, instead of failing on the first one, so the user
 * gets a full picture of what needs to change in their grammar.
 *
 * @param {object} grammar - Langium grammar AST (from loadGrammar).
 * @param {object} [options]
 * @param {Set<string>} [options.allowedTypes]
 * @param {Set<string|undefined>} [options.allowedCardinalities]
 * @throws if unsupported constructs are found.
 * @returns {true} if the grammar is fully within the supported subset.
 */
export function validateGrammar(grammar, options = {}) {

    const allowedTypes = options.allowedTypes ?? DEFAULT_ALLOWED_TYPES;
    const allowedCardinalities = options.allowedCardinalities ?? DEFAULT_ALLOWED_CARDINALITIES;

    const errors = [];

    for (const rule of grammar.rules) {

        if (!isParserRule(rule))
            continue;

        walk(rule.definition, `rule "${rule.name}"`);
    }

    if (errors.length) {
        const validationError = new Error(
            "Grammar uses unsupported constructs:\n" +
            errors.map(e => ` - ${e.message}`).join("\n")
        );

        validationError.validationErrors = errors;

        throw validationError;
    }

    return true;

    function walk(node, context) {

        if (!node)
            return;

        if (!allowedTypes.has(node.$type)) {
            errors.push(createValidationError({
                type: 'unsupported-node-type',
                message: `${context}: unsupported node type "${node.$type}"`,
                severity: 'error'
            }));
            return; // don't descend into an already-unsupported subtree
        }

        if ('cardinality' in node && !allowedCardinalities.has(node.cardinality)) {
            errors.push(createValidationError({
                type: 'unsupported-cardinality',
                message: `${context}: unsupported cardinality "${node.cardinality}"`,
                severity: 'error'
            }));
        }

        switch (node.$type) {

            case "Group":
            case "Alternatives":
                for (const e of node.elements)
                    walk(e, context);
                break;

            case "Assignment":
                walk(node.terminal, context);
                break;

            case "RuleCall":
            case "Keyword":
                // leaf nodes, nothing further to check
                break;
        }
    }
}
