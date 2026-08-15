# S1-01 - Setup and Verify Current Project

## Verified Setup

- Repository cloned successfully.
- Branch verified from `main`.
- Dependencies installed with `npm ci`.
- Development server starts successfully with `npm run dev`.
- Blockly application loads at the Vite local URL.
- Grammar generation command runs successfully:
  `node generate_blockly/src/parse.js generate_blockly/input/grammar.langium`
- Generated Blockly blocks can be connected in the visual workspace.
- Generated DSL code updates correctly from the Blockly workspace.

## Setup Issues Found

1. The checked-in `blockly_app/src/generator.ts` uses the outdated Blockly API `generator.ORDER_NONE`, which causes `npm run build` to fail with the current installed Blockly version.

2. The checked-in Blockly application and `generate_blockly/input/grammar.langium` are currently not synchronized.
   - Checked-in Blockly source represents Project / Metadata / Member / Module / Task / Subtask blocks.
   - Regenerating from the current grammar produces AddressBook / Contact / Phone / Address blocks.

3. Regenerated `generator.ts` contains an unused `dedentOnce()` helper, causing TypeScript compilation to fail with `TS6133`.

4. npm reports audit notices after dependency installation. No automatic `npm audit fix` was applied during baseline setup.

## Baseline Result

The current application can be installed and run successfully with the development server. The issues above were recorded without changing application behavior as part of S1-01.
