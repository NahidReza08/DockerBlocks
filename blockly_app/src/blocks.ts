import * as Blockly from 'blockly';

export function defineBlocks() {
  Blockly.defineBlocksWithJsonArray(
    [
      {
        "type": "compose",
        "message0": "compose",
        "message1": "{",
        "message2": "Services: %1",
        "args2": [
          {
            "type": "input_statement",
            "name": "SERVICES",
            "check": "service"
          }
        ],
        "message3": "}",
        "colour": 82
      },
      {
        "type": "service",
        "message0": "Service",
        "message1": "Name: %1",
        "args1": [
          {
            "type": "field_input",
            "name": "NAME",
            "text": "frontend"
          }
        ],
        "message2": "Image: %1",
        "args2": [
          {
            "type": "field_input",
            "name": "IMAGE",
            "text": "nginx"
          }
        ],
        "message3": "Ports: %1",
        "args3": [
          {
            "type": "input_statement",
            "name": "PORTS",
            "check": "port"
          }
        ],
        "message4": "Environment: %1",
        "args4": [
          {
            "type": "input_statement",
            "name": "ENVIRONMENT",
            "check": "environment"
          }
        ],
        "colour": 269,
        "previousStatement": "service",
        "nextStatement": "service"
      },
      {
        "type": "port",
        "message0": "port Host / Port: %1 -> Container / Port: %2",
        "args0": [
          {
            "type": "field_number",
            "name": "HOST_PORT",
            "value": 0
          },
          {
            "type": "field_number",
            "name": "CONTAINER_PORT",
            "value": 0
          }
        ],
        "colour": 241,
        "previousStatement": "port",
        "nextStatement": "port"
      },
      {
        "type": "environment",
        "message0": "environment",
        "message1": "Key: %1",
        "args1": [
          {
            "type": "field_input",
            "name": "KEY",
            "text": "NODE_ENV"
          }
        ],
        "message2": "Value: %1",
        "args2": [
          {
            "type": "field_input",
            "name": "VALUE",
            "text": "production"
          }
        ],
        "colour": 285,
        "previousStatement": "environment",
        "nextStatement": "environment"
      }
    ]
  );
}
