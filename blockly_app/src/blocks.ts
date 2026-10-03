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
        "message3": "Networks: %1",
        "args3": [
          {
            "type": "input_statement",
            "name": "NETWORKS",
            "check": "network"
          }
        ],
        "message4": "}",
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
        "message3": "Restart: %1",
        "args3": [
          {
            "type": "input_value",
            "name": "RESTART",
            "check": "restart"
          }
        ],
        "message4": "Depends On: %1",
        "args4": [
          {
            "type": "input_statement",
            "name": "DEPENDS_ON",
            "check": "dependency"
          }
        ],
        "message5": "Networks: %1",
        "args5": [
          {
            "type": "input_statement",
            "name": "NETWORKS",
            "check": "networkref"
          }
        ],
        "message6": "Ports: %1",
        "args6": [
          {
            "type": "input_statement",
            "name": "PORTS",
            "check": "port"
          }
        ],
        "message7": "Environment: %1",
        "args7": [
          {
            "type": "input_statement",
            "name": "ENVIRONMENT",
            "check": "environment"
          }
        ],
        "message8": "Volumes: %1",
        "args8": [
          {
            "type": "input_statement",
            "name": "VOLUMES",
            "check": "volume"
          }
        ],
        "colour": 269,
        "previousStatement": "service",
        "nextStatement": "service"
      },
      {
        "type": "dependency",
        "message0": "depends_on",
        "message1": "Service: %1",
        "args1": [
          {
            "type": "field_input",
            "name": "TARGET",
            "text": "db"
          }
        ],
        "colour": 210,
        "previousStatement": "dependency",
        "nextStatement": "dependency"
      },
      {
        "type": "restart",
        "message0": "Restart policy: %1",
        "args0": [
          {
            "type": "field_dropdown",
            "name": "POLICY",
            "options": [
              [
                "no",
                "no"
              ],
              [
                "always",
                "always"
              ],
              [
                "on-failure",
                "on-failure"
              ],
              [
                "unless-stopped",
                "unless-stopped"
              ]
            ]
          }
        ],
        "colour": 200,
        "output": "restart"
      },
      {
        "type": "networkref",
        "message0": "network",
        "message1": "Name: %1",
        "args1": [
          {
            "type": "field_input",
            "name": "TARGET",
            "text": "backend"
          }
        ],
        "colour": 190,
        "previousStatement": "networkref",
        "nextStatement": "networkref"
      },
      {
        "type": "network",
        "message0": "Network",
        "message1": "Name: %1",
        "args1": [
          {
            "type": "field_input",
            "name": "NAME",
            "text": "backend"
          }
        ],
        "message2": "Driver: %1",
        "args2": [
          {
            "type": "field_input",
            "name": "DRIVER",
            "text": "bridge"
          }
        ],
        "colour": 175,
        "previousStatement": "network",
        "nextStatement": "network"
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
      },
      {
        "type": "volume",
        "message0": "volume",
        "message1": "Source: %1",
        "args1": [
          {
            "type": "field_input",
            "name": "SOURCE",
            "text": "./data"
          }
        ],
        "message2": "Target: %1",
        "args2": [
          {
            "type": "field_input",
            "name": "TARGET",
            "text": "/app/data"
          }
        ],
        "colour": 155,
        "previousStatement": "volume",
        "nextStatement": "volume"
      }
    ]
  );
}
