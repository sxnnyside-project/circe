# Circe — task runner.
# Every recipe here is a thin wrapper over `bun run <script>` / `biome`.
# If `just` isn't available, run the underlying `bun run <name>` command directly —
# see package.json's "scripts" for the exact commands each recipe below calls.

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
    bun test

# Run the TypeScript compiler in check-only mode.
typecheck:
    bun run typecheck

# Run static analysis (Biome).
lint:
    bun run lint

# Apply formatting (Biome).
format:
    bun run format

# Full quality gate — this is what CI runs.
check:
    bun run check

# Remove build artifacts.
clean:
    bun run clean
