import type { BootstrapTarget } from "./bootstrap";

export type RuntimeEditorPolicy = {
  _studio_enabled: boolean;
  _initial_edit: boolean;
  _load_studio_module: boolean;
  _load_vibe_system_actions: boolean;
  _register_studio_listeners: boolean;
  _allow_editor_shortcuts: boolean;
};

export function isAuthorizedAdminBootstrap(target: Pick<BootstrapTarget, "_app_id" | "_bootstrap">): boolean {
  return target._app_id === "vibe-system" &&
    target._bootstrap?._mode === "admin" &&
    target._bootstrap?._admin === true;
}

export function runtimeEditorPolicy(target: Pick<BootstrapTarget, "_app_id" | "_bootstrap">): RuntimeEditorPolicy {
  const admin_enabled = isAuthorizedAdminBootstrap(target);

  return {
    _studio_enabled: admin_enabled,
    _initial_edit: false,
    _load_studio_module: admin_enabled,
    _load_vibe_system_actions: admin_enabled,
    _register_studio_listeners: admin_enabled,
    _allow_editor_shortcuts: admin_enabled,
  };
}
