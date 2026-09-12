export type XRuntimeMode = "runtime" | "build" | "system" | "admin-login" | "admin-denied";

export type BootstrapSource = "html" | "server-fetch" | "safe-fallback";

type BootstrapMode = "runtime" | "admin" | "system" | "build" | "admin-login" | "admin-denied";

export type ServerBootstrapMetadata = {
  _mode?: BootstrapMode | string;
  _admin?: boolean;
  _app_id?: string | null;
  _env?: string | null;
  _authenticated?: boolean;
  _clearance_level?: number;
  _required_clearance_level?: number;
  _reason?: string;
};

export type BootstrapTarget = {
  _source: BootstrapSource;
  _mode: XRuntimeMode;
  _app_id: string | null;
  _env: string;
  _bootstrap: ServerBootstrapMetadata | null;
};

export type BootstrapResolveInput = {
  _window: Window & Record<string, any>;
  _document: Document;
  _fetch: typeof fetch;
  _pathname?: string;
  _search?: string;
  _warn?: (...args: any[]) => void;
};

const SAFE_FALLBACK_APP_ID = "vibe-system";
const SAFE_FALLBACK_ENV = "default";
const DEV_BOOTSTRAP_PROXY_ROOT = "/__xnode_bootstrap";

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function runtimeModeFromSearch(search: string): XRuntimeMode {
  const params = new URLSearchParams(search);
  if (params.get("system") === "true") return "system";
  return "runtime";
}

export function routeModeIsAdmin(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function resolveRuntimeMode(app_id: string, search: string): XRuntimeMode {
  const url_mode = runtimeModeFromSearch(search);
  if (url_mode !== "runtime") return url_mode;
  if (app_id === SAFE_FALLBACK_APP_ID) return "system";
  return "runtime";
}

function normalizeBootstrapTarget(
  bootstrap: ServerBootstrapMetadata | null,
  source: BootstrapSource,
  pathname: string,
  search: string,
): BootstrapTarget {
  const bootstrap_mode = firstString(bootstrap?._mode);
  const bootstrap_env = firstString(bootstrap?._env) || SAFE_FALLBACK_ENV;
  const bootstrap_app_id = firstString(bootstrap?._app_id);

  if (bootstrap && (bootstrap_mode === "admin-login" || bootstrap_mode === "admin-denied")) {
    return {
      _source: source,
      _app_id: null,
      _env: bootstrap_env,
      _mode: bootstrap_mode,
      _bootstrap: bootstrap,
    };
  }

  if (bootstrap && (bootstrap_mode === "admin" || bootstrap_mode === "system" || bootstrap._admin === true)) {
    return {
      _source: source,
      _app_id: SAFE_FALLBACK_APP_ID,
      _env: bootstrap_env,
      _mode: "system",
      _bootstrap: bootstrap,
    };
  }

  if (bootstrap && bootstrap_mode === "runtime" && bootstrap_app_id) {
    return {
      _source: source,
      _app_id: bootstrap_app_id,
      _env: bootstrap_env,
      _mode: "runtime",
      _bootstrap: bootstrap,
    };
  }

  if (bootstrap && bootstrap_app_id) {
    return {
      _source: source,
      _app_id: bootstrap_app_id,
      _env: bootstrap_env,
      _mode: resolveRuntimeMode(bootstrap_app_id, search),
      _bootstrap: bootstrap,
    };
  }

  return {
    _source: "safe-fallback",
    _app_id: routeModeIsAdmin(pathname) ? null : SAFE_FALLBACK_APP_ID,
    _env: SAFE_FALLBACK_ENV,
    _mode: routeModeIsAdmin(pathname) ? "admin-login" : resolveRuntimeMode(SAFE_FALLBACK_APP_ID, search),
    _bootstrap: null,
  };
}

function parseBootstrapJson(text: string, warn?: (...args: any[]) => void): ServerBootstrapMetadata | null {
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as ServerBootstrapMetadata : null;
  } catch (err) {
    warn?.("[xapp] invalid bootstrap metadata", err);
    return null;
  }
}

export function parseBootstrapHtml(html: string, warn?: (...args: any[]) => void): ServerBootstrapMetadata | null {
  const match = html.match(/<script\b[^>]*\bid=["']xpell-bootstrap["'][^>]*>([\s\S]*?)<\/script>/i);
  return match ? parseBootstrapJson(match[1] ?? "", warn) : null;
}

function readBootstrapMetadataFromElement(document_ref: Document, warn?: (...args: any[]) => void): ServerBootstrapMetadata | null {
  const element =
    document_ref.getElementById("xpell-bootstrap") ??
    document_ref.querySelector("script[type='application/json'][data-xpell-bootstrap]") ??
    document_ref.querySelector("script[type='application/json'][data-xnode-bootstrap]");

  return parseBootstrapJson(element?.textContent ?? "", warn);
}

export function readInjectedBootstrapMetadata(
  window_ref: Window & Record<string, any>,
  document_ref: Document,
  warn?: (...args: any[]) => void,
): ServerBootstrapMetadata | null {
  for (const value of [
    window_ref.__xpell_bootstrap,
    window_ref.__XPELL_BOOTSTRAP__,
    window_ref.__xnode_bootstrap,
    window_ref.__XNODE_BOOTSTRAP__,
    window_ref.__xvm_bootstrap,
    window_ref.__XVM_BOOTSTRAP__,
  ]) {
    if (value && typeof value === "object") return value as ServerBootstrapMetadata;
  }

  return readBootstrapMetadataFromElement(document_ref, warn);
}

export function canonicalBootstrapFetchPath(pathname: string): string {
  return routeModeIsAdmin(pathname)
    ? `${DEV_BOOTSTRAP_PROXY_ROOT}/admin`
    : `${DEV_BOOTSTRAP_PROXY_ROOT}/`;
}

export async function fetchCanonicalServerBootstrap(
  fetch_ref: typeof fetch,
  pathname: string,
  warn?: (...args: any[]) => void,
): Promise<ServerBootstrapMetadata | null> {
  const response = await fetch_ref(canonicalBootstrapFetchPath(pathname), {
    headers: {
      "Accept": "text/html",
    },
    credentials: "include",
  });

  if (!response.ok) {
    warn?.("[xapp] server bootstrap fetch failed", {
      _status: response.status,
      _path: canonicalBootstrapFetchPath(pathname),
    });
    return null;
  }

  return parseBootstrapHtml(await response.text(), warn);
}

export async function resolveBootstrapTarget(input: BootstrapResolveInput): Promise<BootstrapTarget> {
  const pathname = input._pathname ?? input._window.location.pathname;
  const search = input._search ?? input._window.location.search;
  const injected = readInjectedBootstrapMetadata(input._window, input._document, input._warn);

  if (injected) {
    return normalizeBootstrapTarget(injected, "html", pathname, search);
  }

  try {
    const fetched = await fetchCanonicalServerBootstrap(input._fetch, pathname, input._warn);
    if (fetched) {
      return normalizeBootstrapTarget(fetched, "server-fetch", pathname, search);
    }
  } catch (err) {
    input._warn?.("[xapp] server bootstrap fetch failed", err);
  }

  return normalizeBootstrapTarget(null, "safe-fallback", pathname, search);
}
