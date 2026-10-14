#!/usr/bin/env node
import { runBuild } from './build.js';
import { runDev } from './dev.js';
import { loadDotEnv } from './env.js';
import { renderInitResult, runInit } from './init.js';
import { completionScript, helpText, isShell, parseArgs, readVersion } from './interface.js';
import { runStart } from './start.js';

function usageError(message: string): void {
  process.stderr.write(`error: ${message}\nRun 'circe --help' for usage.\n`);
  process.exitCode = 2;
}

const parsed = parseArgs(process.argv.slice(2));

switch (parsed.kind) {
  case 'help':
    process.stdout.write(helpText());
    break;
  case 'version':
    process.stdout.write(`circe ${readVersion()}\n`);
    break;
  case 'completions':
    if (isShell(parsed.shell)) process.stdout.write(completionScript(parsed.shell));
    else usageError('completions requires a shell: bash, zsh, fish or powershell');
    break;
  case 'run':
    loadDotEnv(process.cwd());
    switch (parsed.command) {
      case 'start':
        await runStart(process.cwd());
        break;
      case 'dev':
        await runDev(process.cwd());
        break;
      case 'build':
        await runBuild(process.cwd());
        break;
      case 'init': {
        const result = await runInit(process.cwd());
        process.stdout.write(
          `${parsed.json ? JSON.stringify(result) : renderInitResult(result)}\n`,
        );
        break;
      }
      default:
        usageError(`unknown command: ${parsed.command ?? '(none)'}`);
    }
}
