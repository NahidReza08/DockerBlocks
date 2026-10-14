import { bootstrapBlocklyApp } from './app-bootstrap';
import { defineBlocks } from './blocks';
import { DOCKER_TOOLBOX } from './docker-block-definitions';
import { generator } from './generator';
import { validationErrors } from './validation-errors';

defineBlocks();

bootstrapBlocklyApp({
  toolbox: DOCKER_TOOLBOX,
  generator,
  validationErrors
});
