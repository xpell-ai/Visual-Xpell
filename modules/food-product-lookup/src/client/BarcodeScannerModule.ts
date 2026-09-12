import {
  XModule,
  XUI,
  _xd,
  type XCommand
} from "@xpell/ui";

import {
  BARCODE_SCANNER_DEFAULT_FORMATS,
  type BarcodeScannerErrorCode,
  BARCODE_SCANNER_MODULE_ID,
  BARCODE_SCANNER_OPS,
  BARCODE_SCANNER_RESULT_KEY,
  BARCODE_SCANNER_SKILL,
  BARCODE_SCANNER_STATE_KEY,
  type BarcodeScannerCapabilities,
  type BarcodeScannerResponse,
  type BarcodeScannerResult,
  type BarcodeScannerStartParams
} from "../shared/barcodeScannerContract.js";

type BarcodeDetection = {
  rawValue?: string;
  format?: string;
};

type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<BarcodeDetection[]>;
};

type BarcodeDetectorConstructor = {
  new(options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

type ActiveScan = {
  stream: MediaStream;
  video: HTMLVideoElement;
  preview_container: Element | null;
  output_key: string;
  state_key: string;
  cancelled: boolean;
  resolve?: (value: BarcodeScannerResponse<BarcodeScannerResult>) => void;
};

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;
const MIN_TIMEOUT_MS = 1000;
const DIGIT_BARCODE = /^\d{6,14}$/;

function success(result: BarcodeScannerResult): BarcodeScannerResponse<BarcodeScannerResult> {
  return {
    _ok: true,
    _result: result
  };
}

function failure(
  code: BarcodeScannerErrorCode,
  message: string,
  details?: Record<string, unknown>
): BarcodeScannerResponse<BarcodeScannerResult> {
  return {
    _ok: false,
    _error: {
      _code: code,
      _message: message,
      ...(details ? { _details: details } : {})
    }
  };
}

function read_string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalize_format(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replaceAll("-", "_")
    : "unknown";
}

function requested_formats(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : [...BARCODE_SCANNER_DEFAULT_FORMATS];

  const formats = raw
    .map(normalize_format)
    .filter((format) => format && format !== "unknown");

  return [...new Set(formats)];
}

function normalize_timeout(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(value)));
}

function is_permission_error(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "NotAllowedError" || err.name === "SecurityError" || err.name === "PermissionDeniedError";
}

function request_next_frame(callback: () => void): number | undefined {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(() => callback());
  }

  if (typeof globalThis.setTimeout === "function") {
    globalThis.setTimeout(callback, 50);
  }

  return undefined;
}

export class BarcodeScannerModule extends XModule {
  static _name = BARCODE_SCANNER_MODULE_ID;
  static _ops = BARCODE_SCANNER_OPS;
  static _skill = BARCODE_SCANNER_SKILL;

  _name = BARCODE_SCANNER_MODULE_ID;

  private active_scan: ActiveScan | null = null;

  constructor() {
    super({ _name: BarcodeScannerModule._name });
  }

  get_readiness() {
    return {
      _ready: true,
      _status: "ready" as const,
      _checks: {
        module_loaded: true
      }
    };
  }

  async _get_capabilities(): Promise<BarcodeScannerResponse<BarcodeScannerCapabilities>> {
    const detector = this.get_detector_constructor();
    const requested = [...BARCODE_SCANNER_DEFAULT_FORMATS];
    const supported = detector ? await this.read_supported_formats(detector) : [];

    return {
      _ok: true,
      _result: {
        camera_available: Boolean(globalThis.navigator?.mediaDevices?.getUserMedia),
        native_barcode_detector_available: Boolean(detector),
        supported_formats: supported,
        requested_formats: requested,
        fallback_available: false,
        secure_context_required: true,
        secure_context: typeof window === "undefined" ? false : window.isSecureContext === true
      }
    };
  }

  async _start_scan(xcmd: XCommand): Promise<BarcodeScannerResponse<BarcodeScannerResult>> {
    const params = (xcmd?._params ?? {}) as BarcodeScannerStartParams;
    const output_key = read_string(params.output_key) ?? BARCODE_SCANNER_RESULT_KEY;
    const state_key = read_string(params.state_key) ?? BARCODE_SCANNER_STATE_KEY;
    const formats = requested_formats(params.formats);
    const timeout_ms = normalize_timeout(params.timeout_ms);

    await this.stop_active_scan(success({
      found: false,
      barcode: null,
      format: null,
      _status: "stopped"
    }));

    const detector_constructor = this.get_detector_constructor();

    if (!detector_constructor) {
      const res = failure("E_BARCODE_DETECTOR_UNAVAILABLE", "BarcodeDetector is not available in this browser.");
      this.write_state(state_key, "error", res);
      return res;
    }

    const supported_formats = await this.read_supported_formats(detector_constructor);
    const usable_formats = supported_formats.length > 0
      ? formats.filter((format) => supported_formats.includes(format))
      : formats;

    if (usable_formats.length === 0) {
      const res = failure("E_BARCODE_DETECTOR_UNAVAILABLE", "No requested product barcode formats are supported.", {
        requested_formats: formats,
        supported_formats
      });
      this.write_state(state_key, "error", res);
      return res;
    }

    if (!globalThis.navigator?.mediaDevices?.getUserMedia) {
      const res = failure("E_CAMERA_UNAVAILABLE", "Camera access is not available in this browser.");
      this.write_state(state_key, "error", res);
      return res;
    }

    let stream: MediaStream;

    try {
      stream = await globalThis.navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: "environment"
          }
        },
        audio: false
      });
    } catch (err) {
      const res = failure(
        is_permission_error(err) ? "E_CAMERA_PERMISSION_DENIED" : "E_CAMERA_UNAVAILABLE",
        is_permission_error(err) ? "Camera permission was denied." : "Unable to start the camera."
      );
      this.write_state(state_key, "error", res);
      return res;
    }

    const video = this.create_video(params.preview_container_id);
    video.srcObject = stream;

    try {
      await video.play();
    } catch {
      this.stop_stream(stream);
      video.remove();
      const res = failure("E_SCAN_FAILED", "Unable to start the camera preview.");
      this.write_state(state_key, "error", res);
      return res;
    }

    const detector = new detector_constructor({ formats: usable_formats });

    return new Promise((resolve) => {
      const active: ActiveScan = {
        stream,
        video,
        preview_container: video.parentElement,
        output_key,
        state_key,
        cancelled: false,
        resolve
      };

      this.active_scan = active;
      this.write_state(state_key, "scanning", {
        formats: usable_formats,
        output_key
      });

      this.scan_frame(detector, active, Date.now() + timeout_ms);
    });
  }

  async _stop_scan(xcmd: XCommand): Promise<BarcodeScannerResponse<BarcodeScannerResult>> {
    const params = (xcmd?._params ?? {}) as BarcodeScannerStartParams;
    const output_key = read_string(params.output_key) ?? this.active_scan?.output_key ?? BARCODE_SCANNER_RESULT_KEY;
    const state_key = read_string(params.state_key) ?? this.active_scan?.state_key ?? BARCODE_SCANNER_STATE_KEY;
    const stopped_result: BarcodeScannerResult = {
      found: false,
      barcode: null,
      format: null,
      _status: this.active_scan ? "cancelled" : "stopped"
    };
    const result = success(stopped_result);

    _xd.set(output_key, stopped_result, { source: BARCODE_SCANNER_MODULE_ID });
    await this.stop_active_scan(result);
    this.write_state(state_key, stopped_result._status ?? "stopped", stopped_result);
    return result;
  }

  dispose() {
    void this.stop_active_scan(success({
      found: false,
      barcode: null,
      format: null,
      _status: "stopped"
    }));
  }

  private get_detector_constructor(): BarcodeDetectorConstructor | null {
    const detector = (globalThis as typeof globalThis & {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }).BarcodeDetector;

    return typeof detector === "function" ? detector : null;
  }

  private async read_supported_formats(detector: BarcodeDetectorConstructor): Promise<string[]> {
    if (typeof detector.getSupportedFormats !== "function") return [];

    try {
      const supported = await detector.getSupportedFormats();
      return Array.isArray(supported)
        ? supported.map(normalize_format).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  private create_video(preview_container_id: string | undefined): HTMLVideoElement {
    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("data-xpell-module", BARCODE_SCANNER_MODULE_ID);
    video.setAttribute("aria-label", "Barcode scanner camera preview");

    const container = this.resolve_preview_container(preview_container_id);
    container?.appendChild(video);

    return video;
  }

  private resolve_preview_container(preview_container_id: string | undefined): Element | null {
    const id = read_string(preview_container_id);
    if (!id || typeof document === "undefined") return null;

    const xui_object = typeof XUI.getObject === "function" ? XUI.getObject(id) as any : null;
    const dom = xui_object?.dom ?? xui_object?.getDOMObject?.();
    if (dom instanceof Element) return dom;

    return document.getElementById(id);
  }

  private scan_frame(detector: BarcodeDetectorLike, active: ActiveScan, deadline_ms: number) {
    if (active.cancelled || this.active_scan !== active) return;

    if (Date.now() > deadline_ms) {
      const result = success({
        found: false,
        barcode: null,
        format: null,
        _status: "timeout"
      });
      this.finish_scan(active, result);
      return;
    }

    detector.detect(active.video)
      .then((detections) => {
        if (active.cancelled || this.active_scan !== active) return;

        const detected = this.first_valid_detection(detections);

        if (detected) {
          this.finish_scan(active, success({
            found: true,
            barcode: detected.barcode,
            format: detected.format,
            _status: "found"
          }));
          return;
        }

        request_next_frame(() => this.scan_frame(detector, active, deadline_ms));
      })
      .catch(() => {
        if (active.cancelled || this.active_scan !== active) return;
        this.finish_scan(active, failure("E_SCAN_FAILED", "Barcode detection failed."));
      });
  }

  private first_valid_detection(detections: BarcodeDetection[]): { barcode: string; format: string } | null {
    if (!Array.isArray(detections)) return null;

    for (const detection of detections) {
      const barcode = typeof detection?.rawValue === "string" ? detection.rawValue.trim() : "";
      const format = normalize_format(detection?.format);

      if (barcode && DIGIT_BARCODE.test(barcode)) {
        return {
          barcode,
          format
        };
      }
    }

    return null;
  }

  private finish_scan(active: ActiveScan, result: BarcodeScannerResponse<BarcodeScannerResult>) {
    this.write_result(active, result);
    this.cleanup(active);
    if (this.active_scan === active) this.active_scan = null;
    active.resolve?.(result);
  }

  private async stop_active_scan(result: BarcodeScannerResponse<BarcodeScannerResult>) {
    const active = this.active_scan;
    if (!active) return;

    active.cancelled = true;
    this.write_result(active, result);
    this.cleanup(active);
    this.active_scan = null;
    active.resolve?.(result);
  }

  private cleanup(active: ActiveScan) {
    this.stop_stream(active.stream);
    active.video.srcObject = null;
    active.video.remove();
  }

  private stop_stream(stream: MediaStream) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  }

  private write_result(active: ActiveScan, result: BarcodeScannerResponse<BarcodeScannerResult>) {
    if (result._ok) {
      _xd.set(active.output_key, result._result, { source: BARCODE_SCANNER_MODULE_ID });
      this.write_state(active.state_key, result._result._status ?? "idle", result._result);
      return;
    }

    this.write_state(active.state_key, "error", result);
  }

  private write_state(state_key: string, status: string, value: unknown) {
    _xd.set(state_key, {
      _status: status,
      _value: value
    }, { source: BARCODE_SCANNER_MODULE_ID });
  }
}

export function createBarcodeScannerModule(): BarcodeScannerModule {
  return new BarcodeScannerModule();
}
