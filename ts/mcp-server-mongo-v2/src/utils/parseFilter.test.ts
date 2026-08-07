import { describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { parseFilter } from './parseFilter.js';

describe('parseFilter', () => {
  it('returns an empty object for falsy or non-object input', () => {
    expect(parseFilter(null)).toEqual({});
    expect(parseFilter(undefined)).toEqual({});
    expect(parseFilter('not an object')).toEqual({});
  });

  it('converts 24-character hex strings to ObjectId in auto mode', () => {
    const result = parseFilter({ _id: '507f1f77bcf86cd799439011' });
    expect(result._id).toBeInstanceOf(ObjectId);
  });

  it('leaves strings untouched in none mode', () => {
    const result = parseFilter({ _id: '507f1f77bcf86cd799439011' }, 'none');
    expect(result._id).toBe('507f1f77bcf86cd799439011');
  });

  it('converts ISO date strings to Date objects', () => {
    const result = parseFilter({ createdAt: '2025-01-01T00:00:00Z' });
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('does not convert non-ObjectId 24-char strings', () => {
    const result = parseFilter({ code: 'zzzzzzzzzzzzzzzzzzzzzzzz' });
    expect(result.code).toBe('zzzzzzzzzzzzzzzzzzzzzzzz');
  });
});
