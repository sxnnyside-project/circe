import { describe, expect, test } from 'bun:test';
import type { LogEntry } from '../../src/logging/logger.js';
import type { TestReply } from '../../src/testing/interaction.js';
import { createTestExecutionResult } from '../../src/testing/result.js';

describe('createTestExecutionResult', () => {
  const reply1: TestReply = { content: 'Hello world!', ephemeral: false };
  const reply2: TestReply = { content: 'Secret info', ephemeral: true };
  const followUp1: TestReply = { content: 'Second page' };

  const log1: LogEntry = {
    level: 'info',
    message: 'User logged in',
    timestamp: new Date().toISOString(),
    correlationId: 'c1',
    metadata: {},
  };
  const log2: LogEntry = {
    level: 'error',
    message: 'Failed to query database',
    timestamp: new Date().toISOString(),
    correlationId: 'c2',
    metadata: {},
  };

  test('exposes reply, followUp, replies, followUps, and logs getters', () => {
    const result = createTestExecutionResult({
      replies: [reply1, reply2],
      followUps: [followUp1],
      logs: [log1, log2],
    });

    expect(result.reply).toEqual(reply1);
    expect(result.followUp).toEqual(followUp1);
    expect(result.replies).toHaveLength(2);
    expect(result.followUps).toHaveLength(1);
    expect(result.logs).toHaveLength(2);
  });

  test('handles empty results cleanly', () => {
    const result = createTestExecutionResult({
      replies: [],
      followUps: [],
      logs: [],
    });

    expect(result.reply).toBeUndefined();
    expect(result.followUp).toBeUndefined();
    expect(result.hasReply()).toBe(false);
    expect(result.hasEphemeralReply()).toBe(false);
    expect(result.hasFollowUp()).toBe(false);
    expect(result.hasLog('error')).toBe(false);
  });

  test('evaluates hasReply with string substring, regex, and predicate', () => {
    const result = createTestExecutionResult({
      replies: [reply1, reply2],
      followUps: [],
      logs: [],
    });

    expect(result.hasReply()).toBe(true);
    expect(result.hasReply('world')).toBe(true);
    expect(result.hasReply('nonexistent')).toBe(false);
    expect(result.hasReply(/Secret/)).toBe(true);
    expect(result.hasReply(/nonexistent/)).toBe(false);
    expect(result.hasReply((r) => r.content.startsWith('Hello'))).toBe(true);
  });

  test('evaluates hasEphemeralReply strictly on ephemeral replies', () => {
    const result = createTestExecutionResult({
      replies: [reply1, reply2],
      followUps: [],
      logs: [],
    });

    expect(result.hasEphemeralReply()).toBe(true);
    expect(result.hasEphemeralReply('Secret')).toBe(true);
    expect(result.hasEphemeralReply('Hello')).toBe(false); // reply1 is not ephemeral
  });

  test('evaluates hasFollowUp with string, regex, or predicate', () => {
    const result = createTestExecutionResult({
      replies: [],
      followUps: [followUp1],
      logs: [],
    });

    expect(result.hasFollowUp()).toBe(true);
    expect(result.hasFollowUp('Second')).toBe(true);
    expect(result.hasFollowUp('Third')).toBe(false);
    expect(result.hasFollowUp(/page$/)).toBe(true);
  });

  test('evaluates hasLog by severity level and optional message pattern', () => {
    const result = createTestExecutionResult({
      replies: [],
      followUps: [],
      logs: [log1, log2],
    });

    expect(result.hasLog('info')).toBe(true);
    expect(result.hasLog('info', 'logged in')).toBe(true);
    expect(result.hasLog('info', 'database')).toBe(false);
    expect(result.hasLog('error', /database/i)).toBe(true);
    expect(result.hasLog('warn')).toBe(false);
  });
});
