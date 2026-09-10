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
        "message0": "service Name: %1",
        "args0": [
          {
            "type": "field_input",
            "name": "NAME",
            "text": "Unnamed"
          }
        ],
        "message1": "{",
        "message2": "image Image: %1",
        "args2": [
          {
            "type": "field_input",
            "name": "IMAGE",
            "text": "Unnamed"
          }
        ],
        "message3": "}",
        "colour": 269,
        "previousStatement": "service",
        "nextStatement": "service"
      }
    ]
  );
}
