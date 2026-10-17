import * as Blockly from 'blockly';

import { bootstrapBlocklyApp } from './app-bootstrap';
import {
  DOCKER_BLOCK_DEFINITIONS
} from './docker-block-definitions';
import { generator } from './generator';

// Register custom Docker blocks
Blockly.defineBlocksWithJsonArray(DOCKER_BLOCK_DEFINITIONS);

// Initialize the application
bootstrapBlocklyApp({
  generator
});
