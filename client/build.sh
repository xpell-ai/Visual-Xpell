set -eu

pnpm build
node tests/runtime-bundle.test.mjs
