import {
  FOOD_PRODUCT_LOOKUP_PROVIDER_OPEN_FOOD_FACTS
} from "../contract.js";
import type {
  FetchLike,
  FindBarcodeResult,
  FoodProductLookupFailure,
  FoodProductLookupProvider,
  FoodProductLookupResponse,
  JsonObject,
  OpenFoodFactsProviderConfig,
  XpellModuleReadiness
} from "../types.js";

const DEFAULT_BASE_URL = "https://world.openfoodfacts.org";
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_USER_AGENT = "XpellFoodProductLookup/0.1.0 (https://xpell.ai)";
const OPEN_FOOD_FACTS_API_VERSION = "v3";
const PRODUCT_FIELDS = [
  "code",
  "product_name",
  "brands",
  "quantity",
  "serving_size",
  "image_url",
  "nutriments"
];
const VALID_BARCODE_LENGTHS = new Set([8, 12, 13, 14]);

type OpenFoodFactsResponse = {
  status?: unknown;
  result?: {
    id?: unknown;
  };
  errors?: unknown;
  product?: unknown;
  code?: unknown;
};

function failure(
  _code: FoodProductLookupFailure["_error"]["_code"],
  _message: string,
  _details?: JsonObject
): FoodProductLookupFailure {
  return {
    _ok: false,
    _error: {
      _code,
      _message,
      ...(_details ? { _details } : {})
    }
  };
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function read_string(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function read_number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function is_timeout_error(error: unknown): boolean {
  if (!is_record(error)) {
    return false;
  }

  return error.name === "AbortError" || error.code === "ABORT_ERR";
}

function product_not_found_response(barcode: string): FoodProductLookupResponse<FindBarcodeResult> {
  return {
    _ok: true,
    _result: {
      found: false,
      barcode,
      product: null,
      nutrition: null,
      source: {
        provider: FOOD_PRODUCT_LOOKUP_PROVIDER_OPEN_FOOD_FACTS,
        api_version: OPEN_FOOD_FACTS_API_VERSION
      }
    }
  };
}

function contains_product_not_found(response: OpenFoodFactsResponse): boolean {
  if (is_record(response.result) && response.result.id === "product_not_found") {
    return true;
  }

  if (!Array.isArray(response.errors)) {
    return false;
  }

  return response.errors.some((entry) => {
    if (!is_record(entry)) {
      return false;
    }

    const message = entry.message;
    return is_record(message) && message.id === "product_not_found";
  });
}

function normalize_product(
  barcode: string,
  response: OpenFoodFactsResponse
): FoodProductLookupResponse<FindBarcodeResult> {
  if (contains_product_not_found(response)) {
    return product_not_found_response(barcode);
  }

  if (response.status !== "success" || !is_record(response.product)) {
    return failure("E_PROVIDER_RESPONSE_INVALID", "Open Food Facts returned an unexpected response shape", {
      status: typeof response.status === "string" ? response.status : null,
      result_id: is_record(response.result) && typeof response.result.id === "string"
        ? response.result.id
        : null
    });
  }

  const product = response.product;
  const nutriments = is_record(product.nutriments) ? product.nutriments : null;
  const protein_per_100g = nutriments ? read_number(nutriments.proteins_100g) : null;
  const protein_per_serving = nutriments ? read_number(nutriments.proteins_serving) : null;
  const protein_unit = nutriments ? read_string(nutriments.proteins_unit) : null;

  return {
    _ok: true,
    _result: {
      found: true,
      barcode,
      product: {
        name: read_string(product.product_name),
        brand: read_string(product.brands),
        quantity: read_string(product.quantity),
        serving_size: read_string(product.serving_size),
        image_url: read_string(product.image_url)
      },
      nutrition: {
        protein: {
          per_100g: protein_per_100g,
          per_serving: protein_per_serving,
          unit: protein_unit ?? (protein_per_100g !== null || protein_per_serving !== null ? "g" : null)
        }
      },
      source: {
        provider: FOOD_PRODUCT_LOOKUP_PROVIDER_OPEN_FOOD_FACTS,
        api_version: OPEN_FOOD_FACTS_API_VERSION
      }
    }
  };
}

export function validate_barcode(value: unknown): FoodProductLookupResponse<{ barcode: string }> {
  if (typeof value !== "string") {
    return failure("E_INVALID_BARCODE", "barcode must be a string", {
      _field: "barcode",
      _expected: "string"
    });
  }

  const barcode = value.trim();

  if (barcode.length === 0) {
    return failure("E_INVALID_BARCODE", "barcode is required", {
      _field: "barcode",
      _expected: "non-empty string"
    });
  }

  if (!/^\d+$/.test(barcode)) {
    return failure("E_INVALID_BARCODE", "barcode must contain digits only", {
      _field: "barcode",
      _expected: "digits only"
    });
  }

  if (!VALID_BARCODE_LENGTHS.has(barcode.length)) {
    return failure("E_INVALID_BARCODE", "barcode length is not supported", {
      _field: "barcode",
      _expected: "8, 12, 13, or 14 digits",
      _actual_length: barcode.length
    });
  }

  return {
    _ok: true,
    _result: {
      barcode
    }
  };
}

export class OpenFoodFactsProvider implements FoodProductLookupProvider {
  readonly _provider_id = FOOD_PRODUCT_LOOKUP_PROVIDER_OPEN_FOOD_FACTS;

  private readonly base_url: string;
  private readonly timeout_ms: number;
  private readonly user_agent: string;
  private readonly fetch_impl?: FetchLike;

  constructor(config: OpenFoodFactsProviderConfig = {}) {
    this.base_url = (config.base_url ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout_ms = config.timeout_ms ?? DEFAULT_TIMEOUT_MS;
    this.user_agent = config.user_agent ?? DEFAULT_USER_AGENT;
    this.fetch_impl = config.fetch ?? globalThis.fetch;
  }

  get_readiness(): XpellModuleReadiness {
    const missing_config: string[] = [];

    if (!this.base_url.startsWith("https://") && !this.base_url.startsWith("http://")) {
      missing_config.push("open_food_facts.base_url");
    }

    if (!Number.isFinite(this.timeout_ms) || this.timeout_ms <= 0) {
      missing_config.push("open_food_facts.timeout_ms");
    }

    if (this.user_agent.trim().length === 0) {
      missing_config.push("open_food_facts.user_agent");
    }

    if (!this.fetch_impl) {
      missing_config.push("fetch");
    }

    return {
      _ready: missing_config.length === 0,
      _status: missing_config.length === 0 ? "ready" : "not_ready",
      ...(missing_config.length > 0 ? { _missing_config: missing_config } : {}),
      _checks: {
        provider: this._provider_id,
        base_url_configured: missing_config.includes("open_food_facts.base_url") === false,
        timeout_ms: this.timeout_ms,
        user_agent_configured: this.user_agent.trim().length > 0,
        fetch_available: Boolean(this.fetch_impl)
      }
    };
  }

  async find_barcode(barcode: string): Promise<FoodProductLookupResponse<FindBarcodeResult>> {
    const readiness = this.get_readiness();

    if (!readiness._ready || !this.fetch_impl) {
      return failure("E_NOT_READY", "Open Food Facts provider is not ready", readiness as unknown as JsonObject);
    }

    const url = new URL(`/api/v3/product/${encodeURIComponent(barcode)}`, this.base_url);
    url.searchParams.set("fields", PRODUCT_FIELDS.join(","));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout_ms);

    let raw_body = "";
    let status = 0;
    let status_text = "";

    try {
      const response = await this.fetch_impl(url.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "Accept": "application/json",
          "User-Agent": this.user_agent
        }
      });

      status = response.status;
      status_text = response.statusText ?? "";
      raw_body = await response.text();

      let parsed: unknown;

      try {
        parsed = raw_body.length > 0 ? JSON.parse(raw_body) : null;
      } catch {
        if (!response.ok) {
          return failure("E_PROVIDER_ERROR", "Open Food Facts returned a non-JSON error response", {
            status,
            status_text
          });
        }

        return failure("E_PROVIDER_RESPONSE_INVALID", "Open Food Facts returned malformed JSON", {
          status
        });
      }

      if (!is_record(parsed)) {
        return failure("E_PROVIDER_RESPONSE_INVALID", "Open Food Facts response must be a JSON object", {
          status
        });
      }

      const provider_response = parsed as OpenFoodFactsResponse;

      if (!response.ok && !contains_product_not_found(provider_response)) {
        return failure("E_PROVIDER_ERROR", "Open Food Facts returned an HTTP error", {
          status,
          status_text,
          result_id: is_record(provider_response.result) && typeof provider_response.result.id === "string"
            ? provider_response.result.id
            : null
        });
      }

      return normalize_product(barcode, provider_response);
    } catch (error) {
      if (is_timeout_error(error)) {
        return failure("E_PROVIDER_TIMEOUT", "Open Food Facts request timed out", {
          timeout_ms: this.timeout_ms
        });
      }

      return failure("E_PROVIDER_ERROR", "Open Food Facts request failed", {
        status,
        status_text,
        reason: error instanceof Error ? error.message : String(error)
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
