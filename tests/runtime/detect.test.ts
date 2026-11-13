import { describe, expect, test } from 'bun:test';
import { detectRuntime } from '../../src/runtime/detect.js';

describe('detectRuntime', () => {
  test('returns bun when running under bun test', () => {
    expect(detectRuntime()).toBe('bun');
  });
});
