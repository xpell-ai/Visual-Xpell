import assert from "node:assert/strict";

import { _x } from "@xpell/core";

import {
  FIND_BARCODE_OPERATION_ID,
  FOOD_PRODUCT_LOOKUP_MODULE_ID,
  FOOD_PRODUCT_LOOKUP_OPS,
  FOOD_PRODUCT_LOOKUP_PACKAGE,
  FOOD_PRODUCT_LOOKUP_SKILL,
  FoodProductLookupModule,
  OpenFoodFactsProvider,
  createFoodProductLookupModule,
  validate_barcode,
  type FetchLike
} from "../src/index.js";

function json_response(body: unknown, options: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
    text: async () => JSON.stringify(body)
  };
}

function text_response(body: string, options: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
    text: async () => body
  };
}

function make_module(fetch_impl: FetchLike) {
  return createFoodProductLookupModule({
    open_food_facts: {
      fetch: fetch_impl,
      timeout_ms: 50,
      user_agent: "XpellFoodProductLookupTests/0.1.0 (https://xpell.ai)"
    }
  });
}

function assert_err(response: any, code: string) {
  assert.equal(response?._ok, false);
  assert.equal(response?._error?._code, code, JSON.stringify(response));
}

function find_runtime_skill() {
  const skills = _x.getSkills();
  const module_entry = skills._modules.find((entry: any) => entry._name === FOOD_PRODUCT_LOOKUP_MODULE_ID);
  const skill = module_entry?._skills?.find((entry: any) => entry._id === FOOD_PRODUCT_LOOKUP_MODULE_ID);

  return {
    module_entry,
    skill
  };
}

async function test_barcode_validation() {
  assert.deepEqual(validate_barcode("3017624010701"), {
    _ok: true,
    _result: {
      barcode: "3017624010701"
    }
  });
  assert.deepEqual(validate_barcode(" 03012345678905 "), {
    _ok: true,
    _result: {
      barcode: "03012345678905"
    }
  });

  assert_err(validate_barcode("301ABC4010701"), "E_INVALID_BARCODE");
  assert_err(validate_barcode(""), "E_INVALID_BARCODE");
  assert_err(validate_barcode("12345"), "E_INVALID_BARCODE");
}

async function test_found_product() {
  const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
  const fetch_impl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    return json_response({
      code: "3017624010701",
      status: "success",
      result: { id: "product_found", name: "Product found" },
      product: {
        code: "3017624010701",
        product_name: "Nutella",
        brands: "Ferrero",
        quantity: "400 g",
        serving_size: "15 g",
        image_url: "https://images.openfoodfacts.org/images/products/301/762/401/0701/front_en.100.400.jpg",
        nutriments: {
          proteins_100g: 6.3,
          proteins_serving: 0.9,
          proteins_unit: "g"
        }
      }
    });
  };

  const result = await make_module(fetch_impl)._find_barcode({
    _module: FOOD_PRODUCT_LOOKUP_MODULE_ID,
    _op: FIND_BARCODE_OPERATION_ID,
    _params: {
      barcode: "3017624010701"
    }
  } as any);

  assert.equal(result._ok, true);
  assert.equal(result._result.barcode, "3017624010701");
  assert.deepEqual(result._result.product, {
    name: "Nutella",
    brand: "Ferrero",
    quantity: "400 g",
    serving_size: "15 g",
    image_url: "https://images.openfoodfacts.org/images/products/301/762/401/0701/front_en.100.400.jpg"
  });
  assert.deepEqual(result._result.nutrition, {
    protein: {
      per_100g: 6.3,
      per_serving: 0.9,
      unit: "g"
    }
  });
  assert.deepEqual(result._result.source, {
    provider: "open-food-facts",
    api_version: "v3"
  });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]!.url).pathname, "/api/v3/product/3017624010701");
  assert.equal(new URL(calls[0]!.url).searchParams.get("fields"), "code,product_name,brands,quantity,serving_size,image_url,nutriments");
  assert.match(calls[0]!.headers?.["User-Agent"] ?? "", /^XpellFoodProductLookupTests\/0\.1\.0/);
}

async function test_partial_product_without_nutrition() {
  const module = make_module(async () => json_response({
    status: "success",
    result: { id: "product_found" },
    product: {
      code: "4006381333931",
      product_name: "Partial Product",
      brands: "Demo Brand"
    }
  }));

  const result = await module._find_barcode({
    _module: FOOD_PRODUCT_LOOKUP_MODULE_ID,
    _op: FIND_BARCODE_OPERATION_ID,
    _params: {
      barcode: "4006381333931"
    }
  } as any);

  assert.equal(result._ok, true);
  assert.equal(result._result.found, true);
  assert.deepEqual(result._result.product, {
    name: "Partial Product",
    brand: "Demo Brand",
    quantity: null,
    serving_size: null,
    image_url: null
  });
  assert.deepEqual(result._result.nutrition, {
    protein: {
      per_100g: null,
      per_serving: null,
      unit: null
    }
  });
}

async function test_not_found() {
  const module = make_module(async () => json_response({
    code: "9999999999999",
    status: "failure",
    result: { id: "product_not_found", name: "Product not found" },
    errors: [
      {
        message: { id: "product_not_found" }
      }
    ]
  }, { ok: false, status: 404, statusText: "Not Found" }));

  const result = await module._find_barcode({
    _module: FOOD_PRODUCT_LOOKUP_MODULE_ID,
    _op: FIND_BARCODE_OPERATION_ID,
    _params: {
      barcode: "9999999999999"
    }
  } as any);

  assert.deepEqual(result, {
    _ok: true,
    _result: {
      found: false,
      barcode: "9999999999999",
      product: null,
      nutrition: null,
      source: {
        provider: "open-food-facts",
        api_version: "v3"
      }
    }
  });
}

async function test_provider_failures() {
  assert_err(await make_module(async () => text_response("bad gateway", {
    ok: false,
    status: 502,
    statusText: "Bad Gateway"
  }))._find_barcode({
    _module: FOOD_PRODUCT_LOOKUP_MODULE_ID,
    _op: FIND_BARCODE_OPERATION_ID,
    _params: { barcode: "3017624010701" }
  } as any), "E_PROVIDER_ERROR");

  assert_err(await make_module(async () => text_response("{", {
    ok: true,
    status: 200
  }))._find_barcode({
    _module: FOOD_PRODUCT_LOOKUP_MODULE_ID,
    _op: FIND_BARCODE_OPERATION_ID,
    _params: { barcode: "3017624010701" }
  } as any), "E_PROVIDER_RESPONSE_INVALID");

  assert_err(await make_module(async () => json_response({
    status: "success"
  }))._find_barcode({
    _module: FOOD_PRODUCT_LOOKUP_MODULE_ID,
    _op: FIND_BARCODE_OPERATION_ID,
    _params: { barcode: "3017624010701" }
  } as any), "E_PROVIDER_RESPONSE_INVALID");

  const timeout_fetch: FetchLike = async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new DOMException("The operation was aborted", "AbortError"));
    });
  });

  assert_err(await make_module(timeout_fetch)._find_barcode({
    _module: FOOD_PRODUCT_LOOKUP_MODULE_ID,
    _op: FIND_BARCODE_OPERATION_ID,
    _params: { barcode: "3017624010701" }
  } as any), "E_PROVIDER_TIMEOUT");
}

async function test_runtime_contract() {
  assert.equal(FOOD_PRODUCT_LOOKUP_MODULE_ID, "food-product-lookup");
  assert.equal(FOOD_PRODUCT_LOOKUP_PACKAGE, "@xpell/food-product-lookup");
  assert.deepEqual(Object.keys(FOOD_PRODUCT_LOOKUP_OPS), ["find-barcode"]);
  assert.equal(FOOD_PRODUCT_LOOKUP_OPS["find-barcode"]._id, "find-barcode");
  assert.equal(FOOD_PRODUCT_LOOKUP_OPS["find-barcode"]._scope, "server");
  assert.equal(FOOD_PRODUCT_LOOKUP_SKILL._name, FOOD_PRODUCT_LOOKUP_MODULE_ID);
  assert.equal(FOOD_PRODUCT_LOOKUP_SKILL._ops, FOOD_PRODUCT_LOOKUP_OPS);
  assert.equal(FOOD_PRODUCT_LOOKUP_SKILL._runtime._target, "server");

  const module = make_module(async () => json_response({
    status: "success",
    result: { id: "product_found" },
    product: {
      code: "3017624010701",
      product_name: "Nutella",
      brands: "Ferrero",
      nutriments: {
        proteins_100g: 6.3,
        proteins_unit: "g"
      }
    }
  }));

  assert.ok(module instanceof FoodProductLookupModule);
  assert.equal(module._name, FOOD_PRODUCT_LOOKUP_MODULE_ID);
  assert.equal(FoodProductLookupModule._name, FOOD_PRODUCT_LOOKUP_MODULE_ID);
  assert.equal(FoodProductLookupModule._ops, FOOD_PRODUCT_LOOKUP_OPS);
  assert.equal(FoodProductLookupModule._skill._ops, FOOD_PRODUCT_LOOKUP_OPS);
  assert.equal(module.get_readiness()._ready, true);

  const modules = (_x as any)._modules ?? {};
  const previous = modules[FOOD_PRODUCT_LOOKUP_MODULE_ID];
  delete modules[FOOD_PRODUCT_LOOKUP_MODULE_ID];

  try {
    await _x.loadModuleAsync(module);

    const response = await _x.execute({
      _module: FOOD_PRODUCT_LOOKUP_MODULE_ID,
      _op: FIND_BARCODE_OPERATION_ID,
      _params: {
        barcode: "3017624010701"
      }
    });

    assert.equal(response._ok, true);
    assert.equal(response._result.found, true);
    assert.equal(response._result.product.name, "Nutella");

    const invalid = await _x.execute({
      _module: FOOD_PRODUCT_LOOKUP_MODULE_ID,
      _op: FIND_BARCODE_OPERATION_ID,
      _params: {
        barcode: "abc"
      }
    });

    assert_err(invalid, "E_INVALID_BARCODE");

    const { module_entry, skill } = find_runtime_skill();
    const exported_module = skill?._exports?._modules?.find(
      (entry: any) => entry._name === FOOD_PRODUCT_LOOKUP_MODULE_ID
    );

    assert.ok(module_entry);
    assert.ok(skill);
    assert.equal(skill._type, "server-module-api");
    assert.equal(skill._ops, FOOD_PRODUCT_LOOKUP_OPS);
    assert.equal(skill._ops["find-barcode"]._id, "find-barcode");
    assert.equal(exported_module?._scope, "server");
    assert.equal(Array.isArray(exported_module?._ops), true);
    assert.equal(exported_module?._ops?.[0], FOOD_PRODUCT_LOOKUP_OPS["find-barcode"]);
  } finally {
    if (previous) {
      modules[FOOD_PRODUCT_LOOKUP_MODULE_ID] = previous;
    } else {
      delete modules[FOOD_PRODUCT_LOOKUP_MODULE_ID];
    }
  }
}

async function test_provider_readiness() {
  const provider = new OpenFoodFactsProvider({
    base_url: "",
    timeout_ms: 0,
    user_agent: "",
    fetch: undefined
  });

  const readiness = provider.get_readiness();
  assert.equal(readiness._ready, false);
  assert.ok(readiness._missing_config?.includes("open_food_facts.base_url"));
  assert.ok(readiness._missing_config?.includes("open_food_facts.timeout_ms"));
  assert.ok(readiness._missing_config?.includes("open_food_facts.user_agent"));
}

async function run() {
  await test_barcode_validation();
  await test_found_product();
  await test_partial_product_without_nutrition();
  await test_not_found();
  await test_provider_failures();
  await test_runtime_contract();
  await test_provider_readiness();
}

await run();
