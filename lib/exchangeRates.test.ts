import { describe, it, expect } from '@jest/globals';
import { convert } from './exchangeRates';

// Rates relative to EUR (the BASE), matching what fetchAndSave() injects
// at runtime (rates[BASE] = 1 added after the API response). These numbers
// are illustrative — the math is exercised, not the FX accuracy.
const rates = {
  EUR: 1,
  USD: 1.1,
  RON: 5,
  GBP: 0.85,
  HUF: 400,
  CHF: 0.95,
} as const;

describe('convert — cross-currency math', () => {
  it('same-currency conversion returns the input untouched', () => {
    expect(convert(123.45, 'EUR', 'EUR', rates)).toBe(123.45);
    expect(convert(0, 'USD', 'USD', rates)).toBe(0);
    expect(convert(-50, 'RON', 'RON', rates)).toBe(-50);
  });

  it('base → other applies the target rate directly', () => {
    // 1 EUR -> 1.1 USD
    expect(convert(1, 'EUR', 'USD', rates)).toBeCloseTo(1.1, 6);
    // 100 EUR -> 500 RON
    expect(convert(100, 'EUR', 'RON', rates)).toBeCloseTo(500, 6);
  });

  it('other → base divides by the source rate', () => {
    // 1.1 USD -> 1 EUR (rates[USD] = 1.1)
    expect(convert(1.1, 'USD', 'EUR', rates)).toBeCloseTo(1, 6);
    // 500 RON -> 100 EUR
    expect(convert(500, 'RON', 'EUR', rates)).toBeCloseTo(100, 6);
  });

  it('other → other routes through the base correctly', () => {
    // 1 USD -> RON: (1 / 1.1) EUR * 5 RON/EUR = 4.5454…
    expect(convert(1, 'USD', 'RON', rates)).toBeCloseTo(5 / 1.1, 6);
    // 1 GBP -> CHF: (1 / 0.85) * 0.95
    expect(convert(1, 'GBP', 'CHF', rates)).toBeCloseTo(0.95 / 0.85, 6);
  });

  it('round-trip is a near-identity (float-precision tolerance)', () => {
    // USD -> EUR -> USD must equal the original within float epsilon.
    const usdToEur = convert(100, 'USD', 'EUR', rates);
    const back = convert(usdToEur, 'EUR', 'USD', rates);
    expect(back).toBeCloseTo(100, 6);

    // Three-hop round-trip: USD -> RON -> GBP -> USD.
    const a = convert(250, 'USD', 'RON', rates);
    const b = convert(a, 'RON', 'GBP', rates);
    const c = convert(b, 'GBP', 'USD', rates);
    expect(c).toBeCloseTo(250, 4);
  });

  it('unknown currency falls back to identity (no NaN/throw)', () => {
    // Either side unknown -> we don't have enough info to convert; return
    // the amount untouched rather than NaN. Safer for the dashboard render.
    expect(convert(50, 'XYZ', 'EUR', rates)).toBe(50);
    expect(convert(50, 'EUR', 'XYZ', rates)).toBe(50);
    expect(convert(50, 'XYZ', 'ABC', rates)).toBe(50);
  });

  it('rate of 0 for source is treated as unknown (identity)', () => {
    // A rate of 0 is treated as "not loaded" — falling back rather than
    // dividing by zero matches the spirit of the unknown-currency case.
    const withZero = { ...rates, USD: 0 };
    expect(convert(100, 'USD', 'EUR', withZero)).toBe(100);
  });

  it('scales linearly (2× input ⇒ 2× output)', () => {
    const a = convert(100, 'USD', 'RON', rates);
    const b = convert(200, 'USD', 'RON', rates);
    expect(b).toBeCloseTo(a * 2, 6);
  });
});
