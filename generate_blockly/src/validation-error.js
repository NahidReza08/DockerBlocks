/**
 * Shared representation for parser and validation errors.
 *
 * This is intentionally a plain object so it can be passed between
 * backend/generation logic and the Blockly UI without depending on
 * JavaScript Error objects.
 *
 * @typedef {Object} ValidationError
 * @property {string} type - Machine-readable error category.
 * @property {string} message - Human-readable description.
 * @property {'error'|'warning'|'info'} severity - Error severity.
 * @property {number} [line] - Optional 1-based source line.
 * @property {number} [column] - Optional 1-based source column.
 * @property {string} [blockId] - Optional Blockly block identifier.
 */

/**
 * Creates a consistently shaped validation error.
 *
 * @param {Object} input
 * @param {string} input.type
 * @param {string} input.message
 * @param {'error'|'warning'|'info'} [input.severity='error']
 * @param {number} [input.line]
 * @param {number} [input.column]
 * @param {string} [input.blockId]
 * @returns {ValidationError}
 */

export function createValidationError({
    type,
    message,
    severity = 'error',
    line,
    column,
    blockId
}) {
    const error = {
        type,
        message,
        severity
    };

    if (line !== undefined) {
        error.line = line;
    }

    if (column !== undefined) {
        error.column = column;
    }

    if (blockId !== undefined) {
        error.blockId = blockId;
    }

    return error;
}