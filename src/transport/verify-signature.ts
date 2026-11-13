/**
 * Canonical request header name for Discord's Ed25519 signature.
 * @public
 */
export const DISCORD_SIGNATURE_HEADER = 'x-signature-ed25519' as const;

/**
 * Canonical request header name for Discord's interaction timestamp.
 * @public
 */
export const DISCORD_TIMESTAMP_HEADER = 'x-signature-timestamp' as const;

/**
 * Options for verifying a Discord Interactions Endpoint request.
 * @public
 */
export interface VerifySignatureOptions {
  /** Hex-encoded ed25519 public key from the Discord Developer Portal. */
  readonly publicKey: string;
  /** The `X-Signature-Ed25519` request header, hex-encoded. */
  readonly signature: string;
  /** The `X-Signature-Timestamp` request header. */
  readonly timestamp: string;
  /** The raw, unparsed request body — signing covers the exact bytes Discord sent, not a re-serialized JSON object. */
  readonly body: string;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | undefined {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    return undefined;
  }

  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Verifies a Discord Interactions Endpoint request using Ed25519 via the
 * standard Web Crypto API (`crypto.subtle`) — native in Bun, Node 22+, and
 * Deno, with zero external dependencies (no `tweetnacl` or native addons).
 *
 * @remarks
 * Security guarantees:
 * - Constant-time verification through native platform cryptography.
 * - Never throws: invalid hex encoding, malformed keys, or corrupted payloads return `false`.
 * - Requires exact raw request body bytes; re-serialized JSON cannot be verified.
 *
 * @example
 * ```ts
 * const isValid = await verifyDiscordSignature({
 *   publicKey: env.DISCORD_PUBLIC_KEY,
 *   signature: req.headers.get('x-signature-ed25519') ?? '',
 *   timestamp: req.headers.get('x-signature-timestamp') ?? '',
 *   body: rawBodyString,
 * });
 * ```
 *
 * @param options - Signature verification parameters.
 * @returns Promise resolving to `true` if signature is cryptographically valid, `false` otherwise.
 * @public
 */
export async function verifyDiscordSignature(options: VerifySignatureOptions): Promise<boolean> {
  const publicKeyBytes = hexToBytes(options.publicKey);
  const signatureBytes = hexToBytes(options.signature);

  if (!publicKeyBytes || !signatureBytes) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey('raw', publicKeyBytes, { name: 'Ed25519' }, false, [
      'verify',
    ]);
    const message = new TextEncoder().encode(options.timestamp + options.body);
    return await crypto.subtle.verify('Ed25519', key, signatureBytes, message);
  } catch {
    return false;
  }
}
