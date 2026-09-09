import { describe, expect, test } from "bun:test";
import { verifyDiscordSignature } from "../../src/transport/verify-signature.js";

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateKeyPair() {
  const keyPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as unknown as CryptoKeyPair;
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  return { keyPair, publicKey: bytesToHex(publicKeyRaw) };
}

async function sign(privateKey: CryptoKey, timestamp: string, body: string): Promise<string> {
  const message = new TextEncoder().encode(timestamp + body);
  const signature = await crypto.subtle.sign("Ed25519", privateKey, message);
  return bytesToHex(signature);
}

describe("verifyDiscordSignature", () => {
  test("accepts a genuinely valid signature over timestamp + body", async () => {
    const { keyPair, publicKey } = await generateKeyPair();
    const timestamp = "1700000000";
    const body = JSON.stringify({ type: 1 });
    const signature = await sign(keyPair.privateKey, timestamp, body);

    expect(await verifyDiscordSignature({ publicKey, signature, timestamp, body })).toBe(true);
  });

  test("rejects a signature when the body was tampered with after signing", async () => {
    const { keyPair, publicKey } = await generateKeyPair();
    const timestamp = "1700000000";
    const signature = await sign(keyPair.privateKey, timestamp, JSON.stringify({ type: 1 }));

    const tamperedBody = JSON.stringify({ type: 2 });
    expect(await verifyDiscordSignature({ publicKey, signature, timestamp, body: tamperedBody })).toBe(false);
  });

  test("rejects a signature when the timestamp was tampered with after signing", async () => {
    const { keyPair, publicKey } = await generateKeyPair();
    const body = JSON.stringify({ type: 1 });
    const signature = await sign(keyPair.privateKey, "1700000000", body);

    expect(await verifyDiscordSignature({ publicKey, signature, timestamp: "1700000001", body })).toBe(false);
  });

  test("rejects a signature produced by a different key pair", async () => {
    const { publicKey } = await generateKeyPair();
    const { keyPair: otherKeyPair } = await generateKeyPair();
    const timestamp = "1700000000";
    const body = JSON.stringify({ type: 1 });
    const signature = await sign(otherKeyPair.privateKey, timestamp, body);

    expect(await verifyDiscordSignature({ publicKey, signature, timestamp, body })).toBe(false);
  });

  test("returns false, never throws, for a malformed (non-hex) signature", async () => {
    const { publicKey } = await generateKeyPair();
    expect(
      await verifyDiscordSignature({ publicKey, signature: "not-hex!!", timestamp: "1700000000", body: "{}" }),
    ).toBe(false);
  });

  test("returns false, never throws, for a malformed (non-hex) public key", async () => {
    expect(
      await verifyDiscordSignature({
        publicKey: "not-hex!!",
        signature: "aa",
        timestamp: "1700000000",
        body: "{}",
      }),
    ).toBe(false);
  });

  test("returns false for an odd-length hex string rather than throwing", async () => {
    const { publicKey } = await generateKeyPair();
    expect(await verifyDiscordSignature({ publicKey, signature: "abc", timestamp: "1700000000", body: "{}" })).toBe(
      false,
    );
  });

  test("returns false for a well-formed but wrong-length public key rather than throwing", async () => {
    expect(
      await verifyDiscordSignature({
        publicKey: "aa".repeat(10),
        signature: "bb".repeat(64),
        timestamp: "1700000000",
        body: "{}",
      }),
    ).toBe(false);
  });
});
