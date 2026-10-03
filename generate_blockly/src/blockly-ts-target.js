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

        block.message3 = "Restart: %1";
        block.args3 = [
            {
                type: "input_value",
                name: "RESTART",
                check: "restart"
            }
        ];

        block.message4 = "Healthcheck: %1";
        block.args4 = [
            {
                type: "input_value",
                name: "HEALTHCHECK",
                check: "healthcheck"
            }
        ];

        block.message5 = "Depends On: %1";
        block.args5 = [
            {
                type: "input_statement",
                name: "DEPENDS_ON",
                check: "dependency"
            }
        ];

        block.message6 = "Networks: %1";
        block.args6 = [
            {
                type: "input_statement",
                name: "NETWORKS",
                check: "networkref"
            }
        ];

        block.message7 = "Ports: %1";
        block.args7 = [
            {
                type: "input_statement",
                name: "PORTS",
                check: "port"
            }
        ];

        block.message8 = "Environment: %1";
        block.args8 = [
            {
                type: "input_statement",
                name: "ENVIRONMENT",
                check: "environment"
            }
        ];

        block.message9 = "Volumes: %1";
        block.args9 = [
            {
                type: "input_statement",
                name: "VOLUMES",
                check: "volume"
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

    if (ruleLower === "healthcheck") {
        block.message0 = "Healthcheck";
        block.message1 = "Command: %1";
        block.args1 = [
            {
                type: "field_input",
                name: "COMMAND",
                text: "curl -f http://localhost || exit 1"
            }
        ];
        block.message2 = "Interval: %1";
        block.args2 = [
            {
                type: "field_input",
                name: "INTERVAL",
                text: "30s"
            }
        ];
        block.message3 = "Timeout: %1";
        block.args3 = [
            {
                type: "field_input",
                name: "TIMEOUT",
                text: "10s"
            }
        ];
        block.message4 = "Retries: %1";
        block.args4 = [
            {
                type: "field_number",
                name: "RETRIES",
                value: 3
            }
        ];
        block.colour = 120;
        block.output = "healthcheck";

        return block;
    }

    if (ruleLower === "restart") {
        block.message0 = "Restart policy: %1";
        block.args0 = [
            {
                type: "field_dropdown",
                name: "POLICY",
                options: [
                    ["no", "no"],
                    ["always", "always"],
                    ["on-failure", "on-failure"],
                    ["unless-stopped", "unless-stopped"]
                ]
            }
        ];
        block.colour = 200;
        block.output = "restart";

        return block;
    }

    if (ruleLower === "networkref") {
        block.message0 = "network";
        block.message1 = "Name: %1";
        block.args1 = [
            {
                type: "field_input",
                name: "TARGET",
                text: "backend"
            }
        ];
        block.colour = 190;

        const stackType = stackTypes.get(ruleLower);
        if (stackType) {
            block.previousStatement = stackType;
            block.nextStatement = stackType;
        }

        return block;
    }

    if (ruleLower === "network") {
        block.message0 = "Network";
        block.message1 = "Name: %1";
        block.args1 = [
            {
                type: "field_input",
                name: "NAME",
                text: "backend"
            }
        ];
        block.message2 = "Driver: %1";
        block.args2 = [
            {
                type: "field_input",
                name: "DRIVER",
                text: "bridge"
            }
        ];
        block.colour = 175;

        const stackType = stackTypes.get(ruleLower);
        if (stackType) {
            block.previousStatement = stackType;
            block.nextStatement = stackType;
        }

        return block;
    }

    if (ruleLower === "dependency") {
        block.message0 = "depends_on";
        block.message1 = "Service: %1";
        block.args1 = [
            {
                type: "field_input",
                name: "TARGET",
                text: "db"
            }
        ];
        block.colour = 210;

        const stackType = stackTypes.get(ruleLower);
        if (stackType) {
            block.previousStatement = stackType;
            block.nextStatement = stackType;
        }

        return block;
    }

    if (ruleLower === "environment") {
        block.message0 = "environment";
        block.message1 = "Key: %1";
        block.args1 = [
            {
                type: "field_input",
                name: "KEY",
                text: "NODE_ENV"
            }
        ];
        block.message2 = "Value: %1";
        block.args2 = [
            {
                type: "field_input",
                name: "VALUE",
                text: "production"
            }
        ];
        block.colour = 285;

        const stackType = stackTypes.get(ruleLower);
        if (stackType) {
            block.previousStatement = stackType;
            block.nextStatement = stackType;
        }

        return block;
    }

    if (ruleLower === "volume") {
        block.message0 = "volume";
        block.message1 = "Source: %1";
        block.args1 = [
            {
                type: "field_input",
                name: "SOURCE",
                text: "./data"
            }
        ];
        block.message2 = "Target: %1";
        block.args2 = [
            {
                type: "field_input",
                name: "TARGET",
                text: "/app/data"
            }
        ];
        block.colour = 155;

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
            if (
                blockType === "service" &&
                (part.feature === "name" || part.feature === "image")
            ) {
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

    if (blockType === "compose") {
        return [
            `generator.forBlock['compose'] = function (block: Blockly.Block): string {`,
            `  return generateDockerComposeYaml(block, generator);`,
            `};`
        ].join('\n');
    }

    if (blockType === "service") {
        return [
            `generator.forBlock['service'] = function (block: Blockly.Block): string {`,
            `  return generateDockerServiceYaml(block, generator);`,
            `};`
        ].join('\n');
    }

    if (blockType === "restart") {
        return [
            `generator.forBlock['restart'] = function (block: Blockly.Block): [string, Order] {`,
            `  return generateDockerRestartYaml(block);`,
            `};`
        ].join('\n');
    }

    if (blockType === "healthcheck") {
        return [
            `generator.forBlock['healthcheck'] = function (block: Blockly.Block): [string, Order] {`,
            `  return generateDockerHealthcheckYaml(block);`,
            `};`
        ].join('\n');
    }

    if (blockType === "dependency") {
        return [
            `generator.forBlock['dependency'] = function (block: Blockly.Block): string {`,
            `  return generateDockerDependencyYaml(block);`,
            `};`
        ].join('\n');
    }

    if (blockType === "networkref") {
        return [
            `generator.forBlock['networkref'] = function (block: Blockly.Block): string {`,
            `  return generateDockerNetworkRefYaml(block);`,
            `};`
        ].join('\n');
    }

    if (blockType === "network") {
        return [
            `generator.forBlock['network'] = function (block: Blockly.Block): string {`,
            `  return generateDockerNetworkYaml(block);`,
            `};`
        ].join('\n');
    }

    if (blockType === "port") {
        return [
            `generator.forBlock['port'] = function (block: Blockly.Block): string {`,
            `  return generateDockerPortYaml(block);`,
            `};`
        ].join('\n');
    }

    if (blockType === "environment") {
        return [
            `generator.forBlock['environment'] = function (block: Blockly.Block): string {`,
            `  return generateDockerEnvironmentYaml(block);`,
            `};`
        ].join('\n');
    }

    if (blockType === "volume") {
        return [
            `generator.forBlock['volume'] = function (block: Blockly.Block): string {`,
            `  return generateDockerVolumeYaml(block);`,
            `};`
        ].join('\n');
    }

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
  const usesDockerYamlHelpers = irRules.some(rule =>
    ["compose", "service", "restart", "healthcheck", "dependency", "networkref", "network", "port", "environment", "volume"].includes(rule.name.toLowerCase())
  );

  const usesOrder = functions.includes("Order");
  const generatorImport = usesOrder
    ? "import { javascriptGenerator, Order } from 'blockly/javascript';"
    : "import { javascriptGenerator } from 'blockly/javascript';";
  const dockerYamlImport = usesDockerYamlHelpers
    ? `import {
  generateDockerComposeYaml,
  generateDockerDependencyYaml,
  generateDockerEnvironmentYaml,
  generateDockerHealthcheckYaml,
  generateDockerNetworkRefYaml,
  generateDockerNetworkYaml,
  generateDockerPortYaml,
  generateDockerRestartYaml,
  generateDockerServiceYaml,
  generateDockerVolumeYaml
} from './docker-yaml';
`
    : "";

  return `import * as Blockly from 'blockly';

${generatorImport}
${dockerYamlImport}

export const generator = javascriptGenerator;
generator.INDENT = '  ';

${functions}
`;
}

export function generateMainTs(irRules) {
    const toolboxCategories = [];

    const dockerBlockTypes = new Set(["compose", "service", "restart", "healthcheck", "dependency", "networkref", "network", "port", "environment", "volume"]);

    const dockerRules = irRules.filter(r =>
        dockerBlockTypes.has(r.name.toLowerCase())
    );

    const entryRules = irRules.filter(r =>
        r.entry && !dockerBlockTypes.has(r.name.toLowerCase())
    );

    const otherRules = irRules.filter(r =>
        !r.entry && !dockerBlockTypes.has(r.name.toLowerCase())
    );

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

    if (dockerRules.length) {
        toolboxCategories.push({
            name: "Docker",
            colour: "230",
            blocks: dockerRules.map(r => r.name.toLowerCase())
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

    return `import { defineBlocks } from './blocks';
import { bootstrapBlocklyApp } from './app-bootstrap';
import { generator } from './generator';
import { validationErrors } from './validation-errors';

defineBlocks();

bootstrapBlocklyApp({
  toolbox: ${JSON.stringify(toolboxJson, null, 2)},
  generator,
  validationErrors
});
`;
}
