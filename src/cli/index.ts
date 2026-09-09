#!/usr/bin/env node
import { runBuild } from "./build.js";
import { runDev } from "./dev.js";
import { renderInitResult, runInit } from "./init.js";
import { runStart } from "./start.js";

const command = process.argv[2];

switch (command) {
  case "start":
    await runStart(process.cwd());
    break;
  case "dev":
    await runDev(process.cwd());
    break;
  case "build":
    await runBuild(process.cwd());
    break;
  case "init": {
    const result = await runInit(process.cwd());
    process.stdout.write(`${renderInitResult(result)}\n`);
    break;
  }
  default:
    process.stderr.write(
      `Unknown command: ${command ?? "(none)"}\nUsage: circe init | circe start | circe dev | circe build\n`,
    );
    process.exitCode = 1;
}
