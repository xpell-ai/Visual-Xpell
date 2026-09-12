import type { XpellSkill, XpellSkillCommand } from "@xpell/core";

export type JsonObject = Record<string, unknown>;

export type ExampleModuleConfig = Record<string, never>;

export type ExampleEchoParams = {
  message: string;
};

export type ExampleEchoResult = {
  message: string;
};

export type XpellModuleReadiness = {
  _ready: boolean;
  _status: "ready" | "not_ready" | "degraded";
  _missing_config?: string[];
  _missing_secrets?: string[];
  _checks?: Record<string, unknown>;
};

export type XpellModuleErrorCode =
  | "E_INVALID_PARAMS"
  | "E_NOT_READY"
  | "E_INTERNAL";

export type XpellModuleError = {
  _code: XpellModuleErrorCode;
  _message: string;
  _details?: JsonObject;
};

export type XpellModuleSuccess<T extends JsonObject> = {
  _ok: true;
  _result: T;
};

export type XpellModuleFailure = {
  _ok: false;
  _error: XpellModuleError;
};

export type XpellModuleResponse<T extends JsonObject> =
  | XpellModuleSuccess<T>
  | XpellModuleFailure;

export type ExampleModuleOperation = XpellSkillCommand & {
  _id: string;
  _input_schema: JsonObject;
  _output_schema: JsonObject;
  _errors: readonly XpellModuleErrorCode[];
  _permissions: readonly string[];
  _examples: readonly JsonObject[];
  _side_effects: "none";
  _scope: "server";
};

export type ExampleModuleSkill = XpellSkill & {
  _name: "example-module";
  _scope: "server";
  _package: "@xpell/example-module";
  _runtime: {
    _target: "xnode";
    _xpell_core: string;
    _xpell_node: string;
  };
  _ops: Readonly<Record<string, ExampleModuleOperation>>;
  _config: readonly JsonObject[];
  _secrets: readonly JsonObject[];
  _permissions: readonly string[];
  _readiness: {
    _ready: true;
    _status: "ready";
    _checks: readonly string[];
  };
  _examples: readonly JsonObject[];
};
