import { isParserRule } from './ast-utils.js';

/**
 * @typedef {Object} IRPart
 * @property {"keyword"|"field"|"dropdown"|"value"|"statement"} kind
 * @property {string} [text]        - literal text, for "keyword" parts
 * @property {string} [feature]     - grammar feature name, for the other
 *   kinds. For a "statement" part produced by merging several alternative
 *   list-assignments (see the Alternatives handler below), this is every
 *   involved feature name joined with "_", e.g. "phones_addresses".
 * @property {"text"|"number"} [fieldType] - for "field" parts
 * @property {Array<[string,string]>} [options] - for "dropdown" parts
 * @property {string} [refRuleName] - the referenced parser rule, for "value"
 *   parts and for the common single-rule "statement" case (`feature+=Rule`).
 *   Left undefined when a "statement" part has more than one possible rule
 *   (see refRuleNames).
 * @property {string[]} [refRuleNames] - every parser rule that is allowed to
 *   fill a "statement" part. Holds a single entry (`[refRuleName]`) for a
 *   plain `feature+=Rule` assignment; holds one entry per branch for a
 *   merged `(a+=A | b+=B)*` alternatives group. The TS target
 *   (blockly-ts-target.js) uses this list to give every named rule's block
 *   a shared "check" type, so instances of any of them can be dropped into
 *   - and stacked above/below each other in - that one statement input.
 * @property {boolean} [optional]   - cardinality "?"
 * @property {boolean} [repeatable] - cardinality "*" / "+" / operator "+="
 *
 * @typedef {Object} RuleIR
 * @property {string} name
 * @property {IRPart[]} parts
 */

/**
 * Registry mapping AST node `$type` -> handler(node, ctx) that appends
 * IRParts to ctx.parts. To support a new grammar construct later, add a
 * new entry here instead of editing existing handlers.
 */
const nodeHandlers = {

    Group(node, ctx) {
        for (const e of node.elements)
            visit(e, ctx);
    },

    /**
     * A grammar `Alternatives` node (`a | b | c`) with no assignment in
     * front of it is handled as one of three distinct shapes, checked in
     * order:
     *
     *   1. Every branch is a bare `Keyword` -> the whole thing is one
     *      choice the user makes, so it becomes a single anonymous
     *      "dropdown" IR part (one Blockly field_dropdown, one option per
     *      keyword).
     *
     *   2. Every branch is a list assignment to a *different* feature
     *      (`phones+=Phone | addresses+=Address`) -> this is Langium's
     *      idiom for "a mixed, order-preserving list of several element
     *      kinds", e.g. `(phones+=Phone | addresses+=Address)*` in the
     *      AddressBook example grammar. The DSL doesn't care which
     *      feature a given entry was assigned to, only the interleaved
     *      order in which blocks are stacked - so all branches collapse
     *      into ONE shared Blockly statement input rather than one input
     *      per feature. (Visiting each branch independently would only
     *      ever surface the *last* feature parsed into that slot,
     *      silently dropping the others - hence the merge.)
     *
     *   3. Anything else (keywords mixed with rule calls, nested groups,
     *      etc.) isn't representable as a single Blockly input yet. We
     *      fall back to the first branch only, so the pipeline still
     *      produces *something*, and push a warning so the loss is
     *      visible instead of silent.
     */
    Alternatives(node, ctx) {
        const allKeywords = node.elements.every(e => e.$type === "Keyword");

        if (allKeywords) {
            ctx.parts.push({
                kind: "dropdown",
                feature: ctx.nextAnonymousFeature(),
                options: node.elements.map(e => [e.value, e.value])
            });
            return;
        }

        const allListAssignments = node.elements.every(e =>
            e.$type === "Assignment" &&
            e.operator === "+=" &&
            e.terminal?.$type === "RuleCall"
        );

        if (allListAssignments) {
            const refRuleNames = node.elements
                .map(e => e.terminal.rule?.ref?.name)
                .filter(Boolean);

            ctx.parts.push({
                kind: "statement",
                feature: node.elements.map(e => e.feature).join("_"),
                optional: false,
                repeatable: true,
                refRuleNames
            });
            return;
        }

        ctx.warnings.push(
            "Alternatives with non-keyword branches are only partially " +
            "supported; using the first branch only."
        );
        visit(node.elements[0], ctx);
    },

    Keyword(node, ctx) {
        ctx.parts.push({ kind: "keyword", text: node.value });
    },

    Assignment(node, ctx) {
        handleAssignment(node, ctx);
    },

    RuleCall(node, ctx) {
        // A bare (unassigned) rule call - uncommon in the restricted
        // subset, kept for forward compatibility.
        ctx.parts.push({
            kind: "value",
            feature: ctx.nextAnonymousFeature(),
            refRuleName: node.rule?.ref?.name
        });
    }
};

function visit(node, ctx) {

    if (!node)
        return;

    const handler = nodeHandlers[node.$type];

    if (!handler) {
        ctx.warnings.push(`No IR handler for node type "${node.$type}", skipping.`);
        return;
    }

    handler(node, ctx);
}

/**
 * Turns a single `feature=...` / `feature+=...` Assignment node into the
 * matching IRPart. This is where most of the "what does this grammar
 * feature mean as a Blockly input" mapping decisions live:
 *
 *   - `feature += X`                       -> "statement" (see below)
 *   - `feature = ID`                       -> "field" (fieldType: "text")
 *   - `feature = INT`                      -> "field" (fieldType: "number")
 *   - `feature = STRING`                   -> "field" (fieldType: "text")
 *   - `feature = SomeOtherRule`            -> "value" (a plug-in input_value socket)
 *   - `feature = (A | B | C)`              -> "dropdown", if A/B/C are all keywords
 *   - `feature = (ID | INT)`               -> "field" (fieldType: "text")
 *   - `feature = (INT | INT)`              -> "field" (fieldType: "number")
 *   - assigned scalar alternatives with ID and/or INT only -> one field IR part
 *   - anything else                        -> generic "value" fallback
 */
function handleAssignment(node, ctx) {

    const cardinality = node.cardinality; // undefined | '?' | '*' | '+'
    const optional = cardinality === '?';
    const repeatable = cardinality === '*' || cardinality === '+' || node.operator === '+=';

    // List-valued features (+=) map to Blockly statement inputs: the user
    // stacks one block per repetition. This is the idiomatic Blockly way
    // to express repetition and needs no custom mutator UI.
    if (node.operator === '+=') {
        // Capture which rule this list repeats over (when it's a plain
        // rule reference) so downstream targets can connect the two -
        // e.g. giving the referenced rule's block a self-typed
        // previousStatement/nextStatement so instances of it stack.
        //
        // Both refRuleName (single) and refRuleNames (array-of-one) are
        // set here so this common case looks the same, downstream, as
        // the multi-rule statement parts produced by the Alternatives
        // handler above - callers can always read refRuleNames and get
        // the full list, regardless of which path built the part.
        const refRuleName = node.terminal?.$type === "RuleCall"
            ? node.terminal.rule?.ref?.name
            : undefined;

        ctx.parts.push({
            kind: "statement",
            feature: node.feature,
            optional,
            repeatable: true,
            refRuleName,
            refRuleNames: refRuleName ? [refRuleName] : []
        });
        return;
    }

    const terminal = unwrapSingleElementGroups(node.terminal);

    if (terminal?.$type === "RuleCall") {

        const refName = terminal.rule?.ref?.name;

        switch (refName) {

            case "ID":
                ctx.parts.push({ kind: "field", feature: node.feature, fieldType: "text", optional, repeatable });
                return;

            case "INT":
                ctx.parts.push({ kind: "field", feature: node.feature, fieldType: "number", optional, repeatable });
                return;

            case "STRING":
                ctx.parts.push({ kind: "field", feature: node.feature, fieldType: "text", optional, repeatable });
                return;

            default:
                // Reference to another parser rule -> plug-in input.
                ctx.parts.push({ kind: "value", feature: node.feature, refRuleName: refName, optional, repeatable });
                return;
        }
    }

    if (terminal?.$type === "Alternatives") {

        const allKeywords = terminal.elements.every(e => e.$type === "Keyword");

        if (allKeywords) {
            ctx.parts.push({
                kind: "dropdown",
                feature: node.feature,
                options: terminal.elements.map(e => [e.value, e.value]),
                optional,
                repeatable
            });
            return;
        }

        const scalarRefNames = terminal.elements.map(e => unwrapSingleElementGroups(e).rule?.ref?.name);
        const scalarRuleCalls = scalarRefNames.every(refName => refName === 'ID' || refName === 'INT');

        if (scalarRuleCalls) {
            const hasId = scalarRefNames.includes('ID');
            const hasInt = scalarRefNames.includes('INT');
            const fieldType = hasInt && !hasId ? 'number' : 'text';

            ctx.parts.push({
                kind: "field",
                feature: node.feature,
                fieldType,
                optional,
                repeatable
            });
            return;
        }
    }

    // Anything else (mixed alternatives, groups, cross-references once
    // supported, ...) becomes a generic plug-in value input.
    ctx.parts.push({ kind: "value", feature: node.feature, optional, repeatable });
}

function unwrapSingleElementGroups(node) {
    let current = node;

    while (
        current?.$type === "Group" &&
        Array.isArray(current.elements) &&
        current.elements.length === 1
    ) {
        current = current.elements[0];
    }

    return current;
}

/**
 * Walks a Langium grammar AST and produces one RuleIR per parser rule
 * (terminal rules like ID/INT/WS are referenced by name but not converted
 * to blocks of their own).
 *
 * @param {object} grammar - Langium grammar AST (from loadGrammar).
 * @param {object} [options]
 * @param {(msg: string) => void} [options.onWarning] - called once per
 *   simplification/skip made while building the IR (e.g. a mixed
 *   Alternatives branch that got collapsed, or an unrecognised node type).
 * @returns {RuleIR[]}
 */
export function buildIR(grammar, options = {}) {

    const rules = [];
    const warnings = [];

    for (const rule of grammar.rules) {

        if (!isParserRule(rule))
            continue;

        let anon = 0;

        const ctx = {
            parts: [],
            warnings,
            // Anonymous IR parts (dropdowns/values with no `feature=` in
            // the grammar) still need a unique name to key off of in the
            // generated Blockly JSON/code, so mint anon0, anon1, ... per
            // rule as they're encountered.
            nextAnonymousFeature: () => `anon${anon++}`
        };

        visit(rule.definition, ctx);

        rules.push({ name: rule.name, parts: ctx.parts, entry: rule.entry === true });
    }

    if (warnings.length && options.onWarning) {
        warnings.forEach(options.onWarning);
    }

    return rules;
}

// Exported so callers (or future support for new node types) can extend
// the registry: `nodeHandlers.UnorderedGroup = (node, ctx) => {...}`.
export { nodeHandlers };
