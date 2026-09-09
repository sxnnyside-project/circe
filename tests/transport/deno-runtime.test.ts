import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { $ } from "bun";

const DENO_AVAILABLE = await Bun.which("deno");

/**
 * Verifies the HTTP transport against a *real* Deno process — not just
 * the code paths written for it. Skips (never fails) when `deno` isn't on
 * PATH, since not every environment running this suite has it installed;
 * where it is available, this is the actual claim `docs/deployment/deno.md`
 * makes, checked automatically rather than asserted from memory of a one-off
 * manual run.
 */
describe.skipIf(!DENO_AVAILABLE)("HTTP transport on a real Deno process", () => {
  test("Deno.serve answers a real signed PING and dispatches a real interaction", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "circe-deno-"));
    const circeRoot = path.join(import.meta.dirname, "..", "..");

    try {
      await mkdir(path.join(dir, "circe-dist"), { recursive: true });
      await $`cp -r ${path.join(circeRoot, "dist")}/. ${path.join(dir, "circe-dist")}/`.quiet();

      await writeFile(
        path.join(dir, "deno.json"),
        JSON.stringify({ imports: { "discord.js": "npm:discord.js@14.27.0" } }),
      );

      await writeFile(
        path.join(dir, "test.mjs"),
        `
        import { Client } from "discord.js";
        import { createInteractionsHandler, startInteractionsServer } from "./circe-dist/index.js";

        function toHex(bytes) {
          return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
        }

        const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
        const publicKey = toHex(await crypto.subtle.exportKey("raw", keyPair.publicKey));
        const client = new Client({ intents: [] });
        const logger = { debug(){}, info(){}, warn(){}, error(){}, child(){ return logger; } };
        const handler = createInteractionsHandler({ client, publicKey, logger });
        const server = startInteractionsServer({ port: 9913, fetch: handler, logger });

        const timestamp = String(Math.floor(Date.now() / 1000));
        const body = JSON.stringify({ type: 1 });
        const sig = toHex(await crypto.subtle.sign("Ed25519", keyPair.privateKey, new TextEncoder().encode(timestamp + body)));

        const res = await fetch("http://localhost:9913/interactions", {
          method: "POST",
          headers: { "x-signature-ed25519": sig, "x-signature-timestamp": timestamp },
          body,
        });

        console.log(JSON.stringify({ status: res.status, body: await res.json() }));
        await server.stop?.();
        client.destroy();
        `,
      );

      const result = await $`deno run --allow-all ${path.join(dir, "test.mjs")}`.quiet();
      const lastLine = result.stdout.toString().trim().split("\n").pop() ?? "";
      const parsed = JSON.parse(lastLine);

      expect(parsed.status).toBe(200);
      expect(parsed.body).toEqual({ type: 1 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
