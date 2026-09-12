import type { FoodProductLookupOperation, FoodProductLookupSkill } from "./types.js";

export const FOOD_PRODUCT_LOOKUP_MODULE_ID = "food-product-lookup";
export const FOOD_PRODUCT_LOOKUP_PACKAGE = "@xpell/food-product-lookup";
export const FOOD_PRODUCT_LOOKUP_VERSION = "0.1.0";
export const FOOD_PRODUCT_LOOKUP_PROVIDER_OPEN_FOOD_FACTS = "open-food-facts";
export const FIND_BARCODE_OPERATION_ID = "find-barcode";

export const FOOD_PRODUCT_LOOKUP_OPS = {
  "find-barcode": {
    _id: FIND_BARCODE_OPERATION_ID,
    _name: FIND_BARCODE_OPERATION_ID,
    _scope: "server",
    _description: "Look up packaged food/product information by barcode.",
    _input_schema: {
      type: "object",
      required: ["barcode"],
      additionalProperties: false,
      properties: {
        barcode: {
          type: "string",
          description: "UPC, EAN, or GTIN barcode. Leading zeroes are preserved.",
          minLength: 8,
          maxLength: 14
        }
      }
    },
    _output_schema: {
      type: "object",
      required: ["found", "barcode", "product", "nutrition", "source"],
      additionalProperties: false,
      properties: {
        found: { type: "boolean" },
        barcode: { type: "string" },
        product: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              required: ["name", "brand", "quantity", "serving_size", "image_url"],
              additionalProperties: false,
              properties: {
                name: { type: ["string", "null"] },
                brand: { type: ["string", "null"] },
                quantity: { type: ["string", "null"] },
                serving_size: { type: ["string", "null"] },
                image_url: { type: ["string", "null"] }
              }
            }
          ]
        },
        nutrition: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              required: ["protein"],
              additionalProperties: false,
              properties: {
                protein: {
                  type: "object",
                  required: ["per_100g", "per_serving", "unit"],
                  additionalProperties: false,
                  properties: {
                    per_100g: { type: ["number", "null"] },
                    per_serving: { type: ["number", "null"] },
                    unit: { type: ["string", "null"] }
                  }
                }
              }
            }
          ]
        },
        source: {
          type: "object",
          required: ["provider"],
          additionalProperties: false,
          properties: {
            provider: { const: FOOD_PRODUCT_LOOKUP_PROVIDER_OPEN_FOOD_FACTS },
            api_version: { type: "string" }
          }
        }
      }
    },
    _errors: [
      "E_INVALID_BARCODE",
      "E_NOT_READY",
      "E_PROVIDER_TIMEOUT",
      "E_PROVIDER_ERROR",
      "E_PROVIDER_RESPONSE_INVALID"
    ],
    _permissions: ["food_product_lookup:find_barcode"],
    _examples: [
      {
        _module: FOOD_PRODUCT_LOOKUP_MODULE_ID,
        _op: FIND_BARCODE_OPERATION_ID,
        _params: {
          barcode: "3017624010701"
        }
      }
    ],
    _side_effects: "external-read"
  }
} as const satisfies Record<string, FoodProductLookupOperation>;

export const FOOD_PRODUCT_LOOKUP_SKILL: FoodProductLookupSkill = {
  _id: FOOD_PRODUCT_LOOKUP_MODULE_ID,
  _name: FOOD_PRODUCT_LOOKUP_MODULE_ID,
  _title: "Food Product Lookup",
  _scope: "server",
  _version: FOOD_PRODUCT_LOOKUP_VERSION,
  _active: true,
  _type: "server-module-api",
  _requires: ["xmodule", "network"],
  _description: "Look up packaged food/product information using a barcode.",
  _package: FOOD_PRODUCT_LOOKUP_PACKAGE,
  _runtime: {
    _target: "server",
    _hosts: ["xnode"],
    _xpell_core: ">=2.0.0",
    _xpell_node: ">=2.0.0"
  },
  _ops: FOOD_PRODUCT_LOOKUP_OPS,
  _config: [
    {
      _name: "open_food_facts.base_url",
      _required: false,
      _default: "https://world.openfoodfacts.org",
      _description: "Open Food Facts API origin."
    },
    {
      _name: "open_food_facts.timeout_ms",
      _required: false,
      _default: 5000,
      _description: "Request deadline for the read-only barcode lookup."
    },
    {
      _name: "open_food_facts.user_agent",
      _required: false,
      _default: "XpellFoodProductLookup/0.1.0 (https://xpell.ai)",
      _description: "Open Food Facts User-Agent identifying this Xpell module."
    }
  ],
  _secrets: [],
  _permissions: ["food_product_lookup:find_barcode"],
  _readiness: {
    _ready: true,
    _status: "ready",
    _checks: ["module_loaded", "provider_config_valid", "fetch_available"]
  },
  _exports: {
    _modules: [
      {
        _name: FOOD_PRODUCT_LOOKUP_MODULE_ID,
        _scope: "server",
        _description: "Reusable packaged food/product lookup by barcode.",
        _ops: Object.values(FOOD_PRODUCT_LOOKUP_OPS)
      }
    ]
  },
  _examples: [
    {
      _module: FOOD_PRODUCT_LOOKUP_MODULE_ID,
      _op: FIND_BARCODE_OPERATION_ID,
      _params: {
        barcode: "3017624010701"
      }
    }
  ],
  _canonical_examples: [
    {
      _module: FOOD_PRODUCT_LOOKUP_MODULE_ID,
      _op: FIND_BARCODE_OPERATION_ID,
      _params: {
        barcode: "3017624010701"
      }
    }
  ],
  _core_rules: [
    "Invoke through _x.execute with _module set to food-product-lookup.",
    "The find-barcode operation is server-scoped and performs a read-only Open Food Facts lookup.",
    "The module is generic and must not depend on Protein Tracker, Visual Xpell UI, meals, or daily totals.",
    "The public response is normalized and must not expose raw Open Food Facts JSON."
  ]
};
