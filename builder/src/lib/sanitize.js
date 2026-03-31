/**
 * Input validation and sanitization for BigQuery SQL construction.
 * All column names, view names, and identifiers that get interpolated
 * into SQL must pass through these validators.
 */

// Matches valid BQ identifiers: starts with letter/underscore, then alphanumeric/underscore
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validate that a string is a safe SQL identifier (column or view name).
 * Throws if invalid.
 */
export function validateIdentifier(value, label = 'identifier') {
  if (typeof value !== 'string' || !IDENTIFIER_RE.test(value)) {
    throw new Error(`Invalid ${label}: ${String(value).slice(0, 50)}`);
  }
  return value;
}

/**
 * Validate and return an integer. Throws if not a finite integer.
 */
export function validateInt(value, label = 'value') {
  if (value === null || value === undefined) {
    throw new Error(`Invalid ${label}: expected integer, got ${String(value)}`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`Invalid ${label}: expected integer, got ${String(value).slice(0, 50)}`);
  }
  return n;
}

/**
 * Escape a string for use inside a BigQuery single-quoted string literal.
 * BigQuery uses doubled single-quotes ('') for escaping, NOT backslash.
 */
export function escapeBqString(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * Safe arithmetic expression evaluator for metric formulas.
 * Only allows: numbers, +, -, *, /, (, ), whitespace, and decimal points.
 * Rejects anything else (function calls, variable access, etc.).
 */
export function safeEvalArithmetic(expression) {
  const expr = String(expression).trim();

  // Only allow: digits, decimal points, +, -, *, /, (, ), whitespace
  if (!/^[\d\s+\-*/().]+$/.test(expr)) {
    return 0;
  }

  // Reject empty parens, double operators, and other malformed expressions
  if (/\(\s*\)/.test(expr)) return 0;

  try {
    // Safe because we've validated the character set above
    const result = Function('"use strict"; return (' + expr + ')')();
    return Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

/**
 * Process a metric formula: substitute dependency values and evaluate SAFE_DIVIDE,
 * then evaluate the resulting arithmetic expression safely.
 *
 * @param {string} formula - e.g. "SAFE_DIVIDE({56}, {54})"
 * @param {Object<number, number>} depValues - map of metric ID → numeric value
 * @returns {number}
 */
export function evaluateFormula(formula, depValues) {
  let f = String(formula);

  // Replace {id} placeholders with numeric values
  for (const [depId, val] of Object.entries(depValues)) {
    f = f.replace(new RegExp(`\\{${depId}\\}`, 'g'), String(Number(val) || 0));
  }

  // Evaluate SAFE_DIVIDE(a, b) → (b === 0 ? 0 : a / b)
  f = f.replace(/SAFE_DIVIDE\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, (_, a, b) => {
    const numA = safeEvalArithmetic(a);
    const numB = safeEvalArithmetic(b);
    return String(numB === 0 ? 0 : numA / numB);
  });

  return safeEvalArithmetic(f);
}
