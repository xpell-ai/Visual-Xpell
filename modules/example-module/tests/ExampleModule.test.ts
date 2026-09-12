import assert from "node:assert/strict";

import { _x } from "@xpell/core";

import {
  EXAMPLE_MODULE_ID,
  EXAMPLE_MODULE_OPS,
  EXAMPLE_MODULE_PACKAGE,
  EXAMPLE_MODULE_SKILL,
  ExampleModule,
  createExampleModule
} from "../src/index.js";

function find_example_runtime_skill() {
  const skills = _x.getSkills();
  const module_entry = skills._modules.find((entry: any) => entry._name === EXAMPLE_MODULE_ID);
  const skill = module_entry?._skills?.find((entry: any) => entry._id === EXAMPLE_MODULE_ID);

  return {
    module_entry,
    skill
  };
}

async function run() {
  assert.equal(EXAMPLE_MODULE_ID, "example-module");
  assert.equal(EXAMPLE_MODULE_PACKAGE, "@xpell/example-module");
  assert.deepEqual(Object.keys(EXAMPLE_MODULE_OPS), ["echo"]);
  assert.equal(EXAMPLE_MODULE_OPS.echo._id, "echo");
  assert.equal(EXAMPLE_MODULE_OPS.echo._name, "echo");
  assert.equal(EXAMPLE_MODULE_OPS.echo._scope, "server");
  assert.equal(EXAMPLE_MODULE_SKILL._name, EXAMPLE_MODULE_ID);
  assert.equal(EXAMPLE_MODULE_SKILL._ops, EXAMPLE_MODULE_OPS);
  assert.equal(EXAMPLE_MODULE_SKILL._ops.echo._id, "echo");
  assert.equal(EXAMPLE_MODULE_SKILL._readiness._ready, true);

  const module = createExampleModule();

  assert.ok(module instanceof ExampleModule);
  assert.equal(module._name, EXAMPLE_MODULE_ID);
  assert.equal(ExampleModule._name, EXAMPLE_MODULE_ID);
  assert.equal(ExampleModule._ops, EXAMPLE_MODULE_OPS);
  assert.equal(ExampleModule._ops.echo, EXAMPLE_MODULE_OPS.echo);
  assert.equal(ExampleModule._skill._name, EXAMPLE_MODULE_ID);

  assert.deepEqual(module.get_readiness(), {
    _ready: true,
    _status: "ready",
    _checks: {}
  });

  await _x.loadModuleAsync(module);

  const ok = await _x.execute({
    _module: EXAMPLE_MODULE_ID,
    _op: "echo",
    _params: {
      message: "hello"
    }
  });

  assert.deepEqual(ok, {
    _ok: true,
    _result: {
      message: "hello"
    }
  });

  const invalid = await _x.execute({
    _module: EXAMPLE_MODULE_ID,
    _op: "echo",
    _params: {}
  });

  assert.equal(invalid._ok, false);
  assert.equal(invalid._error._code, "E_INVALID_PARAMS");
  assert.equal(invalid._error._details._field, "message");

  const { module_entry, skill } = find_example_runtime_skill();
  const exported_module = skill?._exports?._modules?.find(
    (entry: any) => entry._name === EXAMPLE_MODULE_ID
  );

  assert.ok(module_entry);
  assert.ok(skill);
  assert.equal(skill._type, "server-module-api");
  assert.equal(skill._ops, EXAMPLE_MODULE_OPS);
  assert.equal(skill._ops.echo._id, "echo");
  assert.equal(skill._readiness._ready, true);
  assert.equal(exported_module?._scope, "server");
  assert.equal(Array.isArray(exported_module?._ops), true);
  assert.equal(exported_module?._ops?.[0]?._id, "echo");
  assert.equal(exported_module?._ops?.[0], EXAMPLE_MODULE_OPS.echo);
}

await run();
