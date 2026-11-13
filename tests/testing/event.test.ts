import { describe, expect, test } from 'bun:test';
import { Events } from 'discord.js';
import { defineEvent } from '../../src/discord/events/types.js';
import { testEvent } from '../../src/testing/event.js';
import { createMockMessage } from '../../src/testing/mock.js';

describe('testEvent', () => {
  test('executes event handler without throwing and reports zero error logs', async () => {
    let executed = false;
    const readyEvent = defineEvent({
      name: Events.ClientReady,
      execute: (client) => {
        if (client.user?.tag === 'CirceBot#1234') {
          executed = true;
        }
      },
    });

    const fakeClient = { user: { tag: 'CirceBot#1234' } };
    const result = await testEvent(readyEvent, fakeClient as never);

    expect(executed).toBe(true);
    expect(result.hasLog('error')).toBe(false);
  });

  test('isolates throwing handler and records error log entry', async () => {
    const messageEvent = defineEvent({
      name: Events.MessageCreate,
      execute: () => {
        throw new Error('Message handler exploded');
      },
    });

    const mockMsg = createMockMessage({ content: '!crash' });
    const result = await testEvent(messageEvent, mockMsg as never);

    expect(result.hasLog('error', 'Message handler exploded')).toBe(true);
  });
});
