# Visual Xpell

Build and modify applications while they are running.

Visual Xpell combines a live Xpell runtime, a visual application editor, and an AI-assisted development workflow. It is the development environment for creating Xpell apps, inspecting them in the browser, applying deterministic runtime mutations, and persisting confirmed changes back to the running application.

[xpell.ai](https://xpell.ai)

## Why Visual Xpell

Most application workflows move through source edits before you can inspect the result:

```text
source change -> compile/build -> reload/deploy -> inspect result
```

Visual Xpell starts from the running app:

```text
running app -> describe or select a change -> apply -> see result immediately -> persist
```

For many UI changes, Visual Xpell can mutate the live Xpell view data directly and deterministically. AI can plan and generate artifacts, but runtime mutation and persistence stay explicit.

## What You Can Do

- Create applications from reusable starters.
- Plan an application conversationally through XVibe.
- Generate views, entities, flows, and behavior as Xpell data artifacts.
- Inspect the running application visually.
- Edit UI while the application is live.
- Apply deterministic live mutations for supported view changes.
- Persist confirmed app/view changes through the running Xpell server.
- Reuse XNode server capabilities from applications running on the server.
- Connect external agents, including Codex, to the live runtime through MCP.

## Quick Start

Current development prerequisites:

- Node.js `20.19+` or `22.x`.
- `pnpm`.
- `npm` for the package scripts in `client` and `server`.

```bash
git clone https://github.com/xpell-ai/visual-xpell.git
cd visual-xpell
```

From the parent Xpell workspace:

```bash
pnpm install
```

Configure the server:

```bash
cd visual-xpell/server
cp env.example .env
```

`server/env.example` currently includes Azure OpenAI placeholders. The current server entrypoint also reads these values for local runtime and XVibe generation:

```text
AIME_ENDPOINT
AIME_API_KEY
WORK_FOLDER
PORT
HOST
XPELL_STARTERS_ROOT
```

Start the server:

```bash
cd visual-xpell/server
npm run dev
```

The server defaults to port `3000`. If that port is already in use, set `PORT`, and update the client development configuration to point at the same server.

Start the client in another terminal:

```bash
cd visual-xpell/client
npm run dev
```

Vite serves the client at `/public/`, typically:

```text
http://localhost:5173/public/
```

For a local built run, build the client into `server/work/public`, then run the server:

```bash
cd visual-xpell/client
npm run build

cd ../server
npm run build
npm start
```

Development note: standalone install is not complete yet. The current manifests depend on sibling `workspace:*` Xpell packages, so install from a parent Xpell workspace until standalone package metadata is added.

## First App

Example tracker workflow:

1. Create a List / Tracker app.
2. Tell Visual Xpell: `I want to track how many grams of protein I eat each day.`
3. Review the generated plan.
4. Build the app from the plan.
5. Edit the running UI through Visual Xpell.
6. Persist the result.

Advanced server capabilities can be added as XNode modules and used by apps running on the server.

## Visual Xpell, Codex, and MCP

Visual Xpell handles the live visual application: inspect the running app, plan changes, apply supported runtime mutations, and persist confirmed results.

Codex is complementary. It can add backend/runtime capabilities in code when a reusable XNode module is the right layer. MCP connects Codex to the running Xpell system so it can inspect state, call exposed tools, and verify behavior against the live app.

Conceptually:

- Visual Xpell builds a tracker UI.
- Codex adds a reusable backend capability, such as image analysis, as an XNode module.
- MCP lets Codex verify or use that capability against the running application.

The same bridge can support ad-hoc live analysis. For example, a connected agent can query tracker data and summarize the last week. Codex is not required to use Visual Xpell.

In the current development server, MCP is mounted by the XNode runtime as an authenticated `/mcp` route. The exact tools available over MCP depend on the loaded runtime modules and MCP configuration.

## Repository Structure

```text
visual-xpell/
  client/
  server/
  shared/
  skills/
  docs/
```

- `client/` contains the browser Visual Xpell runtime built with `@xpell/ui`, XVM, XUI, and Vite.
- `server/` contains the XNode server entrypoint, local server modules, packaged app starters, and the runtime work folder.
- `shared/` is reserved for shared types and contracts; it is currently minimal.
- `skills/` contains Codex and runtime generation knowledge used to keep Xpell/XVibe output deterministic.
- `docs/` currently links to the repository agent contract.

## Server Modules

Visual Xpell runs on XNode. Reusable backend capabilities are implemented as XNode modules and invoked through Xpell commands.

This repository currently defines:

- `starter` for copying and expanding declared app starters.
- `xtest` as a small test module.

The server also loads XNode/Xpell capabilities from workspace packages, including ServerXVM persistence, XAI provider wiring, XVibe planning/editing, app/entity/flow support, Studio, and MCP. Reusable module packaging and broader module authoring are active development areas; this README does not treat future module packaging contracts as already complete in this repository.

## Architecture

```text
Visual Xpell
  -> XVibe planning and editing
  -> Xpell runtime on XNode
  -> ServerXVM persisted apps, views, flows, and entities
  -> XUI/XVM browser rendering
```

```text
Codex or external agent
  <-> XMCP / MCP
  <-> running Xpell server
```

Core boundaries:

- Xpell is the runtime/platform.
- Visual Xpell is the product and development environment.
- XVibe is the AI planning/editing capability used by Visual Xpell.
- XNode is the server/runtime layer.
- XMCP is the MCP bridge for external agents.
- ServerXVM is the authoritative app/view/flow persistence boundary.

## Development Commands

Server:

```bash
cd server
npm run build
npm run dev
npm start
npm test
```

Client:

```bash
cd client
npm run build
npm run dev
npm run preview
npm test
```

The test scripts are present. In the current checkout they need assertion updates before they can be treated as a passing release gate.

Docker files are present for the server path, but the compose file still uses development-era service naming and an external network. Review it before treating it as a production deployment target.

## Current Scope

Works today in this checkout:

- Local XNode server boot, ServerXVM-backed app/view loading, and persisted updates.
- Browser runtime loading through XVM/XUI over Wormholes.
- Starter-based app creation from `Empty`, `dashboard`, and `list` starters.
- Development MCP route mounted by XNode.

Current limitations:

- XVibe AI planning/editing requires configured provider credentials.
- Deterministic live mutations are limited to supported structured edit paths.
- MCP exposure is authenticated and depends on loaded runtime modules and configuration.
- Standalone installation, hosted SaaS deployment, arbitrary backend module generation, automatic MCP exposure of every operation, and production security hardening are not claimed by this repository today.

## License

MIT. See [LICENSE](LICENSE).
