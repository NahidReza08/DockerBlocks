import { argBuilders } from './block-json-generator.js';

function toArgName(feature) {
    return feature
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toUpperCase();
}

function safeVarName(feature) {
    return feature.replace(/[^a-zA-Z0-9_]/g, "_");
}

function indent(text, spaces) {
    const pad = " ".repeat(spaces);
    return text.split("\n").map(line => pad + line).join("\n");
}

function computeStackTypes(irRules) {
    const typeByRule = new Map();

    for (const rule of irRules) {
        for (const part of rule.parts) {
            if (part.kind !== "statement")
                continue;

            const names = (part.refRuleNames?.length ? part.refRuleNames : (part.refRuleName ? [part.refRuleName] : []))
                .map(n => n.toLowerCase());

            if (!names.length)
                continue;

            const check = [...names].sort().join("_or_");

            for (const n of names)
                typeByRule.set(n, check);
        }
    }

    return typeByRule;
}

function computeValueRules(irRules, stackTypes) {
    const valueRules = new Set();
    for (const rule of irRules) {
        for (const part of rule.parts) {
            if (part.kind === "value" && part.refRuleName) {
                const refLower = part.refRuleName.toLowerCase();
                if (!stackTypes.has(refLower)) {
                    valueRules.add(refLower);
                }
            }
        }
    }
    return valueRules;
}

function humanizeFeature(feature) {
    if (/^anon\d+$/.test(feature))
        return "Option";

    return feature
        .split("_")
        .map(word => word.replace(/([a-z0-9])([A-Z])/g, "$1 $2"))
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" / ");
}

function colourForRule(name) {
    let hash = 0;
    for (const ch of name)
        hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return hash % 360;
}

function partToArg(part, stackTypes, valueRules) {
    if (part.kind === "value" && part.refRuleName) {
        const refLower = part.refRuleName.toLowerCase();
        if (!valueRules.has(refLower)) {
            return {
                type: "field_input",
                name: toArgName(part.feature),
                text: "default_" + part.feature
            };
        }
    }

    const builder = argBuilders[part.kind];

    if (!builder)
        throw new Error(`No block-json builder for IR part kind "${part.kind}"`);

    const arg = { ...builder(part), name: toArgName(part.feature) };

    // Provide helpful default text for text fields so generated code is never empty
    if (arg.type === "field_input" && !arg.text) {
        arg.text = "Unnamed";
    }

    if (part.kind === "statement") {
        const names = (part.refRuleNames?.length ? part.refRuleNames : (part.refRuleName ? [part.refRuleName] : []))
            .map(n => n.toLowerCase());

        const checks = [...new Set(names.map(n => stackTypes.get(n)))].filter(Boolean);

        if (checks.length)
            arg.check = checks.length === 1 ? checks[0] : checks;
    } else if (part.kind === "value" && part.refRuleName) {
        arg.check = part.refRuleName.toLowerCase();
    }

    return arg;
}

function ruleToBlockJson(rule, stackTypes, valueRules) {
    const block = { type: rule.name.toLowerCase() };
    const ruleLower = rule.name.toLowerCase();

    // Docker Compose services use a compact, user-friendly visual layout.
    // The DSL generator still follows the grammar and emits:
    // service <name> { image <image> }
    if (ruleLower === "service") {
        block.message0 = "Service";

        block.message1 = "Name: %1";
        block.args1 = [
            {
                type: "field_input",
                name: "NAME",
                text: "frontend"
            }
        ];

        block.message2 = "Image: %1";
        block.args2 = [
            {
                type: "field_input",
                name: "IMAGE",
                text: "nginx"
            }
        ];

        block.colour = colourForRule(rule.name);

        const stackType = stackTypes.get(ruleLower);
        if (stackType) {
            block.previousStatement = stackType;
            block.nextStatement = stackType;
        }

        return block;
    }

    let messageIndex = 0;
    let currentMsg = [];
    let currentArgs = [];
    let placeholder = 1;

    const flushLine = () => {
        const msgStr = currentMsg.join(" ").trim();
        if (msgStr.length > 0 || currentArgs.length > 0) {
            block[`message${messageIndex}`] = msgStr;
            if (currentArgs.length > 0) {
                block[`args${messageIndex}`] = currentArgs;
            }
            messageIndex++;
            currentMsg = [];
            currentArgs = [];
            placeholder = 1;
        }
    };

    for (const part of rule.parts) {
        if (part.kind === "keyword") {
            if (part.text === "{" || part.text === "}") {
                flushLine();
                currentMsg.push(part.text);
                flushLine();
            } else {
                currentMsg.push(part.text);
            }
            continue;
        }

        if (part.kind === "statement") {
            flushLine();
            block[`message${messageIndex}`] = `${humanizeFeature(part.feature)}: %1`;
            block[`args${messageIndex}`] = [partToArg(part, stackTypes, valueRules)];
            messageIndex++;
            continue;
        }

        currentMsg.push(`${humanizeFeature(part.feature)}: %${placeholder++}`);
        currentArgs.push(partToArg(part, stackTypes, valueRules));
    }

    flushLine();

    block.colour = colourForRule(rule.name);

    if (valueRules.has(ruleLower)) {
        block.output = ruleLower;
    } else {
        const stackType = stackTypes.get(ruleLower);

        if (stackType) {
            block.previousStatement = stackType;
            block.nextStatement = stackType;
        }
    }

    return block;
}

export function generateBlocksTs(irRules) {
    const stackTypes = computeStackTypes(irRules);
    const valueRules = computeValueRules(irRules, stackTypes);
    const blocks = irRules.map(rule => ruleToBlockJson(rule, stackTypes, valueRules));
    const blocksLiteral = indent(JSON.stringify(blocks, null, 2), 4);

    return `import * as Blockly from 'blockly';

export function defineBlocks() {
  Blockly.defineBlocksWithJsonArray(
${blocksLiteral}
  );
}
`;
}

function ruleToGeneratorFunction(rule, stackTypes, valueRules) {
    const blockType = rule.name.toLowerCase();
    const isValueBlock = valueRules.has(blockType);
    const setupLines = [];
    const items = [];

    for (const part of rule.parts) {
        if (part.kind === "keyword") {
            items.push({ frag: JSON.stringify(part.text), multiline: false });
            continue;
        }

        const varName = safeVarName(part.feature);
        const argName = toArgName(part.feature);
        const isConvertedValueField = part.kind === "value" && part.refRuleName && !valueRules.has(part.refRuleName.toLowerCase());

        if (part.kind === "field" || part.kind === "dropdown" || isConvertedValueField) {
            if (blockType === "service" && part.feature === "name") {
                setupLines.push(`  const ${varName} = block.getFieldValue('${argName}') ?? '';`);
            } else {
                setupLines.push(`  const ${varName} = block.getFieldValue('${argName}') || 'Unnamed';`);
            }
            items.push({ frag: varName, multiline: false });
        } else if (part.kind === "value") {
            setupLines.push(`  const ${varName} = generator.valueToCode(block, '${argName}', Order.NONE) || '';`);
            items.push({ frag: varName, multiline: false });
        } else if (part.kind === "statement") {
            const raw = `generator.statementToCode(block, '${argName}').replace(/\\n$/, '')`;
            setupLines.push(`  const ${varName} = ${raw};`);
            items.push({ frag: varName, multiline: true });
        } else {
            throw new Error(`No code-generator template for IR part kind "${part.kind}"`);
        }
    }

    let codeExpr;
    if (!items.length) {
        codeExpr = `''`;
    } else {
        codeExpr = items[0].frag;
        for (let i = 1; i < items.length; i++) {
            const sep = (items[i - 1].multiline || items[i].multiline) ? "'\\n'" : "' '";
            codeExpr += ` + ${sep} + ${items[i].frag}`;
        }
    }

    const isStackable = stackTypes.has(blockType);

    if (isValueBlock) {
        return [
            `generator.forBlock['${blockType}'] = function (block: Blockly.Block) {`,
            ...setupLines,
            `  const code = (${codeExpr}).trim();`,
            `  return [code, Order.ATOMIC];`,
            `};`
        ].join("\n");
    } else {
        return [
            `generator.forBlock['${blockType}'] = function (block: Blockly.Block): string {`,
            ...setupLines,
            `  const code = (${codeExpr}).trim();`,
            `  return code${isStackable ? " + '\\n'" : ""};`,
            `};`
        ].join("\n");
    }
}

export function generateGeneratorTs(irRules) {
  const stackTypes = computeStackTypes(irRules);
  const valueRules = computeValueRules(irRules, stackTypes);
  const functions = irRules
    .map(rule => ruleToGeneratorFunction(rule, stackTypes, valueRules))
    .join("\n\n");

  const usesOrder = functions.includes("Order.");
  const generatorImport = usesOrder
    ? "import { javascriptGenerator, Order } from 'blockly/javascript';"
    : "import { javascriptGenerator } from 'blockly/javascript';";

  return `import * as Blockly from 'blockly';

${generatorImport}

export const generator = javascriptGenerator;
generator.INDENT = '  ';

${functions}
`;
}

export function generateMainTs(irRules) {
    const toolboxCategories = [];
    const entryRules = irRules.filter(r => r.entry);
    const otherRules = irRules.filter(r => !r.entry);

    if (entryRules.length) {
        toolboxCategories.push({
            name: "Main / Entry",
            colour: "210",
            blocks: entryRules.map(r => r.name.toLowerCase())
        });
    }

    if (otherRules.length) {
        toolboxCategories.push({
            name: "Elements & Components",
            colour: "160",
            blocks: otherRules.map(r => r.name.toLowerCase())
        });
    }

    const toolboxJson = {
        kind: "categoryToolbox",
        contents: toolboxCategories.map(cat => ({
            kind: "category",
            name: cat.name,
            colour: cat.colour,
            contents: cat.blocks.map(type => ({
                kind: "block",
                type
            }))
        }))
    };

    return `import * as Blockly from 'blockly';
import { defineBlocks } from './blocks';
import { generator } from './generator';
import { validationErrors } from './validation-errors';

type UiValidationError = {
  type: string;
  message: string;
  severity: string;
  line?: number;
  column?: number;
  blockId?: string;
};

let capturedValidationErrors = [...validationErrors] as UiValidationError[];

defineBlocks();

const workspace = Blockly.inject('blocklyDiv', {
  toolbox: ${JSON.stringify(toolboxJson, null, 2)}
});

const codeOutput = document.getElementById('codeOutput');
const errorOutput = document.getElementById('errorOutput');

const VALIDATION_WARNING_ID = 'captured-validation-error';

function updateBlockValidationWarnings() {
  workspace.getAllBlocks(false).forEach((block) => {
    block.setWarningText(null, VALIDATION_WARNING_ID);
  });

  const messagesByBlockId = new Map<string, string[]>();

  capturedValidationErrors.forEach((error) => {
    if (!error.blockId) return;

    const messages = messagesByBlockId.get(error.blockId) ?? [];
    messages.push(error.message);
    messagesByBlockId.set(error.blockId, messages);
  });

  messagesByBlockId.forEach((messages, blockId) => {
    const block = workspace.getBlockById(blockId);

    if (!block) return;

    block.setWarningText(
      messages.join('\\n'),
      VALIDATION_WARNING_ID
    );
  });
}

function createValidationErrorElement(
  error: UiValidationError
): HTMLElement {
  const item = document.createElement('div');
  item.className = 'validation-error';

  const title = document.createElement('div');
  title.className = 'validation-error-title';
  title.textContent = '[' + error.type + ']';
  item.appendChild(title);

  const message = document.createElement('div');
  message.className = 'validation-error-message';
  message.textContent = error.message;
  item.appendChild(message);

  const details: string[] = [];

  if (error.line !== undefined) {
    let location = 'Line ' + error.line;

    if (error.column !== undefined) {
      location += ', column ' + error.column;
    }

    details.push(location);
  }

  if (error.blockId !== undefined) {
    details.push('Block: ' + error.blockId);
  }

  if (details.length > 0) {
    const location = document.createElement('div');
    location.className = 'validation-error-location';
    location.textContent = details.join(' · ');
    item.appendChild(location);
  }

  return item;
}

function showNoValidationErrors() {
  if (!errorOutput) return;

  errorOutput.replaceChildren();

  const status = document.createElement('div');
  status.className = 'validation-status';
  status.textContent = 'No errors detected.';

  errorOutput.appendChild(status);
}

function showCapturedValidationErrors() {
  if (!errorOutput) return;

  errorOutput.replaceChildren();

  if (capturedValidationErrors.length === 0) {
    showNoValidationErrors();
    return;
  }

  capturedValidationErrors.forEach((error) => {
    errorOutput.appendChild(
      createValidationErrorElement(error)
    );
  });
}

function refreshValidationState(
  nextErrors: UiValidationError[]
) {
  capturedValidationErrors = [...nextErrors];

  showCapturedValidationErrors();
  updateBlockValidationWarnings();
}

function removeValidationErrorsForBlock(
  blockId: string
) {
  const nextErrors = capturedValidationErrors.filter(
    (error) => error.blockId !== blockId
  );

  refreshValidationState(nextErrors);
}

function generateCode() {
  try {
    const code = generator.workspaceToCode(workspace);

    if (codeOutput) {
      codeOutput.textContent = code;
    }

    if (capturedValidationErrors.length === 0) {
      showNoValidationErrors();
    }
  } catch (e) {
    if (errorOutput) {
      errorOutput.textContent =
        e instanceof Error ? e.message : String(e);
    }
  }
}

function handleWorkspaceChange(
  event: Blockly.Events.Abstract
) {
  generateCode();

  if (
    event.type === Blockly.Events.BLOCK_DELETE &&
    'ids' in event &&
    Array.isArray(event.ids)
  ) {
    const deletedBlockIds = event.ids.filter(
      (id): id is string => typeof id === 'string'
    );

    const nextErrors = capturedValidationErrors.filter(
      (error) =>
        !error.blockId ||
        !deletedBlockIds.includes(error.blockId)
    );

    refreshValidationState(nextErrors);
    return;
  }

  if (
    event.type === Blockly.Events.BLOCK_CHANGE &&
    'blockId' in event &&
    typeof event.blockId === 'string'
  ) {
    removeValidationErrorsForBlock(event.blockId);
    return;
  }

  updateBlockValidationWarnings();
}

refreshValidationState(capturedValidationErrors);

workspace.addChangeListener(handleWorkspaceChange);
`;
}