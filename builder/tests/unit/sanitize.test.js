import { describe, it, expect } from 'vitest';
import {
  validateIdentifier,
  validateInt,
  escapeBqString,
  safeEvalArithmetic,
  evaluateFormula,
} from '../../src/lib/sanitize.js';

describe('validateIdentifier', () => {
  it('accepts valid SQL identifiers', () => {
    expect(validateIdentifier('v_trials')).toBe('v_trials');
    expect(validateIdentifier('SignupDate')).toBe('SignupDate');
    expect(validateIdentifier('Att_SEO')).toBe('Att_SEO');
    expect(validateIdentifier('Channel')).toBe('Channel');
    expect(validateIdentifier('_private')).toBe('_private');
    expect(validateIdentifier('col123')).toBe('col123');
  });

  it('rejects SQL injection attempts', () => {
    expect(() => validateIdentifier('1; DROP TABLE--')).toThrow('Invalid');
    expect(() => validateIdentifier('col OR 1=1')).toThrow('Invalid');
    expect(() => validateIdentifier('CONCAT(a,b)')).toThrow('Invalid');
    expect(() => validateIdentifier("col'; --")).toThrow('Invalid');
    expect(() => validateIdentifier('`backtick`')).toThrow('Invalid');
  });

  it('rejects empty and non-string values', () => {
    expect(() => validateIdentifier('')).toThrow('Invalid');
    expect(() => validateIdentifier(null)).toThrow('Invalid');
    expect(() => validateIdentifier(undefined)).toThrow('Invalid');
    expect(() => validateIdentifier(123)).toThrow('Invalid');
  });

  it('rejects identifiers starting with a number', () => {
    expect(() => validateIdentifier('123col')).toThrow('Invalid');
  });

  it('rejects strings with spaces', () => {
    expect(() => validateIdentifier('my column')).toThrow('Invalid');
  });

  it('includes custom label in error message', () => {
    expect(() => validateIdentifier('bad!', 'viewName')).toThrow('Invalid viewName');
  });
});

describe('validateInt', () => {
  it('accepts valid integers', () => {
    expect(validateInt(0)).toBe(0);
    expect(validateInt(12)).toBe(12);
    expect(validateInt(-1)).toBe(-1);
    expect(validateInt('6')).toBe(6);
  });

  it('rejects non-integers', () => {
    expect(() => validateInt(1.5)).toThrow('Invalid');
    expect(() => validateInt('abc')).toThrow('Invalid');
    expect(() => validateInt(NaN)).toThrow('Invalid');
    expect(() => validateInt(Infinity)).toThrow('Invalid');
    expect(() => validateInt(null)).toThrow('Invalid');
  });

  it('rejects SQL injection strings', () => {
    expect(() => validateInt('12; DROP TABLE')).toThrow('Invalid');
  });
});

describe('escapeBqString', () => {
  it('escapes single quotes using BQ doubling convention', () => {
    expect(escapeBqString("O'Brien")).toBe("O''Brien");
    expect(escapeBqString("it's")).toBe("it''s");
  });

  it('handles strings without quotes', () => {
    expect(escapeBqString('hello')).toBe('hello');
  });

  it('handles multiple quotes', () => {
    expect(escapeBqString("a'b'c")).toBe("a''b''c");
  });

  it('does NOT use backslash escaping', () => {
    const result = escapeBqString("test'value");
    expect(result).not.toContain("\\'");
    expect(result).toBe("test''value");
  });

  it('converts non-string values to strings', () => {
    expect(escapeBqString(123)).toBe('123');
    expect(escapeBqString(null)).toBe('null');
  });
});

describe('safeEvalArithmetic', () => {
  it('evaluates basic arithmetic', () => {
    expect(safeEvalArithmetic('2 + 3')).toBe(5);
    expect(safeEvalArithmetic('10 / 2')).toBe(5);
    expect(safeEvalArithmetic('3 * 4')).toBe(12);
    expect(safeEvalArithmetic('10 - 3')).toBe(7);
  });

  it('handles parentheses', () => {
    expect(safeEvalArithmetic('(2 + 3) * 4')).toBe(20);
    expect(safeEvalArithmetic('10 / (2 + 3)')).toBe(2);
  });

  it('handles decimals', () => {
    expect(safeEvalArithmetic('0.5 * 100')).toBe(50);
    expect(safeEvalArithmetic('1.5 + 2.5')).toBe(4);
  });

  it('returns 0 for division by zero (Infinity)', () => {
    expect(safeEvalArithmetic('1 / 0')).toBe(0);
  });

  it('rejects function calls', () => {
    expect(safeEvalArithmetic('alert(1)')).toBe(0);
    expect(safeEvalArithmetic('console.log(1)')).toBe(0);
    expect(safeEvalArithmetic('eval("1+1")')).toBe(0);
  });

  it('rejects variable access', () => {
    expect(safeEvalArithmetic('window')).toBe(0);
    expect(safeEvalArithmetic('document.cookie')).toBe(0);
    expect(safeEvalArithmetic('this')).toBe(0);
  });

  it('rejects string literals', () => {
    expect(safeEvalArithmetic('"hello"')).toBe(0);
    expect(safeEvalArithmetic("'hello'")).toBe(0);
  });

  it('rejects template literals', () => {
    expect(safeEvalArithmetic('`${alert(1)}`')).toBe(0);
  });

  it('rejects semicolons and assignment', () => {
    expect(safeEvalArithmetic('x=1;alert(1)')).toBe(0);
  });

  it('handles empty and whitespace', () => {
    expect(safeEvalArithmetic('')).toBe(0);
    expect(safeEvalArithmetic('   ')).toBe(0);
  });

  it('rejects empty parens', () => {
    expect(safeEvalArithmetic('()')).toBe(0);
  });
});

describe('evaluateFormula', () => {
  it('evaluates simple division formula', () => {
    // Conversion rate: conversions / trials
    const result = evaluateFormula('SAFE_DIVIDE({56}, {54})', { 56: 150, 54: 500 });
    expect(result).toBe(0.3);
  });

  it('handles SAFE_DIVIDE with zero denominator', () => {
    const result = evaluateFormula('SAFE_DIVIDE({56}, {54})', { 56: 150, 54: 0 });
    expect(result).toBe(0);
  });

  it('substitutes missing dependencies as 0', () => {
    // Both deps must be in depValues — missing ones get 0
    const result = evaluateFormula('{56} + {54}', { 56: 10, 54: 0 });
    expect(result).toBe(10);
  });

  it('handles formula where all deps are present', () => {
    const result = evaluateFormula('{56} + {54}', { 56: 10, 54: 5 });
    expect(result).toBe(15);
  });

  it('handles nested arithmetic after substitution', () => {
    const result = evaluateFormula('{1} + {2} * 2', { 1: 10, 2: 5 });
    expect(result).toBe(20);
  });

  it('rejects malicious formula content', () => {
    // Even if someone writes a malicious formula to Supabase, it should be blocked
    const result = evaluateFormula('alert(document.cookie)', {});
    expect(result).toBe(0);
  });

  it('rejects formula with constructor access', () => {
    const result = evaluateFormula('constructor.constructor("return this")()', {});
    expect(result).toBe(0);
  });

  it('handles real-world sync rate formula', () => {
    // Sync rate = syncs / trials
    const result = evaluateFormula('SAFE_DIVIDE({55}, {54})', { 55: 350, 54: 500 });
    expect(result).toBe(0.7);
  });

  it('handles chained SAFE_DIVIDE', () => {
    const result = evaluateFormula('SAFE_DIVIDE({1}, {2}) + SAFE_DIVIDE({3}, {4})', {
      1: 10, 2: 5, 3: 20, 4: 10,
    });
    expect(result).toBe(4);
  });
});
