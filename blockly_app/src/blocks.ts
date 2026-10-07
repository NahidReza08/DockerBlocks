import * as Blockly from 'blockly';

export function defineBlocks() {
  Blockly.defineBlocksWithJsonArray(
    [
      {
        "type": "compose",
        "message0": "compose",
        "message1": "Elements: %1",
        "args1": [
          {
            "type": "input_statement",
            "name": "ELEMENTS",
            "check": "compose_element"
          }
        ],
        "colour": "#7C3AED",
        "tooltip": "Drop Compose elements here.\nSupports: Service, Network."
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
        "message2": "Configuration: %1",
        "args2": [
          {
            "type": "input_statement",
            "name": "CONFIG",
            "check": "service_config"
          }
        ],
        "tooltip": "Drop service configuration blocks here.\nSupports: Image, Build, Ports, Environment, Volumes, Depends On, Networks, Restart, Healthcheck.",
        "colour": "#2563EB",
        "previousStatement": "compose_element",
        "nextStatement": "compose_element"
      },
      {
        "type": "image",
        "message0": "Image",
        "message1": "Name: %1",
        "args1": [
          {
            "type": "field_input",
            "name": "IMAGE",
            "text": "nginx:latest"
          }
        ],
        "colour": "#16A34A",
        "previousStatement": "service_config",
        "nextStatement": "service_config"
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
        "colour": "#F97316",
        "previousStatement": "service_config",
        "nextStatement": "service_config"
      },
      {
        "type": "build",
        "message0": "Build",
        "message1": "Context: %1",
        "args1": [
          {
            "type": "field_input",
            "name": "CONTEXT",
            "text": "."
          }
        ],
        "colour": "#EA580C",
        "previousStatement": "service_config",
        "nextStatement": "service_config"
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
        "colour": "#10B981",
        "previousStatement": "service_config",
        "nextStatement": "service_config"
      },
      {
        "type": "healthcheck",
        "message0": "Healthcheck",
        "message1": "Command: %1",
        "args1": [
          {
            "type": "field_input",
            "name": "COMMAND",
            "text": "curl -f http://localhost || exit 1"
          }
        ],
        "message2": "Interval: %1",
        "args2": [
          {
            "type": "field_input",
            "name": "INTERVAL",
            "text": "30s"
          }
        ],
        "message3": "Timeout: %1",
        "args3": [
          {
            "type": "field_input",
            "name": "TIMEOUT",
            "text": "10s"
          }
        ],
        "message4": "Retries: %1",
        "args4": [
          {
            "type": "field_number",
            "name": "RETRIES",
            "value": 3
          }
        ],
        "colour": "#DB2777",
        "previousStatement": "service_config",
        "nextStatement": "service_config"
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
        "colour": "#0891B2",
        "previousStatement": "service_config",
        "nextStatement": "service_config"
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
        "colour": "#06B6D4",
        "previousStatement": "compose_element",
        "nextStatement": "compose_element"
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
        "colour": "#EF4444",
        "previousStatement": "service_config",
        "nextStatement": "service_config"
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
        "colour": "#8B5CF6",
        "previousStatement": "service_config",
        "nextStatement": "service_config"
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
        "colour": "#0D9488",
        "previousStatement": "service_config",
        "nextStatement": "service_config"
      }
    ]
  );
}
