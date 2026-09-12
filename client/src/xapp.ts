import {
  _x,
  _xd,
  _xem,
  _xlog,
  XUI,
  XUIRuntime,
  _xvm
} from "@xpell/ui";

import { XStudioEditor } from "./studio/XStudioEditor";
import { XDashboardPack } from "@xpell/xdashboard";
import { createBarcodeScannerModule } from "@xpell/food-product-lookup/client";
import VibeSystemAppActions from "./system/VibeSystemAppActions";
import { resolveBootstrapTarget } from "./bootstrap";
import { runtimeEditorPolicy } from "./runtime-policy";

import "@xpell/ui/xui.css";
import "@xpell/xdashboard/xdashboard.css"
import "./style/xvibe-app.css";


type XRuntimeMode = "runtime" | "build" | "system" | "admin-login" | "admin-denied";


const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID;

const WORMHOLE_URL =
  import.meta.env.VITE_WORMHOLE_URL ??
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/wh/v2`;


const DEV_CONSOLE_URL =
  import.meta.env.VITE_DEV_CONSOLE_URL ??
  `${window.location.protocol === "https:" ? "https" : "http"}://${window.location.host}`;


let _studio_listener_registered = false;

let editor: XStudioEditor | null = null;

type AdminBootstrap = {
  _reason?: string;
  _clearance_level?: number;
  _required_clearance_level?: number;
} | null;

async function syncClientSkills(client: any, mode: XRuntimeMode) {
  // if (mode !== "build" && mode !== "system") return;

  const skills = _x.getSkills();

  _xlog.log("[vibe-client] syncing client skills", skills)
  await client.sendXcmd({
    _module: "studio",
    _op: "sync-client-skills",
    _params: {
      _app_id: client._app_id,
      _env: client._env,
      _mode: mode,
      _skills: skills
    }
  } as any);

}

function readStudioPrompt(): string {
  const input = XUI.getObject("xstudio-prompt") as any;

  return String(
    input?.getValue?.() ??
    input?.dom?.value ??
    input?._value ??
    input?._text ??
    ""
  ).trim();
}

function mountAdminAuthShell(child: HTMLElement) {
  const shell = document.createElement("main");
  shell.className = "admin-auth-shell";
  shell.appendChild(child);
  document.body.replaceChildren(shell);
}

function adminAuthPanel(title: string, subtitle: string) {
  const panel = document.createElement("section");
  panel.className = "admin-auth-panel";

  const heading = document.createElement("h1");
  heading.textContent = title;

  const text = document.createElement("p");
  text.textContent = subtitle;

  panel.append(heading, text);
  return panel;
}

async function renderAdminLogin(bootstrap: AdminBootstrap) {
  const message = bootstrap?._reason === "expired_session"
    ? "Session expired. Sign in again."
    : "Sign in with an administrator account.";
  const panel = adminAuthPanel("Visual Xpell Admin", message);
  const form = document.createElement("form");
  form.className = "admin-auth-form";

  const email = document.createElement("input");
  email.name = "email";
  email.type = "email";
  email.autocomplete = "username";
  email.placeholder = "Email";
  email.required = true;

  const password = document.createElement("input");
  password.name = "password";
  password.type = "password";
  password.autocomplete = "current-password";
  password.placeholder = "Password";
  password.required = true;

  const error = document.createElement("div");
  error.className = "admin-auth-error";
  error.setAttribute("role", "alert");

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Sign in";

  form.append(email, password, error, button);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    button.disabled = true;

    try {
      const response = await fetch("/xauth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          email: email.value.trim(),
          password: password.value
        })
      });

      if (response.ok) {
        window.location.reload();
        return;
      }

      const body = await response.json().catch(() => null);
      error.textContent = body?._result?._message ?? "Sign in failed.";
    } catch {
      error.textContent = "Sign in failed.";
    } finally {
      button.disabled = false;
    }
  });

  panel.appendChild(form);
  mountAdminAuthShell(panel);
}

function renderAdminDenied(bootstrap: AdminBootstrap) {
  const required = bootstrap?._required_clearance_level ?? 100;
  const current = bootstrap?._clearance_level ?? 0;
  const panel = adminAuthPanel(
    "Access denied",
    `Administrator clearance ${required} is required. Current clearance: ${current}.`
  );
  const actions = document.createElement("div");
  actions.className = "admin-auth-actions";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Sign in again";
  button.addEventListener("click", async () => {
    await fetch("/xauth/logout", {
      method: "POST",
      credentials: "include"
    }).catch(() => null);
    window.location.reload();
  });

  actions.appendChild(button);
  panel.appendChild(actions);
  mountAdminAuthShell(panel);
}

async function requestStudioPreview(client: any) {
  const prompt = readStudioPrompt();

  if (!prompt) {
    _xlog.log("[vibe-client] empty studio prompt");
    return;
  }

  const current_view_id = client.get_current_view_id?.();
  if (!current_view_id) {
    _xlog.warn("[vibe-client] no current view id");
    return;
  }

  const current_view_json = _xvm.getViewById(current_view_id);

  _xlog.log("[vibe-client] studio preview request", {
    _view_id: current_view_id
  });

  const result = await client.sendXcmd({
    _module: "studio",
    _op: "preview-view",
    _params: {
      _app_id: client._app_id,
      _env: client._env,
      _view_id: current_view_id,
      _prompt: prompt,
      _current_view: current_view_json
    }
  } as any);

  _xlog.log("[vibe-client] studio preview result", result);

  _xem.fire("studio:preview-received", result);
}

async function requestStudioApply(client: any) {
  const current_view_id = client.get_current_view_id?.();
  if (!current_view_id) {
    _xlog.warn("[vibe-client] no current view id");
    return;
  }

  const current_view_json = _xvm.getViewById(current_view_id);

  if (!current_view_json) {
    _xlog.warn("[vibe-client] no current view json");
    return;
  }

  _xlog.log("[vibe-client] studio apply request", {
    _view_id: current_view_id
  });

  const result = await client.sendXcmd({
    _module: "studio",
    _op: "apply-view",
    _params: {
      _app_id: client._app_id,
      _env: client._env,
      _view_id: current_view_id,
      _view: current_view_json
    }
  } as any);

  _xlog.log("[vibe-client] studio apply result", result);

  _xem.fire("studio:view-applied", result);
}

function registerStudioListeners(client: any) {
  editor = new XStudioEditor(client);
  _xem.removeOwner("studio-client");

  if (_studio_listener_registered) return;
  _studio_listener_registered = true;

  _xlog.log("[vibe-client] registering studio listeners");

  // _xem.on(
  //   "studio:preview-request",
  //   async () => {
  //     try {
  //       await requestStudioPreview(client);
  //     } catch (err) {
  //       _xlog.error("[vibe-client] studio preview failed:", err);
  //       _xem.fire("studio:error", err);
  //     }
  //   },
  //   { _owner: "studio-client" }
  // );

  // _xem.on(
  //   "studio:apply-request",
  //   async () => {
  //     try {
  //       await requestStudioApply(client);
  //     } catch (err) {
  //       _xlog.error("[vibe-client] studio apply failed:", err);
  //       _xem.fire("studio:error", err);
  //     }
  //   },
  //   { _owner: "studio-client" }
  // );

  _xem.on(
    "studio:close",
    () => {
      editor?.unmount();
    },
    { _owner: "studio-client" }
  );

  _xem.on(
    "studio:open-app",
    async (payload: any) => {
      try {
        const app_id = payload?._app_id;
        const env = payload?._env ?? "default";

        if (!app_id) {
          _xlog.warn("[vibe-client] missing _app_id");
          return;
        }

        _xlog.log("[vibe-client] opening generated app", {
          _app_id: app_id,
          _env: env
        });

        if (typeof client.load_server_app === "function") {
          const edit = typeof payload?._edit === "boolean" ? payload._edit : undefined;
          await client.load_server_app(
            app_id,
            env,
            typeof edit === "boolean" ? { _edit: edit } : undefined
          );
          return;
        }

        window.location.reload();
      } catch (err) {
        _xlog.error("[vibe-client] open generated app failed", err);
      }
    },
    { _owner: "studio-client" }
  );

  _xem.on(
    "vibe:generation-stage",
    (payload: any) => {
      _xlog.log(
        "[vibe-client] generation stage",
        payload
      );
    }
  );
}

function disableStudioListeners() {
  _xem.removeOwner("studio-client");
  _studio_listener_registered = false;
  editor?.unmount?.();
  editor = null;
}



const main = async () => {
  try {
    _x._verbose = true;
    _xlog._debug = true;


    const boot = await resolveBootstrapTarget({
      _window: window as Window & Record<string, any>,
      _document: document,
      _fetch: fetch.bind(window),
      _warn: (...args: any[]) => _xlog.warn(...args),
    });
    const app_id = boot._app_id;
    const env = boot._env;
    const mode = boot._mode;
    const editor_policy = runtimeEditorPolicy(boot);
    (_x as any)._runtime_mode = mode;
    _xlog.log("[xapp] bootstrap resolved", {
      _source: boot._source,
      _mode: mode,
      _app_id: app_id,
      _env: env,
    });
    _xlog.log("[vibe-client] loading app", {
      _app_id: app_id,
      _env: env,
      _mode: mode,
      _source: boot._source,
      _bootstrap_mode: boot._bootstrap?._mode ?? null
    });

    if (mode === "admin-login") {
      await renderAdminLogin(boot._bootstrap);
      return;
    }

    if (mode === "admin-denied") {
      renderAdminDenied(boot._bootstrap);
      return;
    }

    if (!app_id) {
      throw new Error("[xapp] bootstrap did not resolve an app id");
    }

    _xd.set("env.dev_console_url", DEV_CONSOLE_URL);
    const client_modules = [
      createBarcodeScannerModule(),
      ...(editor_policy._load_vibe_system_actions ? [new VibeSystemAppActions()] : [])
    ];

    const client = await XUIRuntime.loadApp({
      _app_id: app_id,
      _env: env,
      _wormhole_url: WORMHOLE_URL,
      _theme: "dark",

      onViewRendered: (view_id) => {
        _xlog.log("[vibe-client] view rendered:", view_id);
      },

      onConnectionChange: (state) => {
        _xlog.log("[vibe-client] connection:", state);
      },

      onError: (err) => {
        _xlog.error("[vibe-client] xvm error:", err);
      },

      _runtime: {
        _auto_start: true,
        _load_flow: true,
        _load_xvm: true,
        _load_entity_client: true,
        _load_studio: editor_policy._load_studio_module
      },

      _object_packs: [XDashboardPack],
      _modules: client_modules,
      _edit: editor_policy._initial_edit,
      _allow_edit: editor_policy._studio_enabled,
      _debug: true
    });

    _xem.on("xvm:update", (payload: any) => {
      _xlog.log("[vibe-client] xvm:update", {
        _view_id: payload?._view_id,
        _version: payload?._version
      });
    });

    if (editor_policy._register_studio_listeners) {
      registerStudioListeners(client);
    } else {
      disableStudioListeners();
    }

    // if (mode === "build" || mode === "system") {
    //   try {
    //     await syncClientSkills(client, mode);
    //   } catch (err) {
    //     _xlog.error("[vibe-client] sync client skills failed", err);
    //   }

    //   editor.mount();
    // }

    // window.addEventListener("keydown", (event) => {
    //   if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e") {
    //     event.preventDefault();

    //     editor.toggle();

    //     if (editor.mounted) {
    //       void syncClientSkills(client, "build").catch((err) => {
    //         _xlog.error("[vibe-client] sync client skills failed", err);
    //       });
    //     }
    //   }
    // });

    _xlog.log("[vibe-client] ready");
  } catch (err) {
    _xlog.error("[vibe-client] fatal", err);
  }
};

void main();
