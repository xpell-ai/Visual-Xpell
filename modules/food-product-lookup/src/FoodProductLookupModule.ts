import {
  XModule,
  type XCommand
} from "@xpell/core";

import {
  FOOD_PRODUCT_LOOKUP_MODULE_ID,
  FOOD_PRODUCT_LOOKUP_OPS,
  FOOD_PRODUCT_LOOKUP_SKILL
} from "./contract.js";
import type {
  FindBarcodeResult,
  FoodProductLookupFailure,
  FoodProductLookupModuleConfig,
  FoodProductLookupProvider,
  FoodProductLookupResponse,
  JsonObject,
  XpellModuleReadiness
} from "./types.js";
import {
  OpenFoodFactsProvider,
  validate_barcode
} from "./providers/OpenFoodFactsProvider.js";

function not_ready(readiness: XpellModuleReadiness): FoodProductLookupFailure {
  return {
    _ok: false,
    _error: {
      _code: "E_NOT_READY",
      _message: "food-product-lookup is not ready",
      _details: readiness as unknown as JsonObject
    }
  };
}

export class FoodProductLookupModule extends XModule {
  static _name = FOOD_PRODUCT_LOOKUP_MODULE_ID;
  static _ops = FOOD_PRODUCT_LOOKUP_OPS;
  static _skill = FOOD_PRODUCT_LOOKUP_SKILL;

  _name = FOOD_PRODUCT_LOOKUP_MODULE_ID;

  private readonly provider: FoodProductLookupProvider;

  constructor(config: FoodProductLookupModuleConfig = {}) {
    super({ _name: FoodProductLookupModule._name });
    this.provider = config.provider ?? new OpenFoodFactsProvider(config.open_food_facts);
  }

  get_readiness(): XpellModuleReadiness {
    const provider_readiness = this.provider.get_readiness();

    return {
      _ready: provider_readiness._ready,
      _status: provider_readiness._ready ? "ready" : "not_ready",
      ...(provider_readiness._missing_config
        ? { _missing_config: provider_readiness._missing_config }
        : {}),
      _checks: {
        module_loaded: true,
        provider: this.provider._provider_id,
        provider_config_valid: provider_readiness._ready,
        ...(provider_readiness._checks ?? {})
      }
    };
  }

  async _find_barcode(xcmd: XCommand): Promise<FoodProductLookupResponse<FindBarcodeResult>> {
    const readiness = this.get_readiness();

    if (!readiness._ready) {
      return not_ready(readiness);
    }

    const validation = validate_barcode(xcmd._params?.barcode);

    if (!validation._ok) {
      return validation;
    }

    return this.provider.find_barcode(validation._result.barcode);
  }
}

export function createFoodProductLookupModule(
  config?: FoodProductLookupModuleConfig
): FoodProductLookupModule {
  return new FoodProductLookupModule(config);
}
