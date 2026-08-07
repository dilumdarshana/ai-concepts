import { describe, expect, it, vi } from 'vitest';
import { handleQueryTool } from './query.js';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('handleQueryTool', () => {
  it('returns formatted results from the collection', async () => {
    const docs = [{ _id: '1', name: 'foo' }];
    const collection = {
      find: vi
        .fn()
        .mockReturnValue({ toArray: vi.fn().mockResolvedValue(docs) }),
    };
    const db = { collection: vi.fn().mockReturnValue(collection) };

    const result = await handleQueryTool(
      { collection: 'users' },
      db as any,
      true,
      logger as any,
    );

    expect(db.collection).toHaveBeenCalledWith('users');
    expect(collection.find).toHaveBeenCalled();
    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(docs);
  });

  it('returns an error object when the query throws', async () => {
    const collection = {
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockRejectedValue(new Error('boom')),
      }),
    };
    const db = { collection: vi.fn().mockReturnValue(collection) };

    const result = await handleQueryTool(
      { collection: 'users' },
      db as any,
      true,
      logger as any,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/boom/);
  });
});
