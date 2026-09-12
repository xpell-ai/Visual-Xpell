import type { XpellSkill, XpellSkillCommand } from "@xpell/core";

export type JsonObject = Record<string, unknown>;

export type FoodProductLookupProviderId = "open-food-facts";

export type FoodProductLookupSource = {
  provider: FoodProductLookupProviderId;
  api_version?: string;
};

export type FoodProductIdentity = {
  name: string | null;
  brand: string | null;
  quantity: string | null;
  serving_size: string | null;
  image_url: string | null;
};

export type FoodProductProteinNutrition = {
  per_100g: number | null;
  per_serving: number | null;
  unit: string | null;
};

export type FoodProductNutrition = {
  protein: FoodProductProteinNutrition;
};

export type FindBarcodeParams = {
  barcode: string;
};

export type FindBarcodeResult = {
  found: boolean;
  barcode: string;
  product: FoodProductIdentity | null;
  nutrition: FoodProductNutrition | null;
  source: FoodProductLookupSource;
};

export type XpellModuleReadiness = {
  _ready: boolean;
  _status: "ready" | "not_ready" | "degraded";
  _missing_config?: string[];
  _missing_secrets?: string[];
  _checks?: Record<string, unknown>;
};

export type FoodProductLookupErrorCode =
  | "E_INVALID_BARCODE"
  | "E_NOT_READY"
  | "E_PROVIDER_TIMEOUT"
  | "E_PROVIDER_ERROR"
  | "E_PROVIDER_RESPONSE_INVALID"
  | "E_INTERNAL";

export type FoodProductLookupError = {
  _code: FoodProductLookupErrorCode;
  _message: string;
  _details?: JsonObject;
};

export type FoodProductLookupSuccess<T extends JsonObject> = {
  _ok: true;
  _result: T;
};

export type FoodProductLookupFailure = {
  _ok: false;
  _error: FoodProductLookupError;
};

export type FoodProductLookupResponse<T extends JsonObject> =
  | FoodProductLookupSuccess<T>
  | FoodProductLookupFailure;

export type FoodProductLookupProvider = {
  readonly _provider_id: FoodProductLookupProviderId;
  get_readiness(): XpellModuleReadiness;
  find_barcode(barcode: string): Promise<FoodProductLookupResponse<FindBarcodeResult>>;
};

export type FoodProductLookupModuleConfig = {
  provider?: FoodProductLookupProvider;
  open_food_facts?: OpenFoodFactsProviderConfig;
};

export type FetchLikeResponse = {
  ok: boolean;
  status: number;
  statusText?: string;
  text(): Promise<string>;
};

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    redirect?: "follow" | "manual" | "error";
  }
) => Promise<FetchLikeResponse>;

export type OpenFoodFactsProviderConfig = {
  base_url?: string;
  timeout_ms?: number;
  user_agent?: string;
  fetch?: FetchLike;
};

export type FoodProductLookupOperation = XpellSkillCommand & {
  _id: string;
  _input_schema: JsonObject;
  _output_schema: JsonObject;
  _errors: readonly FoodProductLookupErrorCode[];
  _permissions: readonly string[];
  _examples: readonly JsonObject[];
  _side_effects: "external-read";
  _scope: "server";
};

export type FoodProductLookupSkill = XpellSkill & {
  _name: "food-product-lookup";
  _scope: "server";
  _package: "@xpell/food-product-lookup";
  _runtime: {
    _target: "server";
    _hosts: readonly ["xnode"];
    _xpell_core: string;
    _xpell_node: string;
  };
  _ops: Readonly<Record<string, FoodProductLookupOperation>>;
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
