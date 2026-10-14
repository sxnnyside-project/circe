import { describe, expect, test } from 'bun:test';
import { SlashCommandBuilder } from 'discord.js';
import { CommandRegistry } from '../../../src/discord/commands/registry.js';
import type { CommandDefinition } from '../../../src/discord/commands/types.js';
import { defineCommand } from '../../../src/discord/commands/types.js';
import { DiscoveryConflictError } from '../../../src/errors/discovery-conflict-error.js';

function makeCommand(name: string): CommandDefinition {
  return {
    builder: new SlashCommandBuilder().setName(name).setDescription('test command'),
    execute: async () => {},
  };
}

describe('CommandRegistry', () => {
  test('registers and retrieves a command by name', () => {
    const registry = new CommandRegistry();
    const command = makeCommand('ping');

    registry.register(command);

    expect(registry.get('ping')).toBe(command);
    expect(registry.has('ping')).toBe(true);
    expect(registry.size).toBe(1);
  });

  test('returns undefined for an unknown command', () => {
    const registry = new CommandRegistry();
    expect(registry.get('missing')).toBeUndefined();
    expect(registry.has('missing')).toBe(false);
  });

  test('throws DiscoveryConflictError on duplicate command names, naming the conflicting identity', () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand('ping'));

    expect(() => registry.register(makeCommand('ping'))).toThrow(DiscoveryConflictError);
    try {
      registry.register(makeCommand('ping'));
      throw new Error('expected registration to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DiscoveryConflictError);
      expect((error as DiscoveryConflictError).reason).toBe('duplicate');
      expect((error as DiscoveryConflictError).identity).toBe('ping');
    }
  });

  test('throws DiscoveryConflictError when the builder has no name', () => {
    const registry = new CommandRegistry();
    const command = { builder: {}, execute: async () => {} };

    try {
      registry.register(command as unknown as CommandDefinition);
      throw new Error('expected registration to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DiscoveryConflictError);
      expect((error as DiscoveryConflictError).reason).toBe('missing-identity');
    }
  });

  test('exposes all registered command definitions', () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand('ping'));
    registry.register(makeCommand('pong'));

    const names = registry.all.map((command) => command.builder.name).sort();
    expect(names).toEqual(['ping', 'pong']);
  });

  test('two independent registries never share state', () => {
    const a = new CommandRegistry();
    const b = new CommandRegistry();

    a.register(makeCommand('only-in-a'));

    expect(a.size).toBe(1);
    expect(b.size).toBe(0);
  });

  test('regression: a command can carry bot-owned metadata without a type error', () => {
    const registry = new CommandRegistry();
    const command = defineCommand({
      builder: new SlashCommandBuilder().setName('kick').setDescription('kick a member'),
      metadata: { category: 'moderation', cooldownSeconds: 10 },
      execute: async () => {},
    });

    registry.register(command);

    const stored = registry.get('kick');
    expect(stored?.metadata as Record<string, unknown> | undefined).toEqual({
      category: 'moderation',
      cooldownSeconds: 10,
    });
  });
});
