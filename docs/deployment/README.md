# Deployment Guides

Circe bots can be deployed across multiple JavaScript runtimes and hosting environments without changing application logic.

---

## Supported Runtimes

| Runtime | Guide | Key Features |
| :--- | :--- | :--- |
| **Bun** | [bun.md](bun.md) | Native `Bun.serve` HTTP transport, `bun:sqlite` cooldown storage, high-speed child-process reload. |
| **Node.js (22+)** | [node.md](node.md) | Standard ESM execution, PM2 process management, Docker, Kubernetes deployments with `node:http` bridge. |
| **Deno (2+)** | [deno.md](deno.md) | Native `Deno.serve` HTTP transport, explicit security permission model, `deno.json` import maps. |

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*
