import { describe, it, expect } from 'vitest';
import { formatElevation, formatValue } from '../utils/fitParser';

describe('formatElevation', () => {
  it('rounds ascent and descent to whole metres', () => {
    // Derived from GPX geometry, so both arrive as long floats.
    expect(formatElevation(805.9166666666666, 6.2666666666666515)).toBe('+806m / -6m');
  });

  it('keeps integers from a FIT session unchanged', () => {
    expect(formatElevation(942, 25)).toBe('+942m / -25m');
  });

  it('omits the descent when it is absent', () => {
    expect(formatElevation(150.15, undefined)).toBe('+150m');
  });

  it('shows a zero descent rather than dropping it', () => {
    expect(formatElevation(323.1, 0)).toBe('+323m / -0m');
  });

  it('rounds a descent that would otherwise render as a long float', () => {
    expect(formatElevation(0.4, 25.166666666666572)).toBe('+0m / -25m');
  });
});

describe('formatValue: elevation totals', () => {
  it('renders total_ascent as whole metres', () => {
    expect(formatValue('total_ascent', 805.9166666666666)).toBe('806 m');
  });

  it('renders total_descent as whole metres', () => {
    expect(formatValue('total_descent', 6.2666666666666515)).toBe('6 m');
  });
});
