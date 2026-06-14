import { describe, expect, it } from 'bun:test';
import { aspectMatchesQuery } from '../../app/src/ui/search';

describe('aspectMatchesQuery', () => {
  it('returns true for an empty query', () => {
    expect(aspectMatchesQuery('', 'Ignis', 'fire')).toBe(true);
  });

  it('returns true for a whitespace-only query', () => {
    expect(aspectMatchesQuery('   ', 'Ignis', 'fire')).toBe(true);
  });

  it('matches a latin substring', () => {
    expect(aspectMatchesQuery('ign', 'Ignis', 'fire')).toBe(true);
  });

  it('matches a key substring', () => {
    expect(aspectMatchesQuery('fir', 'Ignis', 'fire')).toBe(true);
  });

  it('is case-insensitive on both query and fields', () => {
    expect(aspectMatchesQuery('IGNIS', 'ignis', 'FIRE')).toBe(true);
    expect(aspectMatchesQuery('Fire', 'Ignis', 'fire')).toBe(true);
  });

  it('trims surrounding whitespace before matching', () => {
    expect(aspectMatchesQuery('  ign  ', 'Ignis', 'fire')).toBe(true);
  });

  it('returns false when neither latin nor key contains the query', () => {
    expect(aspectMatchesQuery('aqua', 'Ignis', 'fire')).toBe(false);
  });
});
