import type { XpellSkill, XpellSkillCommand } from "@xpell/core";

export const BARCODE_SCANNER_MODULE_ID = "barcode-scanner";
export const BARCODE_SCANNER_PACKAGE = "@xpell/food-product-lookup";
export const BARCODE_SCANNER_VERSION = "0.1.0";

export const BARCODE_SCANNER_DEFAULT_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "itf"
] as const;

export const BARCODE_SCANNER_STATE_KEY = "barcode_scanner:state";
export const BARCODE_SCANNER_RESULT_KEY = "barcode_scanner:result";

export type BarcodeScannerFormat = typeof BARCODE_SCANNER_DEFAULT_FORMATS[number] | string;

export type BarcodeScannerErrorCode =
  | "E_CAMERA_UNAVAILABLE"
  | "E_CAMERA_PERMISSION_DENIED"
  | "E_BARCODE_DETECTOR_UNAVAILABLE"
  | "E_SCAN_FAILED"
  | "E_SCAN_CANCELLED"
  | "E_INVALID_PARAMS";

export type BarcodeScannerResult = {
  found: boolean;
  barcode: string | null;
  format: string | null;
  _status?: "scanning" | "found" | "cancelled" | "timeout" | "stopped";
};

export type BarcodeScannerCapabilities = {
  camera_available: boolean;
  native_barcode_detector_available: boolean;
  supported_formats: string[];
  requested_formats: string[];
  fallback_available: boolean;
  secure_context_required: boolean;
  secure_context: boolean;
};

export type BarcodeScannerStartParams = {
  preview_container_id?: string;
  output_key?: string;
  state_key?: string;
  formats?: string[];
  timeout_ms?: number;
};

export type BarcodeScannerResponse<T extends object> =
  | {
      _ok: true;
      _result: T;
    }
  | {
      _ok: false;
      _error: {
        _code: BarcodeScannerErrorCode;
        _message: string;
        _details?: Record<string, unknown>;
      };
      };

export type BarcodeScannerOperation = XpellSkillCommand & {
  _id: string;
  _input_schema: Record<string, unknown>;
  _output_schema: Record<string, unknown>;
  _errors: readonly BarcodeScannerErrorCode[];
  _permissions: readonly string[];
  _examples: readonly Record<string, unknown>[];
  _side_effects: "camera-access" | "camera-release" | "none";
  _requires_user_action?: boolean;
  _scope: "client";
};

export type BarcodeScannerSkill = XpellSkill & {
  _name: "barcode-scanner";
  _scope: "client";
  _package: "@xpell/food-product-lookup";
  _runtime: {
    _target: "client";
    _hosts: readonly ["xui"];
    _xpell_core: string;
    _xpell_ui: string;
  };
  _ops: Readonly<Record<string, BarcodeScannerOperation>>;
  _config: readonly Record<string, unknown>[];
  _secrets: readonly Record<string, unknown>[];
  _permissions: readonly string[];
  _readiness: {
    _ready: true;
    _status: "ready";
    _checks: readonly string[];
  };
  _examples: readonly Record<string, unknown>[];
};

export const BARCODE_SCANNER_OPS = {
  "start-scan": {
    _id: "start-scan",
    _name: "start-scan",
    _scope: "client",
    _description: "Start an explicit browser camera barcode scan and return the first detected barcode.",
    _input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        preview_container_id: {
          type: "string",
          description: "Optional XUI object id or DOM id where the scanner should render its owned video preview."
        },
        output_key: {
          type: "string",
          description: "Optional XData key for the normalized scan result."
        },
        state_key: {
          type: "string",
          description: "Optional XData key for scan lifecycle state."
        },
        formats: {
          type: "array",
          items: { type: "string" },
          description: "Optional BarcodeDetector formats to request."
        },
        timeout_ms: {
          type: "number",
          minimum: 1000,
          maximum: 120000,
          description: "Maximum scan duration before returning a controlled timeout result."
        }
      }
    },
    _output_schema: {
      type: "object",
      required: ["found", "barcode", "format"],
      properties: {
        found: { type: "boolean" },
        barcode: { type: ["string", "null"] },
        format: { type: ["string", "null"] },
        _status: { type: "string" }
      }
    },
    _errors: [
      "E_CAMERA_UNAVAILABLE",
      "E_CAMERA_PERMISSION_DENIED",
      "E_BARCODE_DETECTOR_UNAVAILABLE",
      "E_SCAN_FAILED",
      "E_SCAN_CANCELLED",
      "E_INVALID_PARAMS"
    ],
    _permissions: ["barcode_scanner:start_scan"],
    _examples: [
      {
        _module: BARCODE_SCANNER_MODULE_ID,
        _op: "start-scan",
        _params: {
          preview_container_id: "barcode-preview",
          output_key: BARCODE_SCANNER_RESULT_KEY
        }
      }
    ],
    _side_effects: "camera-access",
    _requires_user_action: true
  },
  "stop-scan": {
    _id: "stop-scan",
    _name: "stop-scan",
    _scope: "client",
    _description: "Stop an active barcode scan and release camera tracks.",
    _input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        output_key: { type: "string" },
        state_key: { type: "string" }
      }
    },
    _output_schema: {
      type: "object",
      required: ["found", "barcode", "format"],
      properties: {
        found: { type: "boolean" },
        barcode: { type: ["string", "null"] },
        format: { type: ["string", "null"] },
        _status: { type: "string" }
      }
    },
    _errors: ["E_SCAN_CANCELLED"],
    _permissions: ["barcode_scanner:stop_scan"],
    _examples: [
      {
        _module: BARCODE_SCANNER_MODULE_ID,
        _op: "stop-scan",
        _params: {}
      }
    ],
    _side_effects: "camera-release"
  },
  "get-capabilities": {
    _id: "get-capabilities",
    _name: "get-capabilities",
    _scope: "client",
    _description: "Return browser barcode scanner capability metadata.",
    _input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    _output_schema: {
      type: "object",
      required: [
        "camera_available",
        "native_barcode_detector_available",
        "supported_formats",
        "requested_formats",
        "fallback_available"
      ],
      properties: {
        camera_available: { type: "boolean" },
        native_barcode_detector_available: { type: "boolean" },
        supported_formats: {
          type: "array",
          items: { type: "string" }
        },
        requested_formats: {
          type: "array",
          items: { type: "string" }
        },
        fallback_available: { type: "boolean" },
        secure_context_required: { type: "boolean" },
        secure_context: { type: "boolean" }
      }
    },
    _errors: [],
    _permissions: ["barcode_scanner:get_capabilities"],
    _examples: [
      {
        _module: BARCODE_SCANNER_MODULE_ID,
        _op: "get-capabilities",
        _params: {}
      }
    ],
    _side_effects: "none"
  }
} as const satisfies Record<string, BarcodeScannerOperation>;

export const BARCODE_SCANNER_SKILL: BarcodeScannerSkill = {
  _id: BARCODE_SCANNER_MODULE_ID,
  _name: BARCODE_SCANNER_MODULE_ID,
  _title: "Barcode Scanner",
  _scope: "client",
  _version: BARCODE_SCANNER_VERSION,
  _active: true,
  _type: "client-module-api",
  _requires: ["xmodule", "xui", "xdata", "browser-camera", "user-permission"],
  _description:
    "Scan product barcodes using the browser camera. Product lookup is a separate server capability handled by food-product-lookup.find-barcode.",
  _package: BARCODE_SCANNER_PACKAGE,
  _runtime: {
    _target: "client",
    _hosts: ["xui"],
    _xpell_core: ">=2.0.0",
    _xpell_ui: ">=2.0.0"
  },
  _ops: BARCODE_SCANNER_OPS,
  _config: [],
  _secrets: [],
  _permissions: [
    "barcode_scanner:start_scan",
    "barcode_scanner:stop_scan",
    "barcode_scanner:get_capabilities"
  ],
  _readiness: {
    _ready: true,
    _status: "ready",
    _checks: ["module_loaded", "browser_capabilities_runtime_checked"]
  },
  _exports: {
    _modules: [
      {
        _name: BARCODE_SCANNER_MODULE_ID,
        _scope: "client",
        _description: "Browser camera barcode scanner that returns barcode string and format.",
        _ops: Object.values(BARCODE_SCANNER_OPS)
      }
    ]
  },
  _examples: [
    {
      _module: BARCODE_SCANNER_MODULE_ID,
      _op: "start-scan",
      _params: {
        preview_container_id: "barcode-preview",
        output_key: BARCODE_SCANNER_RESULT_KEY
      }
    },
    {
      _module: BARCODE_SCANNER_MODULE_ID,
      _op: "stop-scan",
      _params: {}
    },
    {
      _module: BARCODE_SCANNER_MODULE_ID,
      _op: "get-capabilities",
      _params: {}
    }
  ],
  _core_rules: [
    "Camera access starts only after an explicit start-scan command.",
    "The module owns the camera stream, detection loop, and barcode extraction.",
    "Stop all media tracks after success, cancellation, timeout, or failure.",
    "Return only barcode string and format; product lookup remains food-product-lookup.find-barcode."
  ]
};
