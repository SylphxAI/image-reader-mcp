import { describe, expect, it } from 'bun:test';
import { ErrorCode, ImageError } from '../src/utils/errors.js';

describe('ErrorCode', () => {
  it('maps to JSON-RPC reserved error numbers', () => {
    expect(ErrorCode.InvalidParams).toBe(-32602);
    expect(ErrorCode.InvalidRequest).toBe(-32600);
    expect(ErrorCode.MethodNotFound).toBe(-32601);
  });
});

describe('ImageError', () => {
  it('carries code and message', () => {
    const err = new ImageError(ErrorCode.InvalidParams, 'bad path');

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ImageError);
    expect(err.name).toBe('ImageError');
    expect(err.code).toBe(ErrorCode.InvalidParams);
    expect(err.message).toBe('bad path');
  });
});
