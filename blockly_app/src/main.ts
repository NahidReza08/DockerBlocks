import { defineBlocks } from './blocks';
import { bootstrapBlocklyApp } from './app-bootstrap';
import { generator } from './generator';
import { validationErrors } from './validation-errors';

defineBlocks();

bootstrapBlocklyApp({
  toolbox: {
  "kind": "categoryToolbox",
  "contents": [
    {
      "kind": "category",
      "name": "Docker",
      "colour": "230",
      "contents": [
        {
          "kind": "block",
          "type": "compose"
        },
        {
          "kind": "block",
          "type": "service"
        },
        {
          "kind": "block",
          "type": "dependency"
        },
        {
          "kind": "block",
          "type": "port"
        },
        {
          "kind": "block",
          "type": "environment"
        },
        {
          "kind": "block",
          "type": "volume"
        }
      ]
    }
  ]
},
  generator,
  validationErrors
});
