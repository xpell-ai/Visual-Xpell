import assert from "node:assert/strict";

import {
  FOOD_PRODUCT_LOOKUP_MODULE_ID,
  createFoodProductLookupModule
} from "../src/index.js";

const barcode = process.env.FOOD_PRODUCT_LOOKUP_SMOKE_BARCODE?.trim() || "3017624010701";

const module = createFoodProductLookupModule({
  open_food_facts: {
    user_agent: "XpellFoodProductLookupSmoke/0.1.0 (https://xpell.ai)",
    timeout_ms: 10000
  }
});

const response = await module._find_barcode({
  _module: FOOD_PRODUCT_LOOKUP_MODULE_ID,
  _op: "find-barcode",
  _params: {
    barcode
  }
} as any);

process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);

assert.equal(response._ok, true);
assert.equal(response._result.found, true);
assert.equal(response._result.barcode, barcode);
assert.equal(response._result.source.provider, "open-food-facts");
