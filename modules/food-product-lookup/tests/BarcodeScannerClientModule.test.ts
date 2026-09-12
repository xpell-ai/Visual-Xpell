import assert from "node:assert/strict";
import path from "node:path";
import { createRequire, register } from "node:module";

const require = createRequire(import.meta.url);
const xpellUiPackageJson = require.resolve("@xpell/ui/package.json");
const xpellUiRoot = path.dirname(xpellUiPackageJson);

register(path.join(xpellUiRoot, "tests", "ignore-css-loader.mjs"), import.meta.url);

class TestElement {
  tagName: string;
  attributes: Record<string, string> = {};
  children: TestElement[] = [];
  parentElement: TestElement | null = null;
  style: Record<string, string> = {};
  textContent = "";

  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
  }

  appendChild(child: TestElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  setAttribute(key: string, value: string) {
    this.attributes[key] = String(value);
  }

  getAttribute(key: string) {
    return this.attributes[key] ?? null;
  }
}

class TestVideoElement extends TestElement {
  autoplay = false;
  muted = false;
  playsInline = false;
  srcObject: unknown = null;

  constructor() {
    super("video");
  }

  async play() {
    return undefined;
  }
}

const elements = new Map<string, TestElement>();
const preview = new TestElement("div");
elements.set("barcode-preview", preview);

Object.defineProperty(globalThis, "Element", {
  value: TestElement,
  configurable: true
});

Object.defineProperty(globalThis, "HTMLElement", {
  value: TestElement,
  configurable: true
});

Object.defineProperty(globalThis, "HTMLVideoElement", {
  value: TestVideoElement,
  configurable: true
});

Object.defineProperty(globalThis, "document", {
  value: {
    body: new TestElement("body"),
    createElement(tag: string) {
      return tag === "video" ? new TestVideoElement() : new TestElement(tag);
    },
    getElementById(id: string) {
      return elements.get(id) ?? null;
    }
  },
  configurable: true
});

Object.defineProperty(globalThis, "window", {
  value: {
    isSecureContext: true,
    requestAnimationFrame(callback: FrameRequestCallback) {
      queueMicrotask(() => callback(Date.now()));
      return 1;
    }
  },
  configurable: true
});

type Track = {
  stopped: boolean;
  stop(): void;
};

type CameraInstall = {
  constraints: unknown[];
  tracks: Track[];
};

function install_camera(options: { reject?: Error } = {}): CameraInstall {
  const constraints: unknown[] = [];
  const tracks: Track[] = [
    {
      stopped: false,
      stop() {
        this.stopped = true;
      }
    }
  ];
  const stream = {
    getTracks() {
      return tracks;
    }
  };

  Object.defineProperty(globalThis, "navigator", {
    value: {
      mediaDevices: {
        async getUserMedia(next_constraints: unknown) {
          constraints.push(next_constraints);
          if (options.reject) throw options.reject;
          return stream;
        }
      }
    },
    configurable: true
  });

  return {
    constraints,
    tracks
  };
}

function remove_camera() {
  Object.defineProperty(globalThis, "navigator", {
    value: {},
    configurable: true
  });
}

type Detection = {
  rawValue?: string;
  format?: string;
};

class MockBarcodeDetector {
  static supported_formats: string[] = ["ean_13", "ean_8", "upc_a", "upc_e", "itf"];
  static detections: Detection[][] = [];
  static throw_detect = false;
  static constructed_formats: string[][] = [];

  constructor(options?: { formats?: string[] }) {
    MockBarcodeDetector.constructed_formats.push(options?.formats ?? []);
  }

  static async getSupportedFormats() {
    return MockBarcodeDetector.supported_formats;
  }

  async detect() {
    if (MockBarcodeDetector.throw_detect) {
      throw new Error("detector failed");
    }

    return MockBarcodeDetector.detections.shift() ?? [];
  }
}

function install_detector() {
  MockBarcodeDetector.supported_formats = ["ean_13", "ean_8", "upc_a", "upc_e", "itf"];
  MockBarcodeDetector.detections = [];
  MockBarcodeDetector.throw_detect = false;
  MockBarcodeDetector.constructed_formats = [];

  Object.defineProperty(globalThis, "BarcodeDetector", {
    value: MockBarcodeDetector,
    configurable: true
  });
}

function remove_detector() {
  Object.defineProperty(globalThis, "BarcodeDetector", {
    value: undefined,
    configurable: true
  });
}

const {
  BARCODE_SCANNER_DEFAULT_FORMATS,
  BARCODE_SCANNER_MODULE_ID,
  BARCODE_SCANNER_OPS,
  BARCODE_SCANNER_RESULT_KEY,
  BARCODE_SCANNER_SKILL,
  BarcodeScannerModule,
  createBarcodeScannerModule
} = await import("../src/client/index.js");
const { _x, _xd, XUI } = await import("@xpell/ui");

function command(params: Record<string, unknown> = {}) {
  return {
    _module: BARCODE_SCANNER_MODULE_ID,
    _op: "start-scan",
    _params: params
  } as any;
}

async function test_contract_and_exports() {
  const self_reference = await import("@xpell/food-product-lookup/client");
  assert.equal(self_reference.BARCODE_SCANNER_MODULE_ID, BARCODE_SCANNER_MODULE_ID);

  const module = createBarcodeScannerModule();
  assert.ok(module instanceof BarcodeScannerModule);
  assert.equal(module._name, "barcode-scanner");
  assert.deepEqual(Object.keys(BARCODE_SCANNER_OPS), ["start-scan", "stop-scan", "get-capabilities"]);
  assert.equal(BarcodeScannerModule._name, BARCODE_SCANNER_MODULE_ID);
  assert.equal(BarcodeScannerModule._ops, BARCODE_SCANNER_OPS);
  assert.equal(BarcodeScannerModule._skill, BARCODE_SCANNER_SKILL);
  assert.equal(BARCODE_SCANNER_SKILL._type, "client-module-api");
  assert.equal(BARCODE_SCANNER_SKILL._runtime._target, "client");
  assert.equal(BARCODE_SCANNER_SKILL._description?.includes("food-product-lookup.find-barcode"), true);
  assert.equal(module.get_readiness()._ready, true);
}

async function test_capabilities_native_available_and_absent() {
  install_detector();
  install_camera();

  const module = createBarcodeScannerModule();
  const available = await module._get_capabilities();
  assert.equal(available._ok, true);
  assert.equal(available._result.camera_available, true);
  assert.equal(available._result.native_barcode_detector_available, true);
  assert.deepEqual(available._result.supported_formats, [...BARCODE_SCANNER_DEFAULT_FORMATS]);
  assert.deepEqual(available._result.requested_formats, [...BARCODE_SCANNER_DEFAULT_FORMATS]);
  assert.equal(available._result.fallback_available, false);
  assert.equal(available._result.secure_context, true);

  remove_detector();
  remove_camera();

  const absent = await module._get_capabilities();
  assert.equal(absent._ok, true);
  assert.equal(absent._result.camera_available, false);
  assert.equal(absent._result.native_barcode_detector_available, false);
  assert.deepEqual(absent._result.supported_formats, []);
}

async function test_successful_scan_requests_camera_and_stops_tracks() {
  install_detector();
  const camera = install_camera();
  preview.children = [];
  XUI.getObject = (() => ({ dom: preview })) as any;
  MockBarcodeDetector.detections = [
    [{ rawValue: "", format: "ean_13" }],
    [{ rawValue: "0123456789012", format: "ean-13" }]
  ];

  const module = createBarcodeScannerModule();
  const result = await module._start_scan(command({
    preview_container_id: "barcode-preview",
    output_key: "test:barcode-result",
    timeout_ms: 5000
  }));

  assert.equal(result._ok, true);
  assert.deepEqual(result._result, {
    found: true,
    barcode: "0123456789012",
    format: "ean_13",
    _status: "found"
  });
  assert.equal((camera.constraints[0] as any).video.facingMode.ideal, "environment");
  assert.deepEqual(MockBarcodeDetector.constructed_formats[0], [...BARCODE_SCANNER_DEFAULT_FORMATS]);
  assert.equal(camera.tracks[0]?.stopped, true);
  assert.equal(preview.children.length, 0);
  assert.deepEqual(_xd.get("test:barcode-result"), result._result);
}

async function test_start_errors() {
  remove_detector();
  install_camera();

  const module = createBarcodeScannerModule();
  const no_detector = await module._start_scan(command());
  assert.equal(no_detector._ok, false);
  assert.equal(no_detector._error._code, "E_BARCODE_DETECTOR_UNAVAILABLE");

  install_detector();
  remove_camera();

  const no_camera = await module._start_scan(command());
  assert.equal(no_camera._ok, false);
  assert.equal(no_camera._error._code, "E_CAMERA_UNAVAILABLE");

  const denied = new Error("denied");
  denied.name = "NotAllowedError";
  install_camera({ reject: denied });

  const permission = await module._start_scan(command());
  assert.equal(permission._ok, false);
  assert.equal(permission._error._code, "E_CAMERA_PERMISSION_DENIED");
}

async function test_unsupported_formats_and_detector_failure_cleanup() {
  install_detector();
  MockBarcodeDetector.supported_formats = ["qr_code"];
  const unsupported = await createBarcodeScannerModule()._start_scan(command());
  assert.equal(unsupported._ok, false);
  assert.equal(unsupported._error._code, "E_BARCODE_DETECTOR_UNAVAILABLE");

  install_detector();
  const camera = install_camera();
  MockBarcodeDetector.throw_detect = true;

  const failed = await createBarcodeScannerModule()._start_scan(command({
    preview_container_id: "barcode-preview"
  }));

  assert.equal(failed._ok, false);
  assert.equal(failed._error._code, "E_SCAN_FAILED");
  assert.equal(camera.tracks[0]?.stopped, true);
}

async function test_stop_cancel_releases_camera_and_resolves_scan() {
  install_detector();
  const camera = install_camera();
  let release_detection: (value: Detection[]) => void = () => {};

  class PendingDetector extends MockBarcodeDetector {
    async detect() {
      return new Promise<Detection[]>((resolve) => {
        release_detection = resolve;
      });
    }
  }

  Object.defineProperty(globalThis, "BarcodeDetector", {
    value: PendingDetector,
    configurable: true
  });

  const module = createBarcodeScannerModule();
  const scan = module._start_scan(command({
    output_key: "test:cancel-result"
  }));

  await new Promise((resolve) => setTimeout(resolve, 0));

  const stopped = await module._stop_scan(command());
  assert.equal(stopped._ok, true);
  assert.equal(stopped._result._status, "cancelled");
  assert.equal(camera.tracks[0]?.stopped, true);
  assert.deepEqual(_xd.get("test:cancel-result"), stopped._result);

  release_detection([]);
  const scan_result = await scan;
  assert.equal(scan_result._ok, true);
  assert.equal(scan_result._result._status, "cancelled");
}

async function test_runtime_registration_and_skill_discovery() {
  install_detector();
  install_camera();

  const modules = (_x as any)._modules ?? {};
  const previous = modules[BARCODE_SCANNER_MODULE_ID];
  delete modules[BARCODE_SCANNER_MODULE_ID];

  try {
    const module = createBarcodeScannerModule();
    await _x.loadModuleAsync(module);

    const capabilities = await _x.execute({
      _module: BARCODE_SCANNER_MODULE_ID,
      _op: "get-capabilities",
      _params: {}
    });

    assert.equal(capabilities._ok, true);
    assert.equal(capabilities._result.native_barcode_detector_available, true);

    const skills = _x.getSkills();
    const module_entry = skills._modules.find((entry: any) => entry._name === BARCODE_SCANNER_MODULE_ID);
    const skill = module_entry?._skills?.find((entry: any) => entry._id === BARCODE_SCANNER_MODULE_ID);
    const exported_module = skill?._exports?._modules?.find(
      (entry: any) => entry._name === BARCODE_SCANNER_MODULE_ID
    );

    assert.ok(module_entry);
    assert.ok(skill);
    assert.equal(skill._type, "client-module-api");
    assert.equal(skill._runtime._target, "client");
    assert.equal(skill._ops["start-scan"]._id, "start-scan");
    assert.equal(exported_module?._scope, "client");
    assert.equal(Array.isArray(exported_module?._ops), true);
  } finally {
    if (previous) {
      modules[BARCODE_SCANNER_MODULE_ID] = previous;
    } else {
      delete modules[BARCODE_SCANNER_MODULE_ID];
    }
  }
}

async function run() {
  assert.equal(BARCODE_SCANNER_RESULT_KEY, "barcode_scanner:result");
  await test_contract_and_exports();
  await test_capabilities_native_available_and_absent();
  await test_successful_scan_requests_camera_and_stops_tracks();
  await test_start_errors();
  await test_unsupported_formats_and_detector_failure_cleanup();
  await test_stop_cancel_releases_camera_and_resolves_scan();
  await test_runtime_registration_and_skill_discovery();
}

await run();
