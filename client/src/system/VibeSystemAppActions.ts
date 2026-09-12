import { _xd, XModule, XUI, XUIRuntime } from "@xpell/ui";

type ImportStatus =
  | "idle"
  | "uploading"
  | "uploaded"
  | "inspecting"
  | "ready"
  | "importing"
  | "completed"
  | "failed";

type ImportState = {
  _open: boolean;
  _status: ImportStatus;
  _file_name: string;
  _file_size: number | null;
  _package_ref: string;
  _inspect: Record<string, any> | null;
  _preview: Record<string, any> | null;
  _error: string;
};

const XAPP_CONTENT_TYPE = "application/vnd.xpell.xapp+zip";
const DEFAULT_ENV = "default";
const IMPORT_MODAL_ID = "import-app-modal";
const IMPORT_FILE_ID = "import-app-file";

function empty_import_state(): ImportState {
  return {
    _open: false,
    _status: "idle",
    _file_name: "",
    _file_size: null,
    _package_ref: "",
    _inspect: null,
    _preview: null,
    _error: "",
  };
}

function to_result(raw: any) {
  if (raw && typeof raw === "object" && raw._ok === false) {
    throw raw._result ?? raw;
  }
  return raw?._result ?? raw;
}

function error_text(err: any): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err._message === "string") return err._message;
  if (typeof err.message === "string") return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function file_size_label(size: number | null) {
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${value} ${units[unit]}` : `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

function is_zip_bytes(bytes: Uint8Array) {
  if (bytes.length < 4) return false;
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
  const signature = bytes[2] << 8 | bytes[3];
  return signature === 0x0304 || signature === 0x0506 || signature === 0x0708;
}

function safe_filename(app_id: string) {
  const clean = app_id.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${clean || "app"}.xapp`;
}

function package_ref_from_result(result: any) {
  for (const value of [result?._package_ref, result?._package_reference, result?._ref]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function download_url_from_result(result: any) {
  for (const value of [result?._download_url, result?._download?._url, result?._url]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function expected_size_from_result(result: any) {
  for (const value of [result?._size, result?._download?._size, result?._content_length]) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function manifest_files(manifest: any): any[] {
  return Array.isArray(manifest?._content?._files) ? manifest._content._files : [];
}

function manifest_count(manifest: any, kinds: string[]) {
  const wanted = new Set(kinds);
  return manifest_files(manifest).filter((file) => wanted.has(String(file?._kind ?? ""))).length;
}

function change_items(changes: any, group: string, kind: string): string[] {
  const values = changes?.[group]?.[kind];
  return Array.isArray(values) ? values.map(String).filter(Boolean) : [];
}

function has_replace_changes(preview: any) {
  const changes = preview?._changes;
  return ["_views", "_flows", "_entities", "_public_files"].some((group) =>
    change_items(changes, group, "_modified").length > 0 ||
    change_items(changes, group, "_deleted").length > 0
  );
}

function xapp_base_url() {
  const client: any = XUIRuntime.getClient();
  const wormhole_url = typeof client?._wormhole_url === "string" ? client._wormhole_url : "";
  try {
    const url = new URL(wormhole_url || window.location.href, window.location.href);
    url.protocol = url.protocol === "wss:" ? "https:" : url.protocol === "ws:" ? "http:" : url.protocol;
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return window.location.href;
  }
}

function resolve_transfer_url(url: string) {
  if (/^https?:\/\//iu.test(url)) return url;
  return new URL(url, xapp_base_url()).toString();
}

async function file_to_base64(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunk_size = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunk_size) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk_size));
  }
  return btoa(binary);
}

function download_blob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function blob_part_from_bytes(bytes: Uint8Array): BlobPart {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function find_file(args: any[]): File | null {
  for (const arg of args) {
    const files =
      arg?.target?.files ??
      arg?.currentTarget?.files ??
      arg?._event_target?.files ??
      arg?._event?.target?.files ??
      arg?.files ??
      arg?._files;
    if (files?.[0]) return files[0] as File;
  }
  return null;
}

export class VibeSystemAppActions extends XModule {
  static _name = "vibe-system";
  private _import_state: ImportState = empty_import_state();

  constructor() {
    super({ _name: VibeSystemAppActions._name });
  }

  private client() {
    return XUIRuntime.requireClient() as any;
  }

  private async send_server_xvm(_op: string, _params: Record<string, any>) {
    const result = await this.client().sendXcmd({ _module: "server-xvm", _op, _params });
    return to_result(result);
  }

  private env(value?: string) {
    return typeof value === "string" && value.trim() ? value.trim() : this.client()?._env ?? DEFAULT_ENV;
  }

  private set_status(message: string, level: "info" | "success" | "error" = "info") {
    _xd.set("system.package_status", { _message: message, _level: level, _ts: Date.now() }, { source: "vibe-system" });
    this.update_object("package-status-label", {
      _text: message,
      class: `package-status-label package-status-${level}`,
    });
  }

  private update_object(id: string, data: Record<string, any>) {
    const object = XUI.getObject(id) as any;
    object?.update?.(data);
  }

  private show_object(id: string) {
    const object = XUI.getObject(id) as any;
    object?.show?.();
  }

  private hide_object(id: string) {
    const object = XUI.getObject(id) as any;
    object?.hide?.();
  }

  private render_import_state() {
    const state = this._import_state;
    const preview = state._preview;
    const inspect = state._inspect;
    const manifest = preview?._manifest ?? inspect?._manifest ?? {};
    const app = manifest?._app ?? inspect?._app ?? {};
    const build = manifest?._build ?? {};
    const changes = preview?._changes ?? {};
    const status =
      state._status === "uploading" ? "Uploading package" :
        state._status === "uploaded" ? "Package uploaded" :
          state._status === "inspecting" ? "Inspecting package" :
            state._status === "ready" ? "Package ready" :
              state._status === "importing" ? "Importing package" :
                state._status === "completed" ? "Import complete" :
                  state._status === "failed" ? state._error :
                    "Select a .xapp package";

    const rows = [
      ["Views", "_views"],
      ["Flows", "_flows"],
      ["Entities", "_entities"],
      ["Assets/styles", "_public_files"],
    ].map(([label, group]) => ({
      _label: label,
      _added: change_items(changes, group, "_added").join(", ") || "None",
      _modified: change_items(changes, group, "_modified").join(", ") || "None",
      _deleted: change_items(changes, group, "_deleted").join(", ") || "None",
    }));

    this.update_object("import-app-selected-label", {
      _text: state._file_name
        ? `${state._file_name}${file_size_label(state._file_size) ? ` - ${file_size_label(state._file_size)}` : ""}`
        : "No package selected",
    });
    this.update_object("import-app-upload-label", { _text: status });
    this.update_object("import-app-package-label", {
      _text: state._preview || state._inspect
        ? `App ${app?._app_id ?? preview?._target_app_id ?? "Unknown"} - ${manifest?._format ?? "Unknown"} ${manifest?._format_version ?? ""}`.trim()
        : "Package metadata will appear after upload",
    });
    this.update_object("import-app-source-label", {
      _text: `Source env: ${build?._source_env ?? app?._env ?? "Unknown"}`,
    });
    this.update_object("import-app-counts-label", {
      _text: `Views ${manifest_count(manifest, ["view"])} / Flows ${manifest_count(manifest, ["flow"])} / Entities ${manifest_count(manifest, ["entity"])} / Assets ${manifest_count(manifest, ["asset", "style"])}`,
    });
    this.update_object("import-app-target-label", {
      _text: `Target: ${preview?._target_app_id ?? app?._app_id ?? "Unknown"} / ${preview?._target_env ?? this.env()}`,
    });
    this.update_object("import-app-replace-label", {
      _text: has_replace_changes(preview)
        ? "Replace/update: package-owned artifacts will be replaced. Conversations, Project Memory, XDB, old_views, vibe-runs, and runtime state are preserved."
        : "",
    });
    this.update_object("import-app-preview-table", { _rows: rows });
  }

  private publish_import_state() {
    const preview = this._import_state._preview;
    const inspect = this._import_state._inspect;
    const manifest = preview?._manifest ?? inspect?._manifest ?? {};
    const app = manifest?._app ?? inspect?._app ?? {};
    const build = manifest?._build ?? {};
    const changes = preview?._changes ?? {};
    const rows = [
      ["Views", "_views"],
      ["Flows", "_flows"],
      ["Entities", "_entities"],
      ["Assets/styles", "_public_files"],
    ].map(([label, group]) => ({
      _label: label,
      _added: change_items(changes, group, "_added").join(", ") || "None",
      _modified: change_items(changes, group, "_modified").join(", ") || "None",
      _deleted: change_items(changes, group, "_deleted").join(", ") || "None",
    }));

    _xd.set("system.import", {
      ...this._import_state,
      _file_size_label: file_size_label(this._import_state._file_size),
      _app_id: app?._app_id ?? preview?._target_app_id ?? "",
      _format: manifest?._format ?? "",
      _format_version: manifest?._format_version ?? "",
      _source_env: build?._source_env ?? app?._env ?? "",
      _target_app_id: preview?._target_app_id ?? app?._app_id ?? "",
      _target_env: preview?._target_env ?? this.env(),
      _views_count: manifest_count(manifest, ["view"]),
      _flows_count: manifest_count(manifest, ["flow"]),
      _entities_count: manifest_count(manifest, ["entity"]),
      _assets_count: manifest_count(manifest, ["asset", "style"]),
      _changes_rows: rows,
      _is_replace: has_replace_changes(preview),
      _replace_message: has_replace_changes(preview)
        ? "This is a replace/update. Package-owned artifacts will be replaced. Conversations, Project Memory, XDB, old_views, vibe-runs, and runtime state are preserved."
        : "",
    }, { source: "vibe-system" });
    this.render_import_state();
  }

  private async refresh_projects(env = this.env()) {
    const apps_result = await this.send_server_xvm("list-apps", { _env: env, _include_system: false });
    const apps = Array.isArray(apps_result?._apps) ? apps_result._apps : [];
    _xd.set("system.apps", apps, { source: "vibe-system" });
    return apps;
  }

  async _refresh_projects(xcmd: any) {
    const params = xcmd?._params ?? {};
    await this.refresh_projects(this.env(params._env));
    return { _ok: true };
  }

  async _set_default_app(xcmd: any) {
    const params = xcmd?._params ?? {};
    const app_id = String(params._app_id ?? params._row_app_id ?? "").trim();
    const env = this.env(params._env ?? params._row_env);
    if (!app_id) return { _ok: false, _result: { _message: "Set Default requires _app_id" } };

    this.set_status("Setting default app");
    try {
      const result = await this.send_server_xvm("set-default-app", { _app_id: app_id, _env: env });
      this.set_status(`Default app set to ${app_id}`, "success");
      return { _ok: true, _result: result };
    } catch (err) {
      const message = `Set Default failed: ${error_text(err)}`;
      this.set_status(message, "error");
      return { _ok: false, _result: { _message: message } };
    }
  }

  async _open_import_app() {
    this._import_state = { ...empty_import_state(), _open: true };
    this.publish_import_state();
    this.show_object(IMPORT_MODAL_ID);
    queueMicrotask(() => {
      const input = XUI.getObject(IMPORT_FILE_ID) as any;
      input?.dom?.focus?.();
    });
    return { _ok: true };
  }

  async _close_import_app() {
    this._import_state = empty_import_state();
    this.publish_import_state();
    this.hide_object(IMPORT_MODAL_ID);
    return { _ok: true };
  }

  async _select_import_file(xcmd: any) {
    const file = find_file([xcmd, xcmd?._event, xcmd?._params]);
    if (!file) return { _ok: false, _result: { _message: "No file selected" } };
    this._import_state = {
      ...empty_import_state(),
      _open: true,
      _status: "uploading",
      _file_name: file.name,
      _file_size: file.size,
    };
    this.publish_import_state();
    this.set_status("Uploading package");
    try {
      const bytes_base64 = await file_to_base64(file);
      const upload = await this.send_server_xvm("upload-app-package", {
        _filename: file.name,
        _size: file.size,
        _content_type: file.type || XAPP_CONTENT_TYPE,
        _bytes_base64: bytes_base64,
      });
      const package_ref = package_ref_from_result(upload);
      if (!package_ref) throw new Error("Upload completed without package reference.");
      this._import_state = { ...this._import_state, _status: "uploaded", _package_ref: package_ref };
      this.publish_import_state();
      await this._inspect_import_package({});
      return { _ok: true };
    } catch (err) {
      this._import_state = { ...this._import_state, _status: "failed", _error: `Upload failed: ${error_text(err)}` };
      this.publish_import_state();
      this.set_status(this._import_state._error, "error");
      return { _ok: false, _result: { _message: this._import_state._error } };
    }
  }

  async _inspect_import_package(xcmd: any) {
    const params = xcmd?._params ?? {};
    if (!this._import_state._package_ref) return { _ok: false };
    const env = this.env(params._env);
    this._import_state = { ...this._import_state, _status: "inspecting", _error: "" };
    this.publish_import_state();
    try {
      const inspect = await this.send_server_xvm("inspect-app-package", { _package_ref: this._import_state._package_ref });
      const preview = await this.send_server_xvm("preview-app-import", { _package_ref: this._import_state._package_ref, _env: env });
      this._import_state = { ...this._import_state, _status: "ready", _inspect: inspect, _preview: preview };
      this.publish_import_state();
      this.set_status("Package ready");
      return { _ok: true };
    } catch (err) {
      this._import_state = { ...this._import_state, _status: "failed", _error: `Package inspection failed: ${error_text(err)}` };
      this.publish_import_state();
      this.set_status(this._import_state._error, "error");
      return { _ok: false, _result: { _message: this._import_state._error } };
    }
  }

  async _confirm_import_app(xcmd: any) {
    const params = xcmd?._params ?? {};
    if (!this._import_state._package_ref || !this._import_state._preview) return { _ok: false };
    const env = this.env(params._env);
    const replacing = has_replace_changes(this._import_state._preview);
    const target = this._import_state._preview?._target_app_id ?? this._import_state._inspect?._app?._app_id ?? "app";
    const ok = window.confirm(
      replacing
        ? `Import ${target} as a replace/update? Package-owned artifacts will be replaced. Conversations, Project Memory, XDB, old_views, vibe-runs, and runtime state are preserved.`
        : `Import ${target}?`
    );
    if (!ok) return { _ok: false, _result: { _cancelled: true } };
    this._import_state = { ...this._import_state, _status: "importing", _error: "" };
    this.publish_import_state();
    try {
      await this.send_server_xvm("import-app", {
        _package_ref: this._import_state._package_ref,
        _env: env,
        _mode: "upsert",
      });
      this._import_state = { ...empty_import_state(), _status: "completed" };
      this.publish_import_state();
      await this.refresh_projects(env);
      this.hide_object(IMPORT_MODAL_ID);
      this.set_status("Import complete", "success");
      return { _ok: true };
    } catch (err) {
      this._import_state = { ...this._import_state, _status: "failed", _error: `Import failed: ${error_text(err)}` };
      this.publish_import_state();
      this.set_status(this._import_state._error, "error");
      return { _ok: false, _result: { _message: this._import_state._error } };
    }
  }

  async _export_app(xcmd: any) {
    const params = xcmd?._params ?? {};
    const app_id = String(params._app_id ?? params._row_app_id ?? "").trim();
    const env = this.env(params._env ?? params._row_env);
    if (!app_id) throw new Error("Export requires _app_id");
    const filename = safe_filename(app_id);
    this.set_status("Exporting");
    try {
      const result = await this.send_server_xvm("export-app", { _app_id: app_id, _env: env });
      const url = download_url_from_result(result);
      if (!url) throw new Error("Export did not return a download URL.");
      const response = await fetch(resolve_transfer_url(url));
      if (!response.ok) throw new Error(`Export download failed with HTTP ${response.status}.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const expected_size = expected_size_from_result(result);
      if (expected_size !== null && bytes.byteLength !== expected_size) {
        throw new Error(`Export size mismatch. Expected ${expected_size}, received ${bytes.byteLength}.`);
      }
      if (!is_zip_bytes(bytes)) throw new Error("Export did not return valid .xapp ZIP bytes.");
      download_blob(new Blob([blob_part_from_bytes(bytes)], { type: XAPP_CONTENT_TYPE }), filename);
      this.set_status("Export complete", "success");
      return { _ok: true, _result: { _filename: filename } };
    } catch (err) {
      const message = `Export failed: ${error_text(err)}`;
      this.set_status(message, "error");
      return { _ok: false, _result: { _message: message } };
    }
  }

  async _trash_app(xcmd: any) {
    const params = xcmd?._params ?? {};
    const app_id = String(params._app_id ?? params._row_app_id ?? "").trim();
    const env = this.env(params._env ?? params._row_env);
    if (!app_id || app_id === "vibe-system") return { _ok: false, _result: { _message: "System apps cannot be moved to Trash." } };
    const ok = window.confirm(`Move ${app_id} to Trash?\n\nThe app will disappear from My Projects. It can be restored later. This is not permanent deletion.`);
    if (!ok) return { _ok: false, _result: { _cancelled: true } };
    this.set_status("Moving to Trash");
    try {
      await this.send_server_xvm("trash-app", { _app_id: app_id, _env: env });
      await this.refresh_projects(env);
      this.set_status("Moved to Trash", "success");
      return { _ok: true };
    } catch (err) {
      const message = `Move to Trash failed: ${error_text(err)}`;
      this.set_status(message, "error");
      return { _ok: false, _result: { _message: message } };
    }
  }

  async _refresh_trash_count(xcmd: any) {
    const params = xcmd?._params ?? {};
    const env = this.env(params._env);
    try {
      const result = await this.send_server_xvm("list-trashed-apps", { _env: env });
      const apps = Array.isArray(result?._apps) ? result._apps : [];
      _xd.set("system.trash", { _count: apps.length, _apps: apps }, { source: "vibe-system" });
      return { _ok: true, _result: { _count: apps.length } };
    } catch (err) {
      this.set_status(`Trash unavailable: ${error_text(err)}`, "error");
      return { _ok: false };
    }
  }
}

export default VibeSystemAppActions;
