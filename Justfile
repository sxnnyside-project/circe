# Install dependencies and set up git hooks.
install:
    bun install

# Start the local dev loop (watch mode).
dev:
    bun run dev

# Produce build artifacts in dist/.
build:
    bun run build

# Run the test suite.
test:
    bun run test

# Run the TypeScript compiler in check-only mode.
typecheck:
    bun run typecheck

# Run static analysis (Biome).
lint:
    bun run lint

# Apply formatting (Biome).
format:
    bun run format

# Cross-runtime transport benchmark (not part of check: timing is noisy).
bench:
    bun run bench

# Full quality gate — this is what CI runs.
check:
    bun run check

# Write RELEASE_NOTES.md for the latest tag from Conventional Commits (needs git-cliff).
changelog:
    git-cliff --latest --strip header --config cliff.toml --output RELEASE_NOTES.md

# Load the built package and run its CLI on every supported runtime (needs node and deno).
smoke: build
    node scripts/smoke.mjs
    deno run -A scripts/smoke.mjs
    bun scripts/smoke.mjs
    node dist/cli/index.js --version
    deno run -A dist/cli/index.js --version

# Build into dist-node/ with Node's toolchain only (npm scripts + tsc, no Bun), then load it on Node.
build-node:
    npm run build:node
    CIRCE_DIST=dist-node node scripts/smoke.mjs

# Build into dist-node/ with Deno's toolchain only (deno tasks, no Bun or npm), then load it on Deno.
build-deno:
    deno task build
    deno task smoke

# Remove build artifacts.
clean:
    bun run clean
