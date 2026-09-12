import crypto from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import { XError, _xlog } from "@xpell/node";

type JsonObject = Record<string, any>;

export type PackagedSystemApp = {
  _app_id: string;
  _type: "system_app";
  _path: string;
  _entry: string;
  _source_dir: string;
  _target_dir: string;
};

export type PackagedSystemXAppsManifest = {
  _schema: string;
  _owner_package: string;
  _manifest_path: string;
  _manifest_dir: string;
  _apps: PackagedSystemApp[];
};

export type PackagedSystemXAppsInstall = {
  _runtime_root: string;
  _manifest_path: string;
  _manifest_hash: string;
  _apps: PackagedSystemApp[];
};

const PACKAGE_NAME = "@xpell/ui";
const MANIFEST_EXPORT = "@xpell/ui/system-xapps/manifest.json";
const INSTALL_STATE_FILE = ".xpell-ui-system-xapps-install.json";
const SAFE_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9_-]*$/u;

function xapp_resource_error(code: string, message: string, details: JsonObject = {}): never {
  throw new XError(code, message, {
    _meta: details,
  });
}

function read_json_file(file_path: string): JsonObject {
  try {
    return JSON.parse(fs.readFileSync(file_path, "utf-8"));
  } catch (error) {
    xapp_resource_error("E_SYSTEM_XAPPS_MANIFEST_READ_FAILED", "Failed to read packaged system-xapps manifest.", {
      _path: file_path,
      _error: error instanceof Error ? error.message : String(error),
    });
  }
}

function assert_inside(root: string, candidate: string, code: string, message: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    xapp_resource_error(code, message, {
      _root: root,
      _path: candidate,
    });
  }
}

function require_safe_segment(value: unknown, field: string): string {
  if (typeof value !== "string" || !SAFE_SEGMENT_PATTERN.test(value)) {
    xapp_resource_error("E_SYSTEM_XAPPS_INVALID_MANIFEST", "Packaged system app manifest contains an invalid safe segment.", {
      _field: field,
      _value: value ?? null,
    });
  }
  return value;
}

function normalize_manifest_app(raw: unknown, manifest_dir: string, runtime_root: string): PackagedSystemApp {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    xapp_resource_error("E_SYSTEM_XAPPS_INVALID_MANIFEST", "Packaged system app manifest contains an invalid app entry.");
  }

  const app = raw as JsonObject;
  const app_id = require_safe_segment(app._app_id, "_app_id");
  const app_path = require_safe_segment(app._path, "_path");
  const entry = typeof app._entry === "string" && app._entry.trim()
    ? app._entry.trim()
    : "app.json";

  if (app._type !== "system_app") {
    xapp_resource_error("E_SYSTEM_XAPPS_INVALID_MANIFEST", "Packaged system app entry must be a system app.", {
      _app_id: app_id,
      _type: app._type ?? null,
    });
  }

  const source_dir = path.resolve(manifest_dir, app_path);
  assert_inside(manifest_dir, source_dir, "E_SYSTEM_XAPPS_INVALID_MANIFEST", "Packaged system app path escapes manifest root.");

  const entry_file = path.resolve(source_dir, entry);
  assert_inside(source_dir, entry_file, "E_SYSTEM_XAPPS_INVALID_MANIFEST", "Packaged system app entry escapes app root.");
  if (!fs.existsSync(entry_file) || !fs.statSync(entry_file).isFile()) {
    xapp_resource_error("E_SYSTEM_XAPPS_RESOURCE_MISSING", "Packaged system app entry file is missing.", {
      _app_id: app_id,
      _entry: entry,
      _path: entry_file,
    });
  }

  return {
    _app_id: app_id,
    _type: "system_app",
    _path: app_path,
    _entry: entry,
    _source_dir: source_dir,
    _target_dir: path.resolve(runtime_root, app_id),
  };
}

export function resolvePackagedSystemXAppsManifest(input: {
  _runtime_root?: string;
  _require_from?: string | URL;
} = {}): PackagedSystemXAppsManifest {
  let manifest_path = "";

  try {
    const require_from = input._require_from ?? import.meta.url;
    const require = createRequire(require_from);
    manifest_path = require.resolve(MANIFEST_EXPORT);
  } catch (error) {
    xapp_resource_error("E_SYSTEM_XAPPS_PACKAGE_RESOLUTION_FAILED", "Failed to resolve @xpell/ui packaged system-xapps manifest.", {
      _package: PACKAGE_NAME,
      _resource: "system-xapps/manifest.json",
      _error: error instanceof Error ? error.message : String(error),
    });
  }

  const manifest_dir = path.dirname(manifest_path);
  const runtime_root = path.resolve(input._runtime_root ?? path.join(process.cwd(), "work", "system-xapps"));
  const raw = read_json_file(manifest_path);

  if (raw._owner_package !== PACKAGE_NAME || !Array.isArray(raw._apps)) {
    xapp_resource_error("E_SYSTEM_XAPPS_INVALID_MANIFEST", "Invalid @xpell/ui system-xapps manifest.", {
      _path: manifest_path,
      _owner_package: raw._owner_package ?? null,
      _apps_type: Array.isArray(raw._apps) ? "array" : typeof raw._apps,
    });
  }

  return {
    _schema: typeof raw._schema === "string" ? raw._schema : "",
    _owner_package: raw._owner_package,
    _manifest_path: manifest_path,
    _manifest_dir: manifest_dir,
    _apps: raw._apps.map((app: unknown) => normalize_manifest_app(app, manifest_dir, runtime_root)),
  };
}

function hash_installed_source(manifest_path: string, apps: PackagedSystemApp[]): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(manifest_path));
  for (const app of apps) {
    const files = collect_files(app._source_dir);
    for (const file of files) {
      hash.update(path.relative(app._source_dir, file));
      hash.update(fs.readFileSync(file));
    }
  }
  return hash.digest("hex");
}

function collect_files(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file_path = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collect_files(file_path));
    } else if (entry.isFile()) {
      out.push(file_path);
    }
  }
  return out.sort();
}

function read_previous_installed_apps(runtime_root: string): string[] {
  const state_path = path.join(runtime_root, INSTALL_STATE_FILE);
  if (!fs.existsSync(state_path)) return [];
  try {
    const state = JSON.parse(fs.readFileSync(state_path, "utf-8"));
    return Array.isArray(state?._installed_apps)
      ? state._installed_apps.map(String).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function installPackagedSystemXApps(input: {
  _work_folder: string;
  _require_from?: string | URL;
}): PackagedSystemXAppsInstall {
  const runtime_root = path.resolve(input._work_folder, "system-xapps");
  const manifest = resolvePackagedSystemXAppsManifest({
    _runtime_root: runtime_root,
    _require_from: input._require_from,
  });
  const current_app_ids = new Set(manifest._apps.map((app) => app._app_id));

  fs.mkdirSync(runtime_root, { recursive: true });

  for (const app_id of read_previous_installed_apps(runtime_root)) {
    if (current_app_ids.has(app_id)) continue;
    const stale_dir = path.resolve(runtime_root, app_id);
    assert_inside(runtime_root, stale_dir, "E_SYSTEM_XAPPS_INSTALL_FAILED", "Stale system app path escapes runtime root.");
    fs.rmSync(stale_dir, { recursive: true, force: true });
  }

  for (const app of manifest._apps) {
    assert_inside(runtime_root, app._target_dir, "E_SYSTEM_XAPPS_INSTALL_FAILED", "System app install path escapes runtime root.");
    fs.rmSync(app._target_dir, { recursive: true, force: true });
    fs.cpSync(app._source_dir, app._target_dir, {
      recursive: true,
      errorOnExist: false,
      force: true,
    });
  }

  const manifest_hash = hash_installed_source(manifest._manifest_path, manifest._apps);
  fs.writeFileSync(path.join(runtime_root, INSTALL_STATE_FILE), `${JSON.stringify({
    _owner_package: PACKAGE_NAME,
    _manifest_path: manifest._manifest_path,
    _manifest_hash: manifest_hash,
    _installed_apps: Array.from(current_app_ids).sort(),
    _installed_at: new Date().toISOString(),
  }, null, 2)}\n`, "utf-8");

  _xlog.log("[vibe-server] packaged system apps installed", {
    _owner_package: PACKAGE_NAME,
    _runtime_root: runtime_root,
    _apps: Array.from(current_app_ids).sort(),
    _manifest_hash: manifest_hash,
  });

  return {
    _runtime_root: runtime_root,
    _manifest_path: manifest._manifest_path,
    _manifest_hash: manifest_hash,
    _apps: manifest._apps,
  };
}
