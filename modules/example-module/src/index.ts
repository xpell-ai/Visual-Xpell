export {
  EXAMPLE_MODULE_ID,
  EXAMPLE_MODULE_OPS,
  EXAMPLE_MODULE_PACKAGE,
  EXAMPLE_MODULE_SKILL,
  EXAMPLE_MODULE_VERSION
} from "./contract.js";

export {
  ExampleModule,
  createExampleModule
} from "./ExampleModule.js";

export type {
  ExampleEchoParams,
  ExampleEchoResult,
  ExampleModuleConfig,
  ExampleModuleOperation,
  ExampleModuleSkill,
  JsonObject,
  XpellModuleError,
  XpellModuleErrorCode,
  XpellModuleFailure,
  XpellModuleReadiness,
  XpellModuleResponse,
  XpellModuleSuccess
} from "./types.js";
