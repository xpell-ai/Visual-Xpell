import type { ExampleModuleOperation, ExampleModuleSkill } from "./types.js";

export const EXAMPLE_MODULE_ID = "example-module";
export const EXAMPLE_MODULE_PACKAGE = "@xpell/example-module";
export const EXAMPLE_MODULE_VERSION = "0.1.0";

export const EXAMPLE_MODULE_OPS = {
  echo: {
    _id: "echo",
    _name: "echo",
    _scope: "server",
    _description: "Return the provided message.",
    _input_schema: {
      type: "object",
      required: ["message"],
      additionalProperties: false,
      properties: {
        message: {
          type: "string",
          minLength: 1
        }
      }
    },
    _output_schema: {
      type: "object",
      required: ["message"],
      additionalProperties: false,
      properties: {
        message: {
          type: "string"
        }
      }
    },
    _errors: ["E_INVALID_PARAMS", "E_NOT_READY"],
    _permissions: [],
    _examples: [
      {
        _module: EXAMPLE_MODULE_ID,
        _op: "echo",
        _params: {
          message: "hello"
        }
      }
    ],
    _side_effects: "none"
  }
} as const satisfies Record<string, ExampleModuleOperation>;

export const EXAMPLE_MODULE_SKILL: ExampleModuleSkill = {
  _id: EXAMPLE_MODULE_ID,
  _name: EXAMPLE_MODULE_ID,
  _title: "Example Module",
  _scope: "server",
  _version: EXAMPLE_MODULE_VERSION,
  _active: true,
  _type: "server-module-api",
  _requires: ["xmodule"],
  _description: "Canonical example reusable Xpell server module.",
  _package: EXAMPLE_MODULE_PACKAGE,
  _runtime: {
    _target: "xnode",
    _xpell_core: ">=2.0.0",
    _xpell_node: ">=2.0.0"
  },
  _ops: EXAMPLE_MODULE_OPS,
  _config: [],
  _secrets: [],
  _permissions: [],
  _readiness: {
    _ready: true,
    _status: "ready",
    _checks: []
  },
  _exports: {
    _modules: [
      {
        _name: EXAMPLE_MODULE_ID,
        _scope: "server",
        _description: "Canonical example reusable Xpell server module.",
        _ops: Object.values(EXAMPLE_MODULE_OPS)
      }
    ]
  },
  _examples: [
    {
      _module: EXAMPLE_MODULE_ID,
      _op: "echo",
      _params: {
        message: "hello"
      }
    }
  ],
  _canonical_examples: [
    {
      _module: EXAMPLE_MODULE_ID,
      _op: "echo",
      _params: {
        message: "hello"
      }
    }
  ],
  _core_rules: [
    "Invoke through _x.execute with _module set to example-module.",
    "The echo operation is server-scoped and has no side effects.",
    "The module does not require config or secrets."
  ]
};
