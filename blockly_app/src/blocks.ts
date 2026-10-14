import * as Blockly from 'blockly';

import { DOCKER_BLOCK_DEFINITIONS } from './docker-block-definitions';

export function defineBlocks() {
  Blockly.defineBlocksWithJsonArray(DOCKER_BLOCK_DEFINITIONS);
}
