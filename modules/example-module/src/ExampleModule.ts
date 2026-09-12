import {
  XModule,
  type XCommand
} from "@xpell/core";

import {
  EXAMPLE_MODULE_ID,
  EXAMPLE_MODULE_OPS,
  EXAMPLE_MODULE_SKILL
} from "./contract.js";
import type {
  ExampleEchoResult,
  ExampleModuleConfig,
  XpellModuleFailure,
  XpellModuleReadiness,
  XpellModuleResponse
} from "./types.js";

function invalid_params(message: string, details?: Record<string, unknown>): XpellModuleFailure {
  return {
    _ok: false,
    _error: {
      _code: "E_INVALID_PARAMS",
      _message: message,
      ...(details ? { _details: details } : {})
    }
  };
}

export class ExampleModule extends XModule {
  static _name = EXAMPLE_MODULE_ID;
  static _ops = EXAMPLE_MODULE_OPS;
  static _skill = EXAMPLE_MODULE_SKILL;

  _name = EXAMPLE_MODULE_ID;

  constructor(_config: ExampleModuleConfig = {}) {
    super({ _name: ExampleModule._name });
  }

  get_readiness(): XpellModuleReadiness {
    return {
      _ready: true,
      _status: "ready",
      _checks: {}
    };
  }

  async _echo(xcmd: XCommand): Promise<XpellModuleResponse<ExampleEchoResult>> {
    const readiness = this.get_readiness();

    if (!readiness._ready) {
      return {
        _ok: false,
        _error: {
          _code: "E_NOT_READY",
          _message: "example-module is not ready",
          _details: readiness
        }
      };
    }

    const message = xcmd._params?.message;

    if (typeof message !== "string" || message.length === 0) {
      return invalid_params("message is required", {
        _field: "message",
        _expected: "non-empty string"
      });
    }

    return {
      _ok: true,
      _result: {
        message
      }
    };
  }
}

export function createExampleModule(config?: ExampleModuleConfig): ExampleModule {
  return new ExampleModule(config);
}
