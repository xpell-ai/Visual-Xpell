# Xpell Module Contract

Canonical contract for reusable Xpell modules under `modules/*`.

Status: source-derived contract for Visual Xpell / Xpell Core / XNode / XUI / XMCP module packages.

This document defines:

```text
Xpell Module Contract
  -> Common Module Contract
  -> Server Module Profile
  -> Client Module Profile
  -> Shared / Multi-target Profile
```

## 1. Purpose

An Xpell module is a reusable runtime capability loaded into an Xpell runtime and invoked through the canonical command path.

This contract exists so a module can be:

- used by multiple apps
- developed locally as a workspace package under `modules/*`
- published later as an npm package
- discovered through runtime skill metadata
- summarized by XVibe and XMCP through supported capability paths
- created and maintained reliably by Codex

This contract standardizes the existing Xpell runtime model. It does not introduce automatic filesystem scanning, generic file upload, generic MCP invocation, live npm loading, or a parallel module system.

## 2. Current Source-Derived Facts

The following facts are part of this contract because they are true in the current codebase:

- Client modules are first-class `XModule`s.
- Server modules are first-class `XModule`s.
- `_x.execute({ _module, _op, _params })` is the canonical invocation path.
- Operation metadata is a keyed `_ops` record: `Record<string, XpellSkillCommand>`.
- Normal npm/workspace modules require install, build, explicit registration, and server/runtime restart today.
- Hot loading applies only to `module-creator` generated server JavaScript modules.
- `module-creator` hot loading is not a generic npm/workspace module loader.
- Generic Xpell file refs and generic upload are not implemented yet.
- Existing `.xapp` upload is specialized app-package transfer, not a generic file service.
- XVibe discovery differs for server skills and client-synced skills.
- XMCP remains curated and permissioned; it does not automatically expose every module operation as an MCP tool.

## 3. Non-Negotiable Runtime Rules

- Modules must extend `XModule` from the appropriate public Xpell runtime package.
- External execution must go through `_x.execute({ _module, _op, _params })`.
- Transport layers must not call module internals directly.
- Runtime/system fields must use `_snake_case`.
- Ordinary command params should use `snake_case`.
- Commands and metadata must be JSON-compatible.
- Persisted/generated handlers must be data-only. No function strings, `eval`, or persisted JavaScript callbacks.
- XData may be used only as runtime memory, not persistence.
- Missing state, config, auth, files, or schemas must be surfaced explicitly.
- Existing runtime capabilities must be inspected and reused before new abstractions are created.

## 4. Package Location

Reusable modules belong under:

```text
modules/<module-id>/
```

`modules/` is only a container folder. Each child folder is an independent npm-ready package.

Capability-first layout is preferred:

```text
modules/example-module/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts
    ExampleModule.ts
    contract.ts
    types.ts
  tests/
```

For multi-target modules, keep the package capability-first and split entrypoints inside the package:

```text
modules/food-label-analyzer/
  src/
    server/
    client/
    shared/
  tests/
```

Avoid making `modules/client/*` and `modules/server/*` the primary workspace structure. Runtime target is package metadata and profile behavior; package identity should remain the reusable capability.

## 5. Package Manifest

Each module must have its own `package.json`.

Required fields:

- `name`, usually `@xpell/<module-name>`
- `version`
- `type: "module"`
- `main`, `module`, and `types` pointing at built output
- `files` limiting published files to `dist`, README, and required metadata
- build and test scripts
- dependency or peer dependency declarations for Xpell runtime packages

Local development may use workspace dependencies. Published packages must replace workspace-only dependencies with compatible npm versions or peer dependency ranges.

Multi-target packages should use explicit subpath exports when both browser and server entrypoints exist:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./server": "./dist/server/index.js",
    "./client": "./dist/client/index.js",
    "./types": "./dist/shared/index.d.ts"
  }
}
```

Do not let server-only dependencies leak into client bundles.

## 6. Runtime Target Metadata

Every reusable module package must declare its intended runtime target in `_skill._runtime`.

Canonical target values:

```ts
type XpellModuleRuntimeTarget = "server" | "client" | "shared";
```

Use these profiles:

- `server`: loaded into XNode or another server Xpell runtime.
- `client`: loaded into the browser/XUI runtime.
- `shared`: package provides coordinated client and server entrypoints plus shared types/contracts.

Compatibility metadata may also name concrete hosts:

```ts
_runtime: {
  _target: "server",
  _hosts: ["xnode"],
  _xpell_core: ">=2.0.0",
  _xpell_node: ">=2.0.0"
}
```

Client example:

```ts
_runtime: {
  _target: "client",
  _hosts: ["xui"],
  _xpell_core: ">=2.0.0",
  _xpell_ui: ">=2.0.0"
}
```

## 7. Module Identity

Every module must define one stable runtime module ID per runtime entrypoint.

Rules:

- IDs are lowercase kebab-case.
- IDs are stable across package versions.
- IDs are not app-specific.
- Package name and runtime module ID should match where practical.
- Client and server entrypoints may share a module ID only when they are never loaded into the same runtime registry.

Example:

```ts
export const FOOD_LABEL_ANALYZER_MODULE_ID = "food-label-analyzer";

export class FoodLabelAnalyzerModule extends XModule {
  static _name = FOOD_LABEL_ANALYZER_MODULE_ID;
  _name = FOOD_LABEL_ANALYZER_MODULE_ID;
}
```

## 8. Command Contract

All app, XVibe, XMCP, and Codex examples must use:

```ts
await _x.execute({
  _module: "food-label-analyzer",
  _op: "analyze-label",
  _params: {
    _app_id: "pc-10",
    _env: "dev",
    image_ref: {
      _type: "temp-file",
      _id: "file_123"
    }
  }
});
```

Rules:

- `_module` is the runtime module ID.
- `_op` is the public operation ID.
- `_params` is JSON-compatible.
- `_params` must not contain raw transport objects.
- Large binary data must not be passed directly in `_params`.
- Gateway-owned fields such as `_ctx`, `_wid`, `_sid`, and `_auth` are trusted only when injected by XNode, Wormholes, XMCP, or another trusted runtime gateway.

## 9. Operation Metadata

Each operation must be declared in a keyed `_ops` record and exported as a constant.

The keyed record is the canonical operation metadata object. Reuse the same object for:

- the exported package constant
- `XModule.static _ops`
- `_skill._ops`
- Codex-generated module code and tests

Do not maintain a separate array form for the same operation metadata.

Runtime shape:

```ts
Record<string, XpellSkillCommand>
```

The record key must be the public operation ID used in `_x.execute({ _op })`. For new modules, operation IDs should be kebab-case and must match operation metadata `_id` and `_name`.

The XModule method name is derived from that public ID by replacing `-` with `_` and prefixing `_`; for example, `analyze-label` maps to `_analyze_label(...)`.

Required operation fields:

- `_id`
- `_name`
- `_description`
- `_input_schema`
- `_output_schema`
- `_errors`
- `_permissions`
- `_examples`
- `_side_effects`
- `_scope`

Example:

```ts
export const FOOD_LABEL_ANALYZER_OPS = {
  "analyze-label": {
    _id: "analyze-label",
    _name: "analyze-label",
    _description: "Analyze a food-label image and return structured nutrition candidates.",
    _input_schema: {
      type: "object",
      required: ["image_ref"],
      properties: {
        image_ref: { "$ref": "#/$defs/XpellFileRef" },
        _app_id: { type: "string" },
        _env: { type: "string" }
      }
    },
    _output_schema: {
      type: "object",
      required: ["items", "confidence"],
      properties: {
        items: { type: "array" },
        confidence: { type: "number", minimum: 0, maximum: 1 }
      }
    },
    _errors: ["E_INVALID_PARAMS", "E_NOT_READY", "E_PERMISSION_DENIED"],
    _permissions: ["food_label_analyzer:analyze_label"],
    _side_effects: "none",
    _scope: "app"
  }
} satisfies Record<string, XpellSkillCommand>;
```

Schemas should be JSON Schema-compatible. Zod or another validator may be used internally, but exported metadata must be serializable.

## 10. Skill Metadata

Each module must expose `static _skill`.

The `_skill` object is the canonical capability description for Xpell runtimes, XVibe, XMCP summaries, docs, and Codex. Its `_ops` field must reference the same keyed operation metadata object used by `static _ops`.

Required fields:

- `_name`
- `_scope`
- `_description`
- `_package`
- `_version`
- `_runtime`
- `_ops`
- `_config`
- `_secrets`
- `_permissions`
- `_readiness`
- `_examples`

Example:

```ts
export const FOOD_LABEL_ANALYZER_SKILL = {
  _name: "food-label-analyzer",
  _scope: "server",
  _description: "Analyzes food-label images for reusable nutrition workflows.",
  _package: "@xpell/food-label-analyzer",
  _version: "0.1.0",
  _runtime: {
    _target: "server",
    _hosts: ["xnode"]
  },
  _ops: FOOD_LABEL_ANALYZER_OPS,
  _config: [],
  _secrets: [],
  _permissions: ["food_label_analyzer:analyze_label"],
  _readiness: {
    _status: "unknown",
    _checks: ["config", "provider"]
  },
  _examples: []
};
```

The module class must reference the same objects:

```ts
export class FoodLabelAnalyzerModule extends XModule {
  static _skill = FOOD_LABEL_ANALYZER_SKILL;
  static _ops = FOOD_LABEL_ANALYZER_OPS;
}
```

Current XModule runtime discovery may serialize module exports as an operation list under `_exports._modules[*]._ops`. That list is a compatibility boundary, not a second source of truth. If a module declares `_exports._modules` itself, derive that list directly from the canonical record:

```ts
_exports: {
  _modules: [
    {
      _name: FOOD_LABEL_ANALYZER_MODULE_ID,
      _scope: "server",
      _description: "...",
      _ops: Object.values(FOOD_LABEL_ANALYZER_OPS)
    }
  ]
}
```

## 11. Configuration, Secrets, And Readiness

Reusable modules must not hardcode secrets, app IDs, filesystem paths, provider keys, or deployment-specific settings.

Modules must declare:

- required config
- optional config
- secret requirements
- defaults
- validation rules
- readiness impact when missing

Config may be supplied through the module factory, host settings, environment variables resolved by the host, or a future secret provider. The module contract declares needs; the host owns resolution.

Minimum readiness API:

```ts
get_readiness(): XpellModuleReadiness
```

Readiness shape:

```ts
type XpellModuleReadiness = {
  _ready: boolean;
  _status: "ready" | "not_ready" | "degraded";
  _missing_config?: string[];
  _missing_secrets?: string[];
  _checks?: Record<string, unknown>;
};
```

Rules:

- A module can be loaded and discoverable while not ready.
- Missing required config must make the module discoverable but not ready.
- Operation handlers that require missing config must produce structured `E_NOT_READY` or `E_MISSING_CONFIG` errors.
- Secret values must never appear in `_skill`, `_ops`, logs, errors, examples, XData, or MCP responses.

## 12. Permissions And Scope

Module metadata must declare required permissions per operation.

V1 enforcement is explicit and host-owned:

- XNode/Wormholes gateways enforce transport/auth policy.
- XUI/browser hosts enforce client runtime trust and bundle policy.
- XMCP tools enforce MCP-specific permissions.
- Server bootstrap or route policy decides which apps/users may invoke which module ops.
- Module operations must still reject clearly unauthorized or missing context when required by their own contract.

Do not assume that a globally installed module is callable by every app.

Recommended permission naming:

```text
<module_id>:<op_id>
food-label-analyzer:analyze-label
```

or, for system permission stores that require identifiers:

```text
food_label_analyzer:analyze_label
```

The chosen spelling must be documented in `_ops`.

The core module registry is runtime-global. App/env scoping must be explicit.

Operations that read or write app-owned data must require:

- `_app_id`
- `_env`

Rules:

- Do not infer `_app_id` from global state.
- Do not default production writes to `dev`.
- Do not let one app read another app's data without explicit authorization.
- Server-global operations must declare `_scope: "server"`.
- Client-global operations must declare `_scope: "client"`.
- App-scoped operations must declare `_scope: "app"`.

## 13. File References

Generic Xpell file refs and generic upload are not implemented yet.

The following provisional shape may be used only as a design placeholder in module metadata and docs until a canonical file service exists:

```ts
type XpellFileRef = {
  _type: "xdb-file" | "temp-file" | "app-asset" | "url";
  _id?: string;
  _path?: string;
  _url?: string;
  _mime_type?: string;
  _size_bytes?: number;
  _app_id?: string;
  _env?: string;
};
```

Current source-derived file behavior:

- `.xapp` upload exists for app-package import/export.
- `.xapp` upload returns `_package_ref`, `_filename`, `_size`, `_sha256`, and `_expires_at`.
- `.xapp` upload refs are temporary package-transfer refs, not generic file refs.
- XDB has internal file/temp storage primitives, but no public generic upload/ref module operation.

Rules until a canonical file service exists:

- Do not create per-module upload systems.
- Do not treat `.xapp` package refs as generic file refs.
- Do not pass large raw bytes through `_params`.
- Reject unsupported or unknown file ref types.
- Reject local paths unless the trusted host explicitly allows them.
- Validate file type and size before processing.
- Enforce app/user/env authorization for private files.

## 14. Errors

Operation failures must be structured.

Recommended error codes:

- `E_INVALID_PARAMS`
- `E_NOT_READY`
- `E_MISSING_CONFIG`
- `E_MISSING_SECRET`
- `E_PERMISSION_DENIED`
- `E_NOT_FOUND`
- `E_UNSUPPORTED_FILE_REF`
- `E_PROVIDER_ERROR`
- `E_TIMEOUT`
- `E_INTERNAL`

Failure shape:

```ts
{
  _ok: false,
  _error: {
    _code: "E_INVALID_PARAMS",
    _message: "image_ref is required",
    _details: {}
  }
}
```

Success shape:

```ts
{
  _ok: true,
  _result: {}
}
```

Modules may use existing Xpell response/error helpers when available, but serialized output must remain JSON-compatible and transport-safe.

## 15. Common Lifecycle

Supported hooks:

- constructor/factory for dependency injection and config
- `load()` / `onLoad()` for runtime load
- `onFrame()` only when necessary

Recommended additions for reusable modules:

- `get_readiness()`
- `dispose()` only when the host supports or intentionally calls it

Rules:

- Do not start hidden polling loops.
- Do not open network connections during import.
- Do not perform irreversible work in the constructor.
- Keep load deterministic and idempotent where possible.
- If teardown is needed, document it because generic unload/reload is not guaranteed today.

## 16. Server Module Profile

A server module runs in XNode or another server Xpell runtime.

Server modules may use:

- Node/server APIs allowed by the host
- server persistence adapters
- provider clients
- server secrets resolved by the host
- XNode modules and server runtime facilities

Server modules must not import browser-only APIs.

Implementation requirements:

- extend `XModule`
- expose stable `_name`
- expose `static _ops`
- expose `static _skill`
- set `_skill._scope` to `"server"` or `"app"` as appropriate
- set `_skill._runtime._target` to `"server"`
- export a factory function as the preferred registration surface
- accept canonical command execution through `_x.execute({ _module, _op, _params })`

Server operation methods should accept the command object:

```ts
async _analyze_label(xcmd: XCommand): Promise<XDataLike> {
  const params = xcmd._params ?? {};
  return { _ok: true, _result: {} };
}
```

### Server Registration

Normal server module registration is explicit.

The server must import the module package and pass an instance to the XNode/module loading path.

Example:

```ts
import { createFoodLabelAnalyzerModule } from "@xpell/food-label-analyzer/server";

const modules = [
  createFoodLabelAnalyzerModule({
    provider: "xai",
    max_image_bytes: 5_000_000
  })
];

await XNode.start({
  _modules: modules
});
```

Rules:

- Do not rely on scanning `modules/*`.
- Do not auto-load packages just because they are installed.
- Do not hide registration in side-effect imports.
- Keep server bootstrap as the auditable source of enabled capabilities.

### Server Lifecycle And Hot Loading

Normal npm/workspace modules currently require:

```text
install -> build -> explicit registration -> restart
```

Hot loading currently applies only to `module-creator` generated server JavaScript modules.

`module-creator` generated modules:

- are generated as JavaScript, not TypeScript
- are stored under the XNode work folder
- are registered in the generated module registry
- are dynamically imported by `module-creator`
- can be loaded into a running XNode process
- can autoload across restart from registry state
- expose `_skill` and `_ops` after loading

Current `module-creator` limitations:

- server target only
- no generic npm/workspace package loading
- no package-manager integration
- no arbitrary dependency imports
- no general reload support
- no general unload support
- no substitute for explicit registration of normal packages

## 17. Client Module Profile

A client module runs in the browser/XUI runtime.

Client modules are first-class `XModule`s.

Client modules may use:

- browser APIs
- XUI runtime services
- browser-side XData and XEM behavior
- explicit client transports exposed by XUI
- browser-safe libraries included by the app bundle

Client modules must not import Node-only APIs, server persistence, filesystem APIs, or server-only packages.

Implementation requirements:

- extend `XModule`
- expose stable `_name`
- expose `static _ops`
- expose `static _skill`
- set `_skill._scope` to `"client"` or `"app"` as appropriate
- set `_skill._runtime._target` to `"client"`
- use `_skill._type` or exported skill metadata compatible with existing `client-module-api` discovery
- accept canonical command execution through browser `_x.execute({ _module, _op, _params })`

Client registration is explicit through the browser/XUI runtime. Existing XUI runtime loading supports built-in client modules and caller-provided modules.

Example shape:

```ts
await XUIRuntime.loadApp({
  _modules: [
    createLabelAnalyzerClientModule()
  ]
});
```

Rules:

- Do not rely on browser filesystem scanning.
- Do not auto-load installed packages.
- Do not load arbitrary remote scripts as modules.
- Keep app bootstrap or XUI runtime configuration as the auditable source of enabled client capabilities.
- Treat client-authored auth/session fields as untrusted.

## 18. Shared / Multi-target Profile

A shared or multi-target module package provides coordinated client and server entrypoints plus shared types/contracts.

Valid package shape:

```text
modules/example-capability/
  src/
    client/
      index.ts
      ExampleClientModule.ts
    server/
      index.ts
      ExampleServerModule.ts
    shared/
      contract.ts
      types.ts
```

Rules:

- Client entrypoints must not import server entrypoints.
- Server entrypoints must not import browser-only client entrypoints.
- Shared code must stay platform-neutral.
- Shared code may define schemas, types, operation IDs, and JSON-compatible helpers.
- Each runtime entrypoint must declare its own `_skill`, `_ops`, and target metadata when behavior differs.
- Shared operation IDs may be reused only when input/output semantics are compatible.

Multi-target packages fit the current ESM/build model only if package exports and bundling boundaries prevent accidental cross-runtime imports.

## 19. XVibe Discovery

XVibe discovery is target-sensitive today.

Server capability visibility:

- server module is installed
- server module is explicitly registered and loaded
- server `_x.getSkills()` includes the module skill
- XVibe refreshes or receives runtime skill state

Client capability visibility:

- client module is loaded into the browser/XUI runtime
- browser `_x.getSkills()` includes the client skill
- client runtime skill sync sends that skill state to XVibe
- XVibe stores or reads the app/env-scoped client skill snapshot

The `_skill` metadata must give XVibe enough information to decide:

- target runtime
- what the capability does
- when to use it
- operation names
- input/output shapes
- examples
- readiness
- missing config
- permission requirements

XVibe must not assume a missing module exists. If a needed capability is absent, it should ask for or suggest Codex/source work rather than inventing runtime behavior.

## 20. XMCP Discovery

XMCP remains curated and permissioned.

A compliant module may appear in runtime capability summaries if loaded skill metadata is included. It does not automatically become an MCP tool.

For direct Codex invocation through MCP, one of these must exist:

- a curated XMCP tool for the module/op
- a future generic module invocation MCP tool with strict permission and schema enforcement
- a project-specific MCP bridge added intentionally

XMCP-facing metadata must be safe:

- no secrets
- no raw local paths unless explicitly allowed
- no private user data
- no hidden capabilities
- no unauthenticated dangerous ops

## 21. Security

Always:

- validate external params
- reject unknown file ref types
- reject unsupported MIME types
- enforce max input sizes
- set timeouts around external providers
- redact secrets from logs/errors
- avoid logging user payloads unless explicitly safe
- avoid arbitrary local file reads
- avoid shell execution unless the module is explicitly a controlled execution module
- keep provider/network permissions narrow and documented
- declare side effects in operation metadata

Dynamic loading and generic file access are high-risk.

Admin/developer-only operations must include:

- module generation
- module loading
- package live loading if it is added later
- arbitrary local path access
- generic file service administration
- MCP-exposed mutation/runtime-control operations

Dangerous operations must require explicit host policy and must not be exposed to generic MCP or client callers by default.

## 22. Testing Contract

Each module must include focused tests for:

- package exports
- construction and `_name`
- `static _ops`
- `static _skill`
- target metadata
- load/registration with the correct Xpell runtime
- `_x.execute` success path
- invalid params
- missing config/readiness
- permission or missing context behavior when relevant
- app/env scoping when relevant
- file ref validation when relevant
- structured error shape

Server integration tests should verify:

- server imports the package
- server explicitly registers the module
- server `_x.getSkills()` includes module skill metadata
- XMCP capability summary includes the loaded module when supported

Client integration tests should verify:

- browser/XUI runtime imports the package
- browser/XUI runtime explicitly registers the module
- browser `_x.execute` can call the module
- browser `_x.getSkills()` includes module skill metadata
- XVibe receives client skill state when client skill sync is in scope

Tests must not require live external secrets by default. Provider-backed tests should use mocks or be explicitly opt-in.

## 23. Versioning

Modules must use semver.

Breaking changes include:

- changing runtime module ID
- removing or renaming an operation
- changing required params
- changing output schema incompatibly
- changing permission requirements in a way that breaks existing callers
- changing runtime target
- changing file ref support incompatibly

Non-breaking changes include:

- adding optional params
- adding operations
- adding output fields
- improving readiness detail
- expanding examples

The `_skill._version` should match the package version unless the runtime later introduces independent skill schema versioning.

## 24. Codex-Facing Requirements

Codex must follow this procedure when creating or changing a module:

1. Read this contract and the installed `xpell-module` skill.
2. Inspect existing repo/module patterns before editing.
3. Check whether the capability already exists.
4. Determine runtime target: `server`, `client`, or `shared`.
5. Create or update one package under `modules/<module-id>`.
6. Keep the module standalone and npm-ready.
7. Implement each runtime entrypoint as an `XModule`.
8. Define the canonical keyed `_ops` record and `_skill` before wiring consumers.
9. Add input/output/error schemas.
10. Declare config, secrets, readiness, permissions, scope, side effects, and target metadata.
11. Add tests before or with implementation.
12. Register the module explicitly in the correct runtime.
13. Build and run relevant tests.
14. Verify runtime discovery through `_x.getSkills()` and the supported XVibe/XMCP capability path when applicable.
15. Document install, config, operations, and examples in the module README.

Codex must not:

- create hidden runtime behavior
- add auto-discovery unless explicitly requested
- store secrets in source
- pass raw bytes through `_params`
- invent Xpell APIs without inspecting source
- create a file upload service inside an individual module
- expose module ops through MCP without explicit permission design
- claim npm/workspace hot loading exists without implementing and securing it first

## 25. Minimal Server Module Shape

```ts
import { XModule, type XCommand } from "@xpell/core";
import type { XpellSkillCommand } from "@xpell/core";

export const EXAMPLE_MODULE_ID = "example-module";

export const EXAMPLE_MODULE_OPS = {
  echo: {
    _id: "echo",
    _name: "echo",
    _description: "Return the provided message.",
    _input_schema: {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string" }
      }
    },
    _output_schema: {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string" }
      }
    },
    _errors: ["E_INVALID_PARAMS"],
    _permissions: [],
    _examples: [],
    _side_effects: "none",
    _scope: "server"
  }
} satisfies Record<string, XpellSkillCommand>;

export const EXAMPLE_MODULE_SKILL = {
  _name: EXAMPLE_MODULE_ID,
  _scope: "server",
  _description: "Canonical example reusable Xpell server module.",
  _package: "@xpell/example-module",
  _version: "0.1.0",
  _runtime: {
    _target: "server",
    _hosts: ["xnode"]
  },
  _ops: EXAMPLE_MODULE_OPS,
  _config: [],
  _secrets: [],
  _permissions: [],
  _readiness: {
    _status: "ready",
    _checks: []
  },
  _examples: [
    {
      _module: EXAMPLE_MODULE_ID,
      _op: "echo",
      _params: { message: "hello" }
    }
  ]
};

export class ExampleModule extends XModule {
  static _name = EXAMPLE_MODULE_ID;
  static _ops = EXAMPLE_MODULE_OPS;
  static _skill = EXAMPLE_MODULE_SKILL;

  _name = EXAMPLE_MODULE_ID;

  get_readiness() {
    return {
      _ready: true,
      _status: "ready" as const,
      _checks: {}
    };
  }

  async _echo(xcmd: XCommand) {
    const message = xcmd._params?.message;

    if (typeof message !== "string" || message.length === 0) {
      return {
        _ok: false,
        _error: {
          _code: "E_INVALID_PARAMS",
          _message: "message is required"
        }
      };
    }

    return {
      _ok: true,
      _result: { message }
    };
  }
}

export function createExampleModule(): ExampleModule {
  return new ExampleModule();
}
```

## 26. Minimal Client Module Shape

```ts
import { XModule, type XCommand } from "@xpell/core";
import type { XpellSkillCommand } from "@xpell/core";

export const LABEL_ANALYZER_CLIENT_MODULE_ID = "label-analyzer";

export const LABEL_ANALYZER_CLIENT_OPS = {
  analyze: {
    _id: "analyze",
    _name: "analyze",
    _description: "Analyze browser-provided label data locally.",
    _input_schema: {
      type: "object",
      properties: {
        text: { type: "string" }
      }
    },
    _output_schema: {
      type: "object"
    },
    _errors: ["E_INVALID_PARAMS"],
    _permissions: [],
    _examples: [],
    _side_effects: "none",
    _scope: "client"
  }
} satisfies Record<string, XpellSkillCommand>;

export const LABEL_ANALYZER_CLIENT_SKILL = {
  _name: LABEL_ANALYZER_CLIENT_MODULE_ID,
  _type: "client-module-api",
  _scope: "client",
  _description: "Browser-local label analysis capability.",
  _package: "@xpell/label-analyzer",
  _version: "0.1.0",
  _runtime: {
    _target: "client",
    _hosts: ["xui"]
  },
  _ops: LABEL_ANALYZER_CLIENT_OPS,
  _config: [],
  _secrets: [],
  _permissions: [],
  _readiness: {
    _status: "ready",
    _checks: []
  },
  _examples: []
};

export class LabelAnalyzerClientModule extends XModule {
  static _name = LABEL_ANALYZER_CLIENT_MODULE_ID;
  static _ops = LABEL_ANALYZER_CLIENT_OPS;
  static _skill = LABEL_ANALYZER_CLIENT_SKILL;

  _name = LABEL_ANALYZER_CLIENT_MODULE_ID;

  async _analyze(xcmd: XCommand) {
    const text = xcmd._params?.text;
    return {
      _ok: true,
      _result: { text }
    };
  }
}
```

## 27. Implementation Phases

Recommended order:

1. Keep this contract and the installed `xpell-module` skill aligned.
2. Add or update a reusable server example module only when requested.
3. Add or update a reusable client example module only when requested.
4. Add target-aware tests for `_x.getSkills()` and `_x.execute` across server and client runtimes.
5. Design a canonical file service before building file-consuming modules.
6. Extend XVibe/XMCP capability summaries only through explicit, permissioned paths.
7. Consider a secure npm/workspace live loader only after allowlists, build paths, ESM cache behavior, rollback, and unload semantics are designed.
8. Build `food-label-analyzer` as a server-first demo after canonical file refs exist.

## 28. Final Decision

Use `modules/*` for local reusable Xpell modules.

Each module under `modules/*` must be a standalone npm-ready package.

Use a common Xpell module contract plus target-specific profiles.

Registration must be explicit in the relevant runtime.

The canonical module metadata source is `_skill`.

The canonical operation metadata source is one keyed `_ops` record: `Record<string, XpellSkillCommand>`.

XVibe should discover and consume loaded capabilities, but server and client discovery paths differ.

Codex should create and maintain module source packages.

XMCP should summarize loaded capabilities now and expose direct invocation only through explicit curated or future schema-enforced tools.
