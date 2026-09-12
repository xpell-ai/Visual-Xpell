# @xpell/example-module

Canonical example reusable Xpell server module for the Xpell Server Module Contract V1.

This package is intentionally small. It proves the reusable module layout, stable runtime identity, `_ops`, `_skill`, readiness, structured responses, explicit server registration, `_x.execute(...)` invocation, runtime skill discovery, and workspace development compatibility.

## Identity

- Runtime module ID: `example-module`
- Package name: `@xpell/example-module`
- Scope: `server`
- Config: none
- Secrets: none
- Permissions: none
- Side effects: none

## Operation

### `echo`

Returns the provided message.

Input:

```json
{
  "message": "hello"
}
```

Success:

```json
{
  "_ok": true,
  "_result": {
    "message": "hello"
  }
}
```

Invalid params:

```json
{
  "_ok": false,
  "_error": {
    "_code": "E_INVALID_PARAMS",
    "_message": "message is required",
    "_details": {
      "_field": "message",
      "_expected": "non-empty string"
    }
  }
}
```

## Registration

Register the module explicitly from the XNode server bootstrap:

```ts
import { createExampleModule } from "@xpell/example-module";

await node.start({
  _modules: [
    createExampleModule()
  ]
});
```

## Invocation

All external calls must use `_x.execute(...)`:

```ts
await _x.execute({
  _module: "example-module",
  _op: "echo",
  _params: {
    message: "hello"
  }
});
```

## Readiness

`get_readiness()` is safe to expose through runtime capability discovery:

```json
{
  "_ready": true,
  "_status": "ready",
  "_checks": {}
}
```

## Runtime Discovery

The module exports one canonical keyed `_ops` record and reuses it for `static _ops` and `_skill._ops`. Once loaded, it appears in the runtime skill snapshot returned by `_x.getSkills()`.

XMCP visibility is metadata-only unless a curated XMCP tool or future permissioned generic module invocation bridge explicitly exposes it.

## Development

```sh
pnpm -C modules/example-module build
pnpm -C modules/example-module test
```

The local workspace should include `xpell-vibe-starter/**`, which makes `modules/example-module` available as `@xpell/example-module` during development.
