# @xpell/food-product-lookup

Reusable Xpell package for packaged food barcode workflows.

This package is generic. It does not know about Protein Tracker, meals, Visual Xpell UI, daily totals, or any specific app.

It exposes separate runtime capabilities:

- `food-product-lookup`: server module for normalized product lookup by barcode.
- `barcode-scanner`: client module for browser camera barcode scanning.

## Identity

- Runtime module ID: `food-product-lookup`
- Package name: `@xpell/food-product-lookup`
- Runtime target: `server`
- Scope: `server`
- Provider: Open Food Facts V1 implementation
- Config: optional provider base URL, timeout, and User-Agent
- Secrets: none
- Side effects: external read-only network request

## Operation

### `find-barcode`

Looks up packaged food/product information by barcode.

Input:

```json
{
  "barcode": "3017624010701"
}
```

Success, product found:

```json
{
  "_ok": true,
  "_result": {
    "found": true,
    "barcode": "3017624010701",
    "product": {
      "name": "Nutella",
      "brand": "Ferrero",
      "quantity": "400 g",
      "serving_size": null,
      "image_url": "https://images.openfoodfacts.org/images/products/301/762/401/0701/front_en.100.400.jpg"
    },
    "nutrition": {
      "protein": {
        "per_100g": 6.3,
        "per_serving": null,
        "unit": "g"
      }
    },
    "source": {
      "provider": "open-food-facts",
      "api_version": "v3"
    }
  }
}
```

Success, product not found:

```json
{
  "_ok": true,
  "_result": {
    "found": false,
    "barcode": "9999999999999",
    "product": null,
    "nutrition": null,
    "source": {
      "provider": "open-food-facts",
      "api_version": "v3"
    }
  }
}
```

Invalid barcode:

```json
{
  "_ok": false,
  "_error": {
    "_code": "E_INVALID_BARCODE",
    "_message": "barcode must contain digits only"
  }
}
```

## Barcode Validation

The module trims whitespace, requires digits only, preserves leading zeroes, and accepts common GTIN lengths: 8, 12, 13, and 14 digits.

It does not calculate or enforce barcode check digits in V1.

## Open Food Facts

V1 uses:

```text
GET https://world.openfoodfacts.org/api/v3/product/{barcode}
```

The request sends a custom `User-Agent` and asks only for the fields needed by the normalized result:

```text
code,product_name,brands,quantity,serving_size,image_url,nutriments
```

No API key is required for the initial read lookup.

## Registration

Register the module explicitly from the XNode server bootstrap:

```ts
import { createFoodProductLookupModule } from "@xpell/food-product-lookup";

await node.start({
  _modules: [
    createFoodProductLookupModule()
  ]
});
```

## Invocation

All external calls must use `_x.execute(...)`:

```ts
await _x.execute({
  _module: "food-product-lookup",
  _op: "find-barcode",
  _params: {
    barcode: "3017624010701"
  }
});
```

## Readiness

`get_readiness()` verifies module load state and provider configuration only. It does not perform a live Open Food Facts request.

## Runtime Discovery

The module exports one canonical keyed `_ops` record and reuses it for `static _ops` and `_skill._ops`. Once loaded, it appears in the runtime skill snapshot returned by `_x.getSkills()`.

XMCP visibility is metadata-only unless a curated XMCP tool or future permissioned generic module invocation bridge explicitly exposes it.

## Client Barcode Scanner

Runtime module ID: `barcode-scanner`

Runtime target: `client`

Purpose: scan product barcodes using the browser camera and return the barcode string plus detected format. It does not perform product lookup and does not call Open Food Facts.

Register it explicitly in the XUI/browser runtime:

```ts
import { createBarcodeScannerModule } from "@xpell/food-product-lookup/client";

await XUIRuntime.loadApp({
  _modules: [
    createBarcodeScannerModule()
  ]
});
```

### Client operations

#### `get-capabilities`

Returns safe browser capability metadata:

```json
{
  "_ok": true,
  "_result": {
    "camera_available": true,
    "native_barcode_detector_available": true,
    "supported_formats": ["ean_13", "ean_8", "upc_a", "upc_e", "itf"],
    "requested_formats": ["ean_13", "ean_8", "upc_a", "upc_e", "itf"],
    "fallback_available": false,
    "secure_context_required": true,
    "secure_context": true
  }
}
```

#### `start-scan`

Starts the camera only after this explicit command. It prefers the environment/rear camera, renders an owned `video` preview into `preview_container_id` when provided, and stops camera tracks after success, timeout, cancellation, or failure.

```json
{
  "_module": "barcode-scanner",
  "_op": "start-scan",
  "_params": {
    "preview_container_id": "barcode-preview",
    "output_key": "barcode_scanner:result",
    "state_key": "barcode_scanner:state"
  }
}
```

Successful result:

```json
{
  "_ok": true,
  "_result": {
    "found": true,
    "barcode": "3017624010701",
    "format": "ean_13",
    "_status": "found"
  }
}
```

#### `stop-scan`

Stops an active scan and releases camera tracks:

```json
{
  "_module": "barcode-scanner",
  "_op": "stop-scan",
  "_params": {}
}
```

Controlled stop/cancel result:

```json
{
  "_ok": true,
  "_result": {
    "found": false,
    "barcode": null,
    "format": null,
    "_status": "cancelled"
  }
}
```

### Detection strategy

V1 uses the native browser `BarcodeDetector` API and reports `fallback_available: false`. The scanner requests common product formats where the browser supports them: `ean_13`, `ean_8`, `upc_a`, `upc_e`, and `itf`.

`BarcodeDetector` is limited availability and secure-context dependent. Chrome-based environments should still call `get-capabilities` at runtime because supported formats vary by browser and platform.

### Error codes

- `E_CAMERA_UNAVAILABLE`
- `E_CAMERA_PERMISSION_DENIED`
- `E_BARCODE_DETECTOR_UNAVAILABLE`
- `E_SCAN_FAILED`
- `E_SCAN_CANCELLED`
- `E_INVALID_PARAMS`

### Manual browser smoke test

1. Run the Visual Xpell server and client.
2. In the browser runtime, call `barcode-scanner.get-capabilities`.
3. Render an XUI container for a preview.
4. Call `barcode-scanner.start-scan` with `preview_container_id`.
5. Point the camera at a real packaged-food barcode such as `3017624010701`.
6. Confirm the result contains only the barcode and format.
7. Call `barcode-scanner.stop-scan` if scanning is still active.

The next app-composition step is to wire:

```text
Scan Barcode -> barcode-scanner.start-scan -> XData barcode -> food-product-lookup.find-barcode -> product result
```

## Development

```sh
pnpm -C modules/food-product-lookup build
pnpm -C modules/food-product-lookup test
pnpm -C modules/food-product-lookup smoke:open-food-facts
```

Set `FOOD_PRODUCT_LOOKUP_SMOKE_BARCODE` to smoke-test a specific product barcode. If it is unset, the smoke test uses `3017624010701`.
