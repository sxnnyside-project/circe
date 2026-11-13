/**
 * Circe testing framework entry point (`@sxnnyside/circe/testing`).
 *
 * @remarks
 * Provides an isolated, zero-network test kit to test bots implemented on Circe:
 * - Direct execution and full router testing for commands, subcommands, components, modals, context menus, and autocompletes.
 * - Access control guard evaluation.
 * - Discord event testing with unhandled error isolation.
 * - Fluent assertion helpers for replies, ephemeral flags, follow-ups, updates, modals, and logs.
 * - Deterministic Discord mock objects (`User`, `Guild`, `Member`, `Channel`, `Message`).
 *
 * @packageDocumentation
 */
export * from './testing/index.js';
