import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function compileBootstrapModule() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "xvibe-bootstrap-test-"));
  fs.writeFileSync(path.join(outDir, "package.json"), "{\"type\":\"module\"}\n", "utf8");

  const tsc = path.join(clientRoot, "node_modules", "typescript", "bin", "tsc");
  const result = spawnSync(process.execPath, [
    tsc,
    "src/bootstrap.ts",
    "src/runtime-policy.ts",
    "--outDir",
    outDir,
    "--target",
    "ES2022",
    "--module",
    "ES2022",
    "--moduleResolution",
    "Bundler",
    "--lib",
    "ES2022,DOM,DOM.Iterable",
    "--strict",
    "--skipLibCheck",
  ], {
    cwd: clientRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return {
    outDir,
    moduleUrl: pathToFileURL(path.join(outDir, "bootstrap.js")).href,
    policyModuleUrl: pathToFileURL(path.join(outDir, "runtime-policy.js")).href,
  };
}

function htmlBootstrap(data) {
  return `<!doctype html><html><head><script id="xpell-bootstrap" type="application/json">${JSON.stringify(data)}</script></head><body></body></html>`;
}

function documentWithBootstrap(data = null) {
  const element = data ? { textContent: JSON.stringify(data) } : null;
  return {
    getElementById(id) {
      return id === "xpell-bootstrap" ? element : null;
    },
    querySelector() {
      return null;
    },
  };
}

function windowWithBootstrap(data = null, pathname = "/", search = "") {
  return {
    __XPELL_BOOTSTRAP__: data,
    location: {
      pathname,
      search,
    },
    localStorage: {
      getItem() {
        throw new Error("localStorage must not be consulted for app selection");
      },
      clear() {},
    },
  };
}

function fetcherFor(htmlByPath, calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    if (!(url in htmlByPath)) {
      return {
        ok: false,
        status: 404,
        async text() {
          return "";
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return htmlByPath[url];
      },
    };
  };
}

const compiled = compileBootstrapModule();
try {
  const {
    canonicalBootstrapFetchPath,
    parseBootstrapHtml,
    resolveBootstrapTarget,
  } = await import(compiled.moduleUrl);
  const {
    runtimeEditorPolicy,
  } = await import(compiled.policyModuleUrl);

  assert.deepEqual(parseBootstrapHtml(htmlBootstrap({
    _mode: "runtime",
    _admin: false,
    _app_id: "parsed-app",
    _env: "default",
  })), {
    _mode: "runtime",
    _admin: false,
    _app_id: "parsed-app",
    _env: "default",
  });

  assert.equal(canonicalBootstrapFetchPath("/"), "/__xnode_bootstrap/");
  assert.equal(canonicalBootstrapFetchPath("/admin"), "/__xnode_bootstrap/admin");

  {
    const calls = [];
    const target = await resolveBootstrapTarget({
      _window: windowWithBootstrap({
        _mode: "runtime",
        _admin: false,
        _app_id: "html-app",
        _env: "default",
      }),
      _document: documentWithBootstrap(),
      _fetch: async () => {
        calls.push("fetch");
        throw new Error("fetch should not be called when injected bootstrap exists");
      },
    });
    assert.equal(target._source, "html");
    assert.equal(target._mode, "runtime");
    assert.equal(target._app_id, "html-app");
    assert.equal(target._env, "default");
    assert.deepEqual(calls, []);
  }

  {
    const calls = [];
    const target = await resolveBootstrapTarget({
      _window: windowWithBootstrap(null, "/", ""),
      _document: documentWithBootstrap(),
      _fetch: fetcherFor({
        "/__xnode_bootstrap/": htmlBootstrap({
          _mode: "runtime",
          _admin: false,
          _app_id: "dev-default-app",
          _env: "default",
        }),
      }, calls),
    });
    assert.equal(target._source, "server-fetch");
    assert.equal(target._mode, "runtime");
    assert.equal(target._app_id, "dev-default-app");
    assert.equal(calls[0].url, "/__xnode_bootstrap/");
    assert.equal(calls[0].options.headers.Accept, "text/html");
    assert.equal(calls[0].options.credentials, "include");
  }

  {
    const target = await resolveBootstrapTarget({
      _window: windowWithBootstrap(null, "/", ""),
      _document: documentWithBootstrap(),
      _fetch: fetcherFor({
        "/__xnode_bootstrap/": htmlBootstrap({
          _mode: "runtime",
          _admin: false,
          _app_id: "prod-app",
          _env: "default",
        }),
      }),
    });
    assert.equal(target._source, "server-fetch");
    assert.equal(target._mode, "runtime");
    assert.equal(target._app_id, "prod-app");
  }

  {
    const calls = [];
    const target = await resolveBootstrapTarget({
      _window: windowWithBootstrap(null, "/admin", ""),
      _document: documentWithBootstrap(),
      _fetch: fetcherFor({
        "/__xnode_bootstrap/admin": htmlBootstrap({
          _mode: "admin",
          _admin: true,
          _app_id: "vibe-system",
          _env: "default",
        }),
      }, calls),
    });
    assert.equal(target._source, "server-fetch");
    assert.equal(target._mode, "system");
    assert.equal(target._app_id, "vibe-system");
    assert.equal(calls[0].url, "/__xnode_bootstrap/admin");
    assert.equal(calls[0].options.credentials, "include");
  }

  {
    const calls = [];
    const target = await resolveBootstrapTarget({
      _window: windowWithBootstrap(null, "/admin", ""),
      _document: documentWithBootstrap(),
      _fetch: fetcherFor({
        "/__xnode_bootstrap/admin": htmlBootstrap({
          _mode: "admin-login",
          _admin: true,
          _app_id: null,
          _env: "default",
          _authenticated: false,
          _required_clearance_level: 100,
          _reason: "missing_session",
        }),
      }, calls),
    });
    assert.equal(target._source, "server-fetch");
    assert.equal(target._mode, "admin-login");
    assert.equal(target._app_id, null);
    assert.equal(target._bootstrap._reason, "missing_session");
    assert.equal(calls[0].url, "/__xnode_bootstrap/admin");
    assert.equal(calls[0].options.credentials, "include");
  }

  {
    const target = await resolveBootstrapTarget({
      _window: windowWithBootstrap(null, "/admin", ""),
      _document: documentWithBootstrap(),
      _fetch: fetcherFor({
        "/__xnode_bootstrap/admin": htmlBootstrap({
          _mode: "admin-denied",
          _admin: true,
          _app_id: null,
          _env: "default",
          _authenticated: true,
          _clearance_level: 99,
          _required_clearance_level: 100,
        }),
      }),
    });
    assert.equal(target._source, "server-fetch");
    assert.equal(target._mode, "admin-denied");
    assert.equal(target._app_id, null);
    assert.equal(target._bootstrap._clearance_level, 99);
  }

  {
    const target = await resolveBootstrapTarget({
      _window: windowWithBootstrap(null, "/admin", ""),
      _document: documentWithBootstrap(),
      _fetch: async () => {
        throw new Error("server unavailable");
      },
      _warn: () => {},
    });
    assert.equal(target._source, "safe-fallback");
    assert.equal(target._mode, "admin-login");
    assert.equal(target._app_id, null);
  }

  {
    const win = windowWithBootstrap(null, "/", "");
    win.localStorage.clear();
    const target = await resolveBootstrapTarget({
      _window: win,
      _document: documentWithBootstrap(),
      _fetch: fetcherFor({
        "/__xnode_bootstrap/": htmlBootstrap({
          _mode: "runtime",
          _admin: false,
          _app_id: "configured-default",
          _env: "default",
        }),
      }),
    });
    assert.equal(target._app_id, "configured-default");
  }

  {
    const target = await resolveBootstrapTarget({
      _window: windowWithBootstrap(null, "/", ""),
      _document: documentWithBootstrap(),
      _fetch: async () => {
        throw new Error("server unavailable");
      },
      _warn: () => {},
    });
    assert.equal(target._source, "safe-fallback");
    assert.equal(target._mode, "system");
    assert.equal(target._app_id, "vibe-system");
    assert.equal(target._env, "default");
  }

  {
    const win = windowWithBootstrap(null, "/", "");
    win.localStorage.getItem = (key) => {
      if (String(key).startsWith("xvm:last_app:")) return JSON.stringify({ _app: { _app_id: "cached-app" } });
      throw new Error(`unexpected localStorage key ${key}`);
    };
    const target = await resolveBootstrapTarget({
      _window: win,
      _document: documentWithBootstrap(),
      _fetch: fetcherFor({
        "/__xnode_bootstrap/": htmlBootstrap({
          _mode: "runtime",
          _admin: false,
          _app_id: "server-default",
          _env: "default",
        }),
      }),
    });
    assert.equal(target._app_id, "server-default");
  }

  {
    const target = await resolveBootstrapTarget({
      _window: windowWithBootstrap(null, "/", "?edit=true"),
      _document: documentWithBootstrap({
        _mode: "runtime",
        _admin: false,
        _app_id: "editable-app",
        _env: "default",
      }),
      _fetch: async () => {
        throw new Error("fetch should not be called for injected editor bootstrap");
      },
    });
    assert.equal(target._source, "html");
    assert.equal(target._mode, "runtime");
    assert.equal(target._app_id, "editable-app");
    assert.equal(runtimeEditorPolicy(target)._studio_enabled, false);
    assert.equal(runtimeEditorPolicy(target)._initial_edit, false);
    assert.equal(runtimeEditorPolicy(target)._load_studio_module, false);
    assert.equal(runtimeEditorPolicy(target)._register_studio_listeners, false);
    assert.equal(runtimeEditorPolicy(target)._allow_editor_shortcuts, false);
  }

  {
    const target = await resolveBootstrapTarget({
      _window: windowWithBootstrap(null, "/", ""),
      _document: documentWithBootstrap({
        _mode: "runtime",
        _admin: false,
        _app_id: "server-default",
        _env: "default",
      }),
      _fetch: async () => {
        throw new Error("fetch should not be called for injected runtime bootstrap");
      },
    });
    const policy = runtimeEditorPolicy(target);
    assert.equal(policy._studio_enabled, false);
    assert.equal(policy._initial_edit, false);
    assert.equal(policy._load_studio_module, false);
    assert.equal(policy._load_vibe_system_actions, false);
    assert.equal(policy._register_studio_listeners, false);
    assert.equal(policy._allow_editor_shortcuts, false);
  }

  {
    const adminTarget = await resolveBootstrapTarget({
      _window: windowWithBootstrap(null, "/admin", ""),
      _document: documentWithBootstrap({
        _mode: "admin",
        _admin: true,
        _app_id: "vibe-system",
        _env: "default",
      }),
      _fetch: async () => {
        throw new Error("fetch should not be called for injected admin bootstrap");
      },
    });
    const policy = runtimeEditorPolicy(adminTarget);
    assert.equal(adminTarget._mode, "system");
    assert.equal(adminTarget._app_id, "vibe-system");
    assert.equal(policy._studio_enabled, true);
    assert.equal(policy._initial_edit, false);
    assert.equal(policy._load_studio_module, true);
    assert.equal(policy._load_vibe_system_actions, true);
    assert.equal(policy._register_studio_listeners, true);
    assert.equal(policy._allow_editor_shortcuts, true);
  }

  {
    const adminTarget = await resolveBootstrapTarget({
      _window: windowWithBootstrap(null, "/admin", ""),
      _document: documentWithBootstrap({
        _mode: "admin",
        _admin: true,
        _app_id: "vibe-system",
        _env: "default",
      }),
      _fetch: async () => {
        throw new Error("fetch should not be called for injected admin bootstrap");
      },
    });
    const runtimeTarget = await resolveBootstrapTarget({
      _window: windowWithBootstrap(null, "/", ""),
      _document: documentWithBootstrap({
        _mode: "runtime",
        _admin: false,
        _app_id: "server-default",
        _env: "default",
      }),
      _fetch: async () => {
        throw new Error("fetch should not be called for injected runtime bootstrap");
      },
    });
    assert.equal(runtimeEditorPolicy(adminTarget)._studio_enabled, true);
    assert.equal(runtimeEditorPolicy(runtimeTarget)._studio_enabled, false);
  }

  console.log("xpell-vibe-starter bootstrap tests passed");
} finally {
  fs.rmSync(compiled.outDir, { recursive: true, force: true });
}
