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
      "name": "Structure",
      "colour": "#7C3AED",
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
          "type": "network"
        }
      ]
    },
    {
      "kind": "category",
      "name": "Service Configuration",
      "colour": "#0D9488",
      "contents": [
        {
          "kind": "block",
          "type": "image"
        },
        {
          "kind": "block",
          "type": "build"
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
        },
        {
          "kind": "block",
          "type": "dependency"
        },
        {
          "kind": "block",
          "type": "networkref"
        },
        {
          "kind": "block",
          "type": "restart"
        },
        {
          "kind": "block",
          "type": "healthcheck"
        }
      ]
    }
  ]
},
  generator,
  validationErrors
});
