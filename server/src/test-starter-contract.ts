import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ServerXVMModule,
  _x,
} from "@xpell/node";

import {
  StarterModule,
  create_starter_placeholder_values,
  expand_starter_placeholders,
  load_starter_contract,
  read_starter_metadata,
  resolve_starter_source_dir,
  sanitize_app_id,
  validate_starter_adaptation_targets,
  validate_starter_object_classifications,
  validate_starter_primary_experience,
  type StarterMetadata,
} from "./modules/Starter/StarterModule.js";
import {
  installPackagedSystemXApps,
  resolvePackagedSystemXAppsManifest,
} from "./systemApps.js";

function system_root(): string {
  return path.resolve(process.cwd(), "system-xapps");
}

function starters_root(): string {
  return path.join(system_root(), "app-starters");
}

function find_json_object_by_id(value: unknown, id: string): any {
  if (!value || typeof value !== "object") return null;
  if ((value as any)._id === id) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = find_json_object_by_id(item, id);
      if (found) return found;
    }
    return null;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    const found = find_json_object_by_id(child, id);
    if (found) return found;
  }
  return null;
}

function read_json(file_path: string): any {
  return JSON.parse(fs.readFileSync(file_path, "utf-8"));
}

function read_text(file_path: string): string {
  return fs.readFileSync(file_path, "utf-8");
}

function collect_json_object_ids(value: unknown, ids = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return ids;
  if (typeof (value as any)._id === "string") ids.add((value as any)._id);
  if (Array.isArray(value)) {
    for (const item of value) collect_json_object_ids(item, ids);
    return ids;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    collect_json_object_ids(child, ids);
  }
  return ids;
}

function collect_json_object_id_counts(value: unknown, counts = new Map<string, number>()): Map<string, number> {
  if (!value || typeof value !== "object") return counts;
  if (typeof (value as any)._id === "string") {
    const id = (value as any)._id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (Array.isArray(value)) {
    for (const item of value) collect_json_object_id_counts(item, counts);
    return counts;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    collect_json_object_id_counts(child, counts);
  }
  return counts;
}

function collect_json_objects_by_type(value: unknown, type: string, objects: any[] = []): any[] {
  if (!value || typeof value !== "object") return objects;
  if ((value as any)._type === type) objects.push(value);
  if (Array.isArray(value)) {
    for (const item of value) collect_json_objects_by_type(item, type, objects);
    return objects;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    collect_json_objects_by_type(child, type, objects);
  }
  return objects;
}

function assert_ids_exist(view: unknown, ids: string[], label: string) {
  for (const id of ids) {
    assert.ok(find_json_object_by_id(view, id), `Missing ${label} object ${id}`);
  }
}

function assert_no_overlap(left_label: string, left: string[], right_label: string, right: string[]) {
  const right_ids = new Set(right);
  for (const id of left) {
    assert.equal(right_ids.has(id), false, `${id} cannot be both ${left_label} and ${right_label}`);
  }
}

function assert_string_array(value: unknown, label: string): string[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  for (const item of value) {
    assert.equal(typeof item, "string", `${label} entries must be strings`);
  }
  return value as string[];
}

function load_contract(starter_id: string) {
  const starter_dir = resolve_starter_source_dir(starter_id, starters_root());
  return load_starter_contract(starter_dir, starter_id);
}

function assert_no_duplicate_object_ids(view: unknown, label: string) {
  const counts = collect_json_object_id_counts(view);
  const duplicates = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  assert.deepEqual(duplicates, [], `${label} must not contain duplicate object ids`);
}

function assert_no_domain_terms(value: unknown, terms: string[], label: string) {
  const serialized = JSON.stringify(value);
  for (const term of terms) {
    assert.equal(serialized.includes(term), false, `${label} must not leak '${term}'`);
  }
}

function assert_data_only_handlers(value: unknown, label: string) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) assert_data_only_handlers(item, label);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    assert.notEqual(typeof child, "function", `${label} cannot contain function handlers at ${key}`);
    assert_data_only_handlers(child, label);
  }
}

async function run_metadata_tests() {
  const dashboard = load_contract("dashboard")._starter;
  assert.equal(dashboard._id, "dashboard");
  assert.equal(dashboard._entry_view, "main");
  assert.ok(dashboard._keywords.includes("dashboard"));
  assert.ok(dashboard._archetypes.includes("record_management"));
  assert.ok(dashboard._starter_capabilities.includes("starter-adaptation-metadata"));
  assert.ok(dashboard._preserve_object_ids.includes("dashboard-shell"));
  assert.ok(dashboard._replaceable_object_ids.includes("dashboard-records-table"));
  assert.ok(assert_string_array(dashboard._adaptable_object_ids, "_adaptable_object_ids").includes("dashboard-toolbar-actions"));
  assert.ok(assert_string_array(dashboard._optional_remove_object_ids, "_optional_remove_object_ids").includes("dashboard-sidebar-status"));

  const empty = load_contract("empty")._starter;
  assert.equal(empty._id, "empty");
  assert.equal(empty._entry_view, "main");
  assert.ok(empty._keywords.includes("minimal"));
  assert.ok(empty._preserve_object_ids.includes("view-style-sheet"));
  assert.deepEqual(empty._replaceable_object_ids, []);
  assert.equal(empty._primary_experience, undefined);

  const list = load_contract("list")._starter;
  assert.equal(list._id, "list");
  assert.equal(list._title, "List / Tracker Starter");
  assert.equal(list._entry_view, "main");
  assert.equal(list._starter_version, "1.0.0");
  assert.ok(list._keywords.includes("list"));
  assert.ok(list._keywords.includes("tracker"));
  assert.ok(list._keywords.includes("checklist"));
  assert.ok(list._archetypes.includes("personal_list"));
  assert.ok(list._archetypes.includes("list_or_tracker"));
  assert.ok(list._starter_capabilities.includes("list-tracker-shell"));
  assert.ok(list._starter_capabilities.includes("starter-adaptation-metadata"));
  assert.ok(list._preserve_object_ids.includes("list-starter-shell"));
  assert.ok(list._replaceable_object_ids.includes("list-starter-list-table"));
  assert.ok(assert_string_array(list._adaptable_object_ids, "_adaptable_object_ids").includes("list-starter-primary-action"));
  assert.ok(assert_string_array(list._optional_remove_object_ids, "_optional_remove_object_ids").includes("list-starter-history-region"));
}

async function run_primary_experience_contract_tests() {
  const list_dir = resolve_starter_source_dir("list", starters_root());
  const list = load_contract("list")._starter;
  const list_view = read_json(path.join(list_dir, "views", "main.json"));
  const list_strategy = list._adaptation_strategy as Record<string, unknown>;
  const list_primary = list._primary_experience as Record<string, unknown>;

  assert.equal(list_strategy._mode, "none");
  assert.equal(list_primary._mode, "host-existing-experience");
  assert.equal(list_primary._entry_view_id, "main");
  assert.equal(list_primary._content_container_id, "list-starter-primary-content");
  assert.equal(list_primary._page_title_id, "list-starter-header");
  assert.equal(list_primary._page_subtitle_id, "list-starter-header");
  assert.equal(list_primary._primary_action_id, "list-starter-primary-action");
  assert.equal(list_primary._search_id, "list-starter-search");
  assert.equal(list_primary._status_filter_id, "list-starter-status-filter");
  assert.equal(list_primary._main_list_region_id, "list-starter-list-region");
  assert.equal(list_primary._history_region_id, "list-starter-history-region");
  assert.equal(list_primary._theme_selector_id, "list-starter-theme-select");
  assert.deepEqual(list_primary._replaceable_region_ids, [
    "list-starter-list-region",
    "list-starter-history-region",
  ]);
  assert.equal(Array.isArray(find_json_object_by_id(list_view, list_primary._content_container_id as string)._children), true);
  validate_starter_primary_experience({
    _starter_dir: list_dir,
    _starter: list,
  });

  const dashboard_dir = resolve_starter_source_dir("dashboard", starters_root());
  const dashboard = load_contract("dashboard")._starter;
  const dashboard_view = read_json(path.join(dashboard_dir, "views", "main.json"));
  const dashboard_strategy = dashboard._adaptation_strategy as Record<string, unknown>;
  const dashboard_primary = dashboard._primary_experience as Record<string, unknown>;

  assert.equal(dashboard_strategy._mode, "starter-to-plan-delta");
  assert.equal(dashboard_primary._mode, "host-existing-experience");
  assert.equal(dashboard_primary._requires_starter_adaptation, true);
  assert.equal(dashboard_primary._entry_view_id, "main");
  assert.equal(dashboard_primary._content_container_id, "dashboard-main-scroll");
  assert.equal(dashboard_primary._page_title_id, "dashboard-toolbar-title-group");
  assert.equal(dashboard_primary._page_subtitle_id, "dashboard-toolbar-title-group");
  assert.equal(dashboard_primary._primary_action_id, "dashboard-create-record-button");
  assert.equal(dashboard_primary._search_id, "dashboard-record-search");
  assert.equal(dashboard_primary._main_region_id, "dashboard-records-section");
  assert.equal(dashboard_primary._theme_selector_id, "dashboard-theme-select");
  assert.deepEqual(dashboard_primary._replaceable_region_ids, [
    "dashboard-overview-section",
    "dashboard-records-section",
    "dashboard-activity-section",
    "dashboard-settings-section",
  ]);
  assert.equal(Array.isArray(find_json_object_by_id(dashboard_view, dashboard_primary._content_container_id as string)._children), true);
  validate_starter_primary_experience({
    _starter_dir: dashboard_dir,
    _starter: dashboard,
  });

  const empty_dir = resolve_starter_source_dir("empty", starters_root());
  const empty = load_contract("empty")._starter;
  assert.equal(empty._primary_experience, undefined);
  validate_starter_primary_experience({
    _starter_dir: empty_dir,
    _starter: empty,
  });
}

async function run_dashboard_marker_tests() {
  const dashboard = load_contract("dashboard")._starter;
  const view = read_json(path.join(starters_root(), "dashboard", "views", "main.json"));
  const view_ids = collect_json_object_ids(view);
  const adaptable_ids = assert_string_array(dashboard._adaptable_object_ids, "_adaptable_object_ids");
  const optional_remove_ids = assert_string_array(dashboard._optional_remove_object_ids, "_optional_remove_object_ids");
  const fixed_ids = assert_string_array(dashboard._fixed_object_ids ?? [], "_fixed_object_ids");

  assert_ids_exist(view, dashboard._preserve_object_ids, "preserved");
  assert_ids_exist(view, dashboard._replaceable_object_ids, "replaceable");
  assert_ids_exist(view, adaptable_ids, "adaptable");
  assert_ids_exist(view, optional_remove_ids, "optional-remove");
  assert_ids_exist(view, fixed_ids, "fixed");
  assert_no_overlap("preserved", dashboard._preserve_object_ids, "optional-remove", optional_remove_ids);
  assert_no_overlap("fixed", fixed_ids, "optional-remove", optional_remove_ids);

  const strategy = dashboard._adaptation_strategy as Record<string, unknown>;
  assert.ok(Array.isArray(strategy._preserve));
  assert.ok(Array.isArray(strategy._adapt));
  assert.ok(Array.isArray(strategy._replace));
  assert.ok((strategy._adapt as string[]).includes("dashboard-toolbar-title-group"));
  assert.ok((strategy._adapt as string[]).includes("dashboard-toolbar-actions"));
  assert.ok(Array.isArray(strategy._optional_remove));
  assert.ok((strategy._optional_remove as string[]).includes("dashboard-feedback-toast"));
  assert.ok((strategy._optional_remove as string[]).includes("dashboard-record-search"));

  for (const group of ["_preserve", "_adapt", "_replace", "_optional_remove"]) {
    for (const id of strategy[group] as string[]) {
      assert.ok(view_ids.has(id), `Strategy ${group} references missing object ${id}`);
    }
  }
}

async function run_adaptation_anchor_tests() {
  const dashboard_dir = resolve_starter_source_dir("dashboard", starters_root());
  const dashboard = load_contract("dashboard")._starter;
  const view = read_json(path.join(dashboard_dir, "views", "main.json"));
  const targets = dashboard._adaptation_targets as Record<string, unknown>;

  assert.ok(targets);
  assert.deepEqual(targets._required, [
    "_content_container_id",
    "_page_title_id",
    "_page_subtitle_id",
    "_primary_navigation_id",
    "_sidebar_id",
    "_toolbar_id",
    "_toolbar_title_group_id",
  ]);
  assert.equal(targets._content_container_id, "dashboard-main-scroll");
  assert.equal(targets._page_title_id, "dashboard-toolbar-title-group");
  assert.equal(targets._page_subtitle_id, "dashboard-toolbar-title-group");
  assert.equal(targets._primary_navigation_id, "dashboard-primary-nav");
  assert.equal(targets._sidebar_id, "dashboard-sidebar");
  assert.equal(targets._sidebar_title_id, "dashboard-sidebar");
  assert.equal(targets._toolbar_id, "dashboard-toolbar");
  assert.equal(targets._toolbar_title_group_id, "dashboard-toolbar-title-group");
  assert.equal(targets._toolbar_actions_id, "dashboard-toolbar-actions");
  assert.equal(targets._sidebar_status_id, "dashboard-sidebar-status");
  assert.equal(targets._create_record_modal_id, "dashboard-create-record-modal");
  assert.equal(targets._feedback_toast_id, "dashboard-feedback-toast");

  for (const [field, value] of Object.entries(targets)) {
    if (!field.endsWith("_id")) continue;
    assert.equal(typeof value, "string", `${field} must be a string id`);
    assert.ok(find_json_object_by_id(view, value as string), `${field} target missing: ${value}`);
  }

  validate_starter_adaptation_targets({
    _starter_dir: dashboard_dir,
    _starter: dashboard,
  });

  const missing_required: StarterMetadata = {
    ...dashboard,
    _adaptation_targets: {
      ...targets,
      _content_container_id: "missing-content-container",
    },
  };
  assert.throws(
    () => validate_starter_adaptation_targets({
      _starter_dir: dashboard_dir,
      _starter: missing_required,
    }),
    /Starter adaptation target id does not exist/
  );

  const optional_absent: StarterMetadata = {
    ...dashboard,
    _adaptation_targets: {
      _required: ["_content_container_id"],
      _optional: ["_toolbar_id"],
      _content_container_id: "dashboard-main-scroll",
    },
  };
  validate_starter_adaptation_targets({
    _starter_dir: dashboard_dir,
    _starter: optional_absent,
  });

  const optional_invalid: StarterMetadata = {
    ...dashboard,
    _adaptation_targets: {
      _required: ["_content_container_id"],
      _optional: ["_toolbar_id"],
      _content_container_id: "dashboard-main-scroll",
      _toolbar_id: "missing-toolbar",
    },
  };
  assert.throws(
    () => validate_starter_adaptation_targets({
      _starter_dir: dashboard_dir,
      _starter: optional_invalid,
    }),
    /Starter adaptation target id does not exist/
  );

  const list_dir = resolve_starter_source_dir("list", starters_root());
  const list = load_contract("list")._starter;
  const list_view = read_json(path.join(list_dir, "views", "main.json"));
  const list_targets = list._adaptation_targets as Record<string, unknown>;

  assert.deepEqual(list_targets._required, [
    "_content_container_id",
    "_page_title_id",
    "_page_subtitle_id",
    "_primary_list_region_id",
    "_primary_action_id",
    "_theme_selector_id",
  ]);
  assert.equal(list_targets._content_container_id, "list-starter-primary-content");
  assert.equal(list_targets._page_title_id, "list-starter-header");
  assert.equal(list_targets._page_subtitle_id, "list-starter-header");
  assert.equal(list_targets._primary_list_region_id, "list-starter-list-region");
  assert.equal(list_targets._primary_action_id, "list-starter-primary-action");
  assert.equal(list_targets._theme_selector_id, "list-starter-theme-select");
  assert.equal(list_targets._search_control_id, "list-starter-search");
  assert.equal(list_targets._history_region_id, "list-starter-history-region");
  assert.equal(list_targets._toolbar_id, "list-starter-toolbar");
  assert.equal(list_targets._feedback_toast_id, "list-starter-feedback-toast");
  assert.equal(list_targets._status_filter_id, "list-starter-status-filter");

  for (const [field, value] of Object.entries(list_targets)) {
    if (!field.endsWith("_id")) continue;
    assert.equal(typeof value, "string", `${field} must be a string id`);
    assert.ok(find_json_object_by_id(list_view, value as string), `${field} target missing: ${value}`);
  }

  validate_starter_adaptation_targets({
    _starter_dir: list_dir,
    _starter: list,
  });
}

async function run_primary_experience_validation_failure_tests() {
  const list_dir = resolve_starter_source_dir("list", starters_root());
  const list = load_contract("list")._starter;
  const primary = list._primary_experience as Record<string, unknown>;

  const leaf_content_container: StarterMetadata = {
    ...list,
    _primary_experience: {
      ...primary,
      _content_container_id: "list-starter-primary-action",
    },
  };
  assert.throws(
    () => validate_starter_primary_experience({
      _starter_dir: list_dir,
      _starter: leaf_content_container,
    }),
    /content container must be a non-leaf object/
  );

  const missing_view: StarterMetadata = {
    ...list,
    _primary_experience: {
      ...primary,
      _entry_view_id: "missing-view",
    },
  };
  assert.throws(
    () => validate_starter_primary_experience({
      _starter_dir: list_dir,
      _starter: missing_view,
    }),
    /target view does not exist/
  );

  const optional_invalid: StarterMetadata = {
    ...list,
    _primary_experience: {
      ...primary,
      _history_region_id: "missing-history-region",
    },
  };
  assert.throws(
    () => validate_starter_primary_experience({
      _starter_dir: list_dir,
      _starter: optional_invalid,
    }),
    /target id does not exist/
  );

  const conflicting_classification: StarterMetadata = {
    ...list,
    _replaceable_object_ids: [
      ...list._replaceable_object_ids,
      "list-starter-primary-content",
    ],
  };
  assert.throws(
    () => validate_starter_object_classifications(conflicting_classification),
    /cannot be both preserved and replaceable/
  );
}

async function run_list_marker_tests() {
  const list = load_contract("list")._starter;
  const view = read_json(path.join(starters_root(), "list", "views", "main.json"));
  const view_ids = collect_json_object_ids(view);
  const adaptable_ids = assert_string_array(list._adaptable_object_ids, "_adaptable_object_ids");
  const optional_remove_ids = assert_string_array(list._optional_remove_object_ids, "_optional_remove_object_ids");
  const fixed_ids = assert_string_array(list._fixed_object_ids ?? [], "_fixed_object_ids");

  assert_ids_exist(view, list._preserve_object_ids, "preserved");
  assert_ids_exist(view, list._replaceable_object_ids, "replaceable");
  assert_ids_exist(view, adaptable_ids, "adaptable");
  assert_ids_exist(view, optional_remove_ids, "optional-remove");
  assert_ids_exist(view, fixed_ids, "fixed");
  assert_no_overlap("preserved", list._preserve_object_ids, "optional-remove", optional_remove_ids);
  assert_no_overlap("fixed", fixed_ids, "optional-remove", optional_remove_ids);

  const strategy = list._adaptation_strategy as Record<string, unknown>;
  assert.equal(strategy._mode, "none");
  assert.ok(view_ids.has("list-starter-primary-content"));
}

async function run_dashboard_layout_contract_tests() {
  const dashboard_dir = resolve_starter_source_dir("dashboard", starters_root());
  const view = read_json(path.join(dashboard_dir, "views", "main.json"));
  const css = read_text(path.join(dashboard_dir, "style", "custom.css"));
  const shell = find_json_object_by_id(view, "dashboard-shell");
  const sidebar = find_json_object_by_id(view, "dashboard-sidebar");
  const main_scroll = find_json_object_by_id(view, "dashboard-main-scroll");
  const toolbar = find_json_object_by_id(view, "dashboard-toolbar");
  const toolbar_actions = find_json_object_by_id(view, "dashboard-toolbar-actions");
  const nav = find_json_object_by_id(view, "dashboard-primary-nav");

  const header = find_json_object_by_id(view, "dashboard-toolbar-title-group");
  const theme = find_json_object_by_id(view, "dashboard-theme-select");
  const overview = find_json_object_by_id(view, "dashboard-overview-section");
  const overview_badge = find_json_object_by_id(view, "dashboard-overview-badge");
  const kpi_grid = find_json_object_by_id(view, "dashboard-kpi-grid");
  const records = find_json_object_by_id(view, "dashboard-records-section");
  const records_badge = find_json_object_by_id(view, "dashboard-records-count-badge");
  const records_table = find_json_object_by_id(view, "dashboard-records-table");
  const secondary_grid = find_json_object_by_id(view, "dashboard-secondary-grid");
  const activity = find_json_object_by_id(view, "dashboard-activity-section");
  const activity_table = find_json_object_by_id(view, "dashboard-activity-table");
  const settings = find_json_object_by_id(view, "dashboard-settings-section");
  const density_select = find_json_object_by_id(view, "dashboard-density-select");
  const status_select = find_json_object_by_id(view, "dashboard-status-select");

  assert_no_duplicate_object_ids(view, "dashboard starter main view");
  assert_data_only_handlers(view, "dashboard starter main view");

  assert.equal(view._theme, "xdashboard-2026-dark");
  assert.equal(shell._type, "xshell");
  assert.equal(shell.class, "dashboard-shell");
  assert.equal(shell._scroll, true);
  assert.equal(shell._sidebar._id, "dashboard-sidebar");
  assert.deepEqual(shell._children.map((child: any) => child._id), [
    "dashboard-main-scroll",
  ]);
  assert.equal(sidebar._type, "sidebar");
  assert.equal(sidebar.class, "dashboard-sidebar");
  assert.equal(sidebar._width, "288px");
  assert.equal(Array.isArray(sidebar._footer), false);
  assert.equal(sidebar._footer._id, "dashboard-sidebar-status");
  assert.equal(sidebar._nav._id, "dashboard-primary-nav");
  assert.equal(sidebar._logo._id, "dashboard-sidebar-logo");
  assert.equal(nav._active, "dashboard-overview-section");
  assert.deepEqual(nav._items.map((item: any) => item._value), [
    "dashboard-overview-section",
    "dashboard-records-section",
    "dashboard-activity-section",
    "dashboard-settings-section",
  ]);
  assert.equal(nav._on_select._op, "scroll-to");
  assert.equal(nav._on_select._params._id, "$data");
  for (const item of nav._items) {
    assert.ok(find_json_object_by_id(view, item._value), `Nav item ${item._id} must map to a real section`);
  }
  assert.equal(main_scroll._type, "xpage");
  assert.equal(main_scroll.class, "dashboard-main-scroll");
  assert.equal(main_scroll._width, "contained");
  assert.equal(main_scroll._density, "comfortable");
  assert.deepEqual(main_scroll._children.map((child: any) => child._id), [
    "dashboard-toolbar-title-group",
    "dashboard-toolbar",
    "dashboard-overview-section",
    "dashboard-records-section",
    "dashboard-secondary-grid",
  ]);
  assert.equal(header._type, "xpage-header");
  assert.equal(header._title, "Operations Dashboard");
  assert.equal(header._subtitle.includes("operations starter"), true);
  assert.equal(header._density, "comfortable");
  assert.equal(header._actions[0]._id, "dashboard-toolbar-actions");
  assert.equal(toolbar._type, "toolbar");
  assert.equal(toolbar._variant, "subtle");
  assert.equal(toolbar._density, "comfortable");
  assert.equal(toolbar.class, "dashboard-toolbar");
  assert.equal(toolbar._wrap, true);
  assert.equal(toolbar._gap, 16);
  assert.equal(toolbar_actions._type, "igroup");
  assert.equal(toolbar_actions._variant, "plain");
  assert.equal(toolbar_actions._density, "comfortable");
  assert.equal(toolbar_actions.class, "dashboard-toolbar-actions");
  assert.doesNotMatch(toolbar.class, /\bxtoolbar--(?:variant|density)-/);
  assert.doesNotMatch(toolbar_actions.class, /\bxigroup--(?:variant|density)-/);
  assert.equal(theme._type, "xselect");
  assert.equal(theme._value, "xdashboard-2026-dark");
  assert.equal(theme._size, "md");
  assert.deepEqual(theme._options.map((option: any) => option.value), [
    "xdashboard-2026-dark",
    "xdashboard-2026-light",
    "terminal",
  ]);
  assert.equal(theme._on_change._module, "xui");
  assert.equal(theme._on_change._op, "apply-theme");
  assert.equal(overview._type, "xsection");
  assert.equal(overview._variant, "plain");
  assert.equal(overview._density, "comfortable");
  assert.equal(overview_badge._type, "badge");
  assert.equal(overview_badge._text, "Live preview ready");
  assert.equal(overview_badge._variant, "success");
  assert.equal(overview_badge._pill, true);
  assert.equal(kpi_grid._type, "grid");
  assert.equal(kpi_grid._min_col_width, 210);
  assert.deepEqual(kpi_grid._children.map((child: any) => child._type), [
    "kpi-card",
    "kpi-card",
    "kpi-card",
    "kpi-card",
  ]);
  assert.equal(records._type, "xsection");
  assert.equal(records._variant, "subtle");
  assert.equal(records._density, "comfortable");
  assert.equal(records_badge._type, "badge");
  assert.equal(records_badge._text, "4 records");
  assert.equal(records_table._type, "table");
  assert.equal(records_table._variant, "subtle");
  assert.equal(records_table._density, "comfortable");
  assert.equal(records_table._hover, true);
  assert.equal(records_table._bordered, false);
  assert.equal(records_table._rows.length, 4);
  assert.equal(secondary_grid._type, "grid");
  assert.equal(secondary_grid._min_col_width, 320);
  assert.equal(activity._type, "xsection");
  assert.equal(activity._variant, "plain");
  assert.equal(activity._density, "compact");
  assert.equal(activity_table._type, "table");
  assert.equal(activity_table._variant, "plain");
  assert.equal(activity_table._density, "compact");
  assert.equal(activity_table._bordered, false);
  assert.equal(settings._type, "xsection");
  assert.equal(settings._variant, "plain");
  assert.equal(settings._density, "compact");
  assert.equal(density_select._type, "xselect");
  assert.equal(status_select._type, "xselect");
  assert.equal(JSON.stringify(view).includes("xtoolbar--variant-"), false);
  assert.equal(JSON.stringify(view).includes("xtoolbar--density-"), false);
  assert.equal(JSON.stringify(view).includes("xigroup--variant-"), false);
  assert.equal(JSON.stringify(view).includes("xigroup--density-"), false);
  assert.equal(JSON.stringify(view).includes("\"_type\":\"label\",\"class\":\"xbadge"), false);
  assert.equal(collect_json_objects_by_type(view, "empty").length, 0);

  assert.equal(css.split(/\r?\n/).length < 90, true, "dashboard starter custom CSS must remain reduced");
  assert.match(css, /XDashboard owns shell, page, section, and responsive layout/);
  assert.match(css, /--x-page-max-width:\s*1180px/);
  assert.match(css, /\.dashboard-toolbar-actions\s*\{/);
  assert.match(css, /\.dashboard-search\s*\{/);
  assert.match(css, /\.dashboard-table \.xtable__table\s*\{[\s\S]*table-layout:\s*fixed/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.doesNotMatch(css, /display:\s*grid/);
  assert.doesNotMatch(css, /grid-template-columns/);
  assert.doesNotMatch(css, /max-height:\s*100dvh/);
  assert.doesNotMatch(css, /overflow:\s*hidden/);
  assert.doesNotMatch(css, /overflow:\s*visible\s*!important/);
}

async function run_list_layout_contract_tests() {
  const list_dir = resolve_starter_source_dir("list", starters_root());
  const view = read_json(path.join(list_dir, "views", "main.json"));
  const css = read_text(path.join(list_dir, "style", "custom.css"));
  const shell = find_json_object_by_id(view, "list-starter-shell");
  const header = find_json_object_by_id(view, "list-starter-header");
  const toolbar = find_json_object_by_id(view, "list-starter-toolbar");
  const toolbar_actions = find_json_object_by_id(view, "list-starter-toolbar-actions");
  const primary_content = find_json_object_by_id(view, "list-starter-primary-content");
  const search = find_json_object_by_id(view, "list-starter-search");
  const status = find_json_object_by_id(view, "list-starter-status-filter");
  const theme = find_json_object_by_id(view, "list-starter-theme-select");
  const action = find_json_object_by_id(view, "list-starter-primary-action");
  const list_title = find_json_object_by_id(view, "list-starter-list-title");
  const table = find_json_object_by_id(view, "list-starter-list-table");
  const history = find_json_object_by_id(view, "list-starter-history-region");
  const history_title = find_json_object_by_id(view, "list-starter-history-title");
  const history_table = find_json_object_by_id(view, "list-starter-history-table");

  assert_no_duplicate_object_ids(view, "list starter main view");
  assert_data_only_handlers(view, "list starter main view");
  assert_no_domain_terms(view, ["Shopping List", "Tasks", "Purchased", "Due Date", "Groceries"], "list starter view");

  assert.equal(view._theme, "xdashboard-2026-dark");
  assert.equal(shell._type, "xshell");
  assert.equal(shell.class, "list-starter-shell");
  assert.equal(shell._scroll, true);
  assert.deepEqual(shell._children.map((child: any) => child._id), [
    "list-starter-primary-content",
  ]);
  assert.equal(header._type, "xpage-header");
  assert.equal(header._title, "<app-title>");
  assert.equal(header._subtitle, "<app-description>");
  assert.equal(header._density, "comfortable");
  assert.equal(header._actions[0]._id, "list-starter-toolbar-actions");
  assert.equal(toolbar_actions._type, "igroup");
  assert.equal(toolbar_actions._variant, "plain");
  assert.equal(toolbar_actions._density, "comfortable");
  assert.equal(toolbar_actions.class, "list-starter-toolbar-actions");
  assert.doesNotMatch(toolbar_actions.class, /\bxigroup--(?:variant|density)-/);
  assert.equal(toolbar_actions._gap, 12);
  assert.equal(toolbar_actions._wrap, true);
  assert.equal(primary_content._type, "xpage");
  assert.equal(primary_content._width, "contained");
  assert.equal(primary_content._density, "comfortable");
  assert.deepEqual(primary_content._children.map((child: any) => child._id), [
    "list-starter-header",
    "list-starter-toolbar",
    "list-starter-list-region",
    "list-starter-history-region",
  ]);
  assert.equal(toolbar._type, "toolbar");
  assert.equal(toolbar._variant, "subtle");
  assert.equal(toolbar._density, "comfortable");
  assert.equal(toolbar.class, "list-starter-toolbar");
  assert.doesNotMatch(toolbar.class, /\bxtoolbar--(?:variant|density)-/);
  assert.equal(toolbar._wrap, true);
  assert.equal(toolbar._gap, 16);
  assert.equal(search._type, "search");
  assert.equal(search._size, "md");
  assert.equal(status._type, "xselect");
  assert.equal(status._size, "md");
  assert.equal(theme._type, "xselect");
  assert.equal(theme._value, "xdashboard-2026-dark");
  assert.equal(theme._size, "md");
  assert.deepEqual(theme._options.map((option: any) => option.value), [
    "xdashboard-2026-dark",
    "xdashboard-2026-light",
    "terminal",
  ]);
  assert.equal(theme._on_change._module, "xui");
  assert.equal(theme._on_change._op, "apply-theme");
  assert.equal(action._type, "button");
  assert.equal(action._text, "Add <primary-entity-title>");
  assert.equal(action._variant, "primary");
  assert.equal(action.class, "list-starter-primary-action");
  assert.equal(action._children, undefined);
  assert.equal(find_json_object_by_id(view, "list-starter-empty-state"), null);
  assert.equal(collect_json_objects_by_type(view, "empty").length, 0);
  assert.equal(list_title._id, "list-starter-list-title");
  assert.equal(list_title._type, "badge");
  assert.equal(list_title.class, undefined);
  assert.equal(list_title._text, "Ready");
  assert.equal(list_title._variant, "success");
  assert.equal(list_title._size, "md");
  assert.equal(list_title._pill, true);
  assert.equal(table._type, "table");
  assert.deepEqual(table._rows, []);
  assert.equal(table._variant, "subtle");
  assert.equal(table._density, "comfortable");
  assert.equal(table._hover, true);
  assert.equal(table._bordered, false);
  assert.equal(table._empty_text, "No <primary-entity-title> records yet");
  assert.equal(history._type, "xsection");
  assert.equal(history._variant, "plain");
  assert.equal(history._density, "compact");
  assert.equal(history_title._id, "list-starter-history-title");
  assert.equal(history_title._type, "badge");
  assert.equal(history_title.class, undefined);
  assert.equal(history_title._text, "Optional");
  assert.equal(history_title._variant, "default");
  assert.equal(history_title._size, "sm");
  assert.equal(history_title._pill, true);
  assert.equal(history_table._type, "table");
  assert.equal(history_table._variant, "plain");
  assert.equal(history_table._density, "compact");
  assert.equal(history_table._bordered, false);
  assert.equal(JSON.stringify(view).includes("xtoolbar--variant-"), false);
  assert.equal(JSON.stringify(view).includes("xtoolbar--density-"), false);
  assert.equal(JSON.stringify(view).includes("xigroup--variant-"), false);
  assert.equal(JSON.stringify(view).includes("xigroup--density-"), false);
  assert.equal(JSON.stringify(view).includes("\"_type\":\"label\",\"class\":\"xbadge"), false);

  assert.equal(css.split(/\r?\n/).length <= 55, true, "list starter custom CSS must stay reduced");
  assert.match(css, /--x-type-page-title-size/);
  assert.match(css, /--x-type-section-title-size/);
  assert.match(css, /--x-density-comfortable-cell-pad-y/);
  assert.match(css, /\.list-starter-toolbar-actions\s*\{/);
  assert.match(css, /\.list-starter-search\s*\{/);
  assert.match(css, /\.list-starter-status-filter\s*\{/);
  assert.match(css, /\.list-starter-section\s*\{[\s\S]*min-width:\s*0/);
  assert.match(css, /html:has\(\.list-starter-shell\)/);
  assert.match(css, /\.list-starter-table \.xtable__table\s*\{[\s\S]*table-layout:\s*fixed/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.doesNotMatch(css, /\.xpage-header__title/);
  assert.doesNotMatch(css, /\.xsection__title/);
  assert.doesNotMatch(css, /grid-template-rows/);
  assert.doesNotMatch(css, /max-height:\s*100dvh/);
  assert.doesNotMatch(css, /overflow:\s*hidden/);
  assert.doesNotMatch(css, /width:\s*min\(100%,\s*1040px\)/);
  assert.doesNotMatch(css, /list-starter-main-scroll/);
  assert.doesNotMatch(css, /list-starter-empty-state/);
}

async function run_dashboard_asset_contract_tests() {
  const assets_dir = path.join(starters_root(), "dashboard", "assets");
  for (const file_name of ["logo.svg", "empty-state.svg", "placeholder-record.svg"]) {
    const asset_path = path.join(assets_dir, file_name);
    assert.ok(fs.existsSync(asset_path), `Missing dashboard starter asset ${file_name}`);
    const asset = read_text(asset_path);
    assert.match(asset, /<svg[\s>]/, `${file_name} must be an SVG asset`);
    assert.match(asset, /<title[\s>]/, `${file_name} must include a title`);
    assert.match(asset, /<desc[\s>]/, `${file_name} must include a description`);
  }
}

async function run_placeholder_tests() {
  const { _starter, _app } = load_contract("dashboard");
  const app_id = sanitize_app_id("Shopping List");
  const values = create_starter_placeholder_values({
    _params: {
      _starter_id: "dashboard",
      _app_id: app_id,
      _app_title: "Shopping List",
      _app_description: "Track groceries and errands.",
      _app_archetype: "shopping_list",
      _app_scope: "household",
      _primary_entity: "shopping_item",
      _primary_view: "shopping_items",
    },
    _starter,
    _starter_app: _app,
  });

  const expanded = expand_starter_placeholders({
    _value: {
      _id: "<primary-entity>-table",
      _title: "<app-title>",
      _description: "<app-description>",
      _entity: "<primary-entity>",
      _view_id: "<primary-view>",
      _image: {
        src: "assets/logo.svg",
        alt: "<app-title> logo",
      },
    },
    _values: values,
    _starter,
    _app_id: app_id,
  }) as any;

  assert.equal(expanded._id, "shopping_item-table");
  assert.equal(expanded._title, "Shopping List");
  assert.equal(expanded._description, "Track groceries and errands.");
  assert.equal(expanded._entity, "shopping_item");
  assert.equal(expanded._view_id, "shopping_items");
  assert.equal(expanded._image.src, "/public/shopping-list/assets/logo.svg");
  assert.equal(expanded._image.alt, "Shopping List logo");

  const list_contract = load_contract("list");
  const list_app_id = sanitize_app_id("Reading List");
  const list_values = create_starter_placeholder_values({
    _params: {
      _starter_id: "list",
      _app_id: list_app_id,
      _app_title: "Reading List",
      _app_description: "Track reading records.",
      _app_archetype: "reading_list",
      _app_scope: "personal",
      _primary_entity: "reading_item",
      _primary_entity_title: "Reading item",
      _primary_view: "reading_items",
      _primary_view_title: "Reading items",
    },
    _starter: list_contract._starter,
    _starter_app: list_contract._app,
  });
  const list_expanded = expand_starter_placeholders({
    _value: read_json(path.join(starters_root(), "list", "views", "main.json")),
    _values: list_values,
    _starter: list_contract._starter,
    _app_id: list_app_id,
  }) as any;

  assert.equal(find_json_object_by_id(list_expanded, "list-starter-header")._title, "Reading List");
  assert.equal(find_json_object_by_id(list_expanded, "list-starter-header")._subtitle, "Track reading records.");
  assert.equal(find_json_object_by_id(list_expanded, "list-starter-primary-action")._text, "Add Reading item");
  assert.equal(find_json_object_by_id(list_expanded, "list-starter-search")._placeholder, "Search Reading item...");
  assert.equal(find_json_object_by_id(list_expanded, "list-starter-list-region")._title, "Reading items");
  assert.equal(find_json_object_by_id(list_expanded, "list-starter-list-table")._empty_text, "No Reading item records yet");
  assert.equal(find_json_object_by_id(list_expanded, "list-starter-list-table")._columns[0]._title, "Reading item");
}

async function run_unresolved_required_placeholder_tests() {
  const starter: StarterMetadata = {
    ...load_contract("dashboard")._starter,
    _required_placeholders: ["<missing-required>"],
  };
  const values = create_starter_placeholder_values({
    _params: {
      _starter_id: "dashboard",
      _app_id: "required-test",
    },
    _starter: starter,
    _starter_app: {},
  });

  assert.throws(
    () => expand_starter_placeholders({
      _value: { _title: "<missing-required>" },
      _values: values,
      _starter: starter,
      _app_id: "required-test",
    }),
    /Required starter placeholder is unresolved/
  );
}

async function run_optional_fallback_tests() {
  const { _starter, _app } = load_contract("empty");
  const values = create_starter_placeholder_values({
    _params: {
      _starter_id: "empty",
      _app_id: "fallback-test",
    },
    _starter,
    _starter_app: _app,
  });
  const expanded = expand_starter_placeholders({
    _value: {
      _title: "<app-title>",
      _entity_title: "<primary-entity-title>",
      _scope: "<app-scope>",
    },
    _values: values,
    _starter,
    _app_id: "fallback-test",
  }) as any;

  assert.equal(expanded._title, "Empty Starter");
  assert.equal(expanded._entity_title, "Record");
  assert.equal(expanded._scope, "single-app");
}

async function run_fixed_id_and_legacy_tests() {
  const { _starter, _app } = load_contract("dashboard");
  const values = create_starter_placeholder_values({
    _params: {
      _starter_id: "dashboard",
      _app_id: "fixed-id-test",
      _primary_entity: "Task Item",
    },
    _starter,
    _starter_app: _app,
  });

  const expanded = expand_starter_placeholders({
    _value: {
      _fixed: { _id: "dashboard-shell" },
      _safe: { _id: "<primary-entity>-panel" },
    },
    _values: values,
    _starter,
    _app_id: "fixed-id-test",
  }) as any;
  assert.equal(expanded._fixed._id, "dashboard-shell");
  assert.equal(expanded._safe._id, "task-item-panel");

  const legacy = read_starter_metadata({
    _app_id: "legacy-starter",
    _title: "Legacy Starter",
    _meta: {
      _entry_view_id: "main",
    },
  }, "legacy");
  assert.equal(legacy._id, "legacy");
  assert.equal(legacy._title, "Legacy Starter");
  assert.equal(legacy._entry_view, "main");
  assert.deepEqual(legacy._replaceable_object_ids, []);
}

async function run_list_adaptation_fixture_tests() {
  const { _starter, _app } = load_contract("list");
  const view = read_json(path.join(starters_root(), "list", "views", "main.json"));
  const targets = _starter._adaptation_targets as Record<string, unknown>;
  const forbidden_in_starter = ["Shopping List", "Tasks", "Purchased", "Due Date", "Groceries"];

  assert_no_domain_terms(_starter, forbidden_in_starter, "list starter metadata");
  assert_no_domain_terms(view, forbidden_in_starter, "list starter view");
  assert.ok(_starter._replaceable_object_ids.includes("list-starter-list-table"));
  assert.ok(assert_string_array(_starter._optional_remove_object_ids, "_optional_remove_object_ids").includes("list-starter-history-region"));
  assert.equal(targets._primary_list_region_id, "list-starter-list-region");

  const fixtures = [
    {
      _name: "shopping-list",
      _params: {
        _starter_id: "list",
        _app_id: "shopping-list-fixture",
        _app_title: "Shopping List",
        _app_description: "Track household purchases.",
        _app_archetype: "shopping_list",
        _app_scope: "household",
        _primary_entity: "shopping_item",
        _primary_entity_title: "Shopping item",
        _primary_view: "shopping_items",
        _primary_view_title: "Shopping items",
      },
      _planned_fields: ["quantity", "category", "status"],
      _lifecycle: ["purchased"],
    },
    {
      _name: "todo-list",
      _params: {
        _starter_id: "list",
        _app_id: "todo-list-fixture",
        _app_title: "To-do List",
        _app_description: "Track personal work records.",
        _app_archetype: "todo_list",
        _app_scope: "personal",
        _primary_entity: "task",
        _primary_entity_title: "Task",
        _primary_view: "tasks",
        _primary_view_title: "Tasks",
      },
      _planned_fields: ["priority", "status"],
      _lifecycle: ["completed"],
    },
    {
      _name: "packing-list",
      _params: {
        _starter_id: "list",
        _app_id: "packing-list-fixture",
        _app_title: "Packing List",
        _app_description: "Track reusable preparation records.",
        _app_archetype: "packing_list",
        _app_scope: "personal",
        _primary_entity: "packing_item",
        _primary_entity_title: "Packing item",
        _primary_view: "packing_items",
        _primary_view_title: "Packing items",
      },
      _planned_fields: ["category", "status"],
      _lifecycle: ["packed"],
    },
  ];

  for (const fixture of fixtures) {
    const values = create_starter_placeholder_values({
      _params: fixture._params,
      _starter,
      _starter_app: _app,
    });
    const expanded = expand_starter_placeholders({
      _value: view,
      _values: values,
      _starter,
      _app_id: fixture._params._app_id,
    }) as any;

    assert.equal(find_json_object_by_id(expanded, "list-starter-header")._title, fixture._params._app_title);
    assert.equal(find_json_object_by_id(expanded, "list-starter-list-region")._title, fixture._params._primary_view_title);
    assert.equal(find_json_object_by_id(expanded, "list-starter-list-table")._columns[0]._title, fixture._params._primary_entity_title);
    assert.deepEqual(find_json_object_by_id(expanded, "list-starter-list-table")._rows, []);
    assert.ok(fixture._planned_fields.includes("status"), `${fixture._name} fixture declares status-compatible fields`);
    assert.ok(fixture._lifecycle.length > 0, `${fixture._name} fixture declares lifecycle labels`);
  }
}

async function run_starter_registration_tests() {
  assert.equal(
    fs.existsSync(path.join(system_root(), "vibe-system")),
    false,
    "server/system-xapps/vibe-system must not remain a starter-owned source authority"
  );
  assert.ok(fs.existsSync(path.join(system_root(), "app-starters")), "starter-owned app starters must remain in place");

  const workspace_manifest = resolvePackagedSystemXAppsManifest({
    _runtime_root: path.join(os.tmpdir(), "xpell-starter-contract-runtime-system-xapps"),
  });
  assert.equal(workspace_manifest._owner_package, "@xpell/ui");
  assert.ok(workspace_manifest._apps.some((app) => app._app_id === "vibe-system"), "vibe-system must be discovered from @xpell/ui manifest");
  assert.ok(workspace_manifest._manifest_path.includes("@xpell/ui") || workspace_manifest._manifest_path.includes("xpell-ui"));

  const fake_package_root = fs.mkdtempSync(path.join(os.tmpdir(), "xpell-ui-package-style-"));
  const fake_ui_root = path.join(fake_package_root, "node_modules", "@xpell", "ui");
  fs.mkdirSync(path.join(fake_ui_root, "system-xapps", "vibe-system", "views"), { recursive: true });
  fs.writeFileSync(path.join(fake_package_root, "host.js"), "", "utf-8");
  fs.writeFileSync(path.join(fake_ui_root, "package.json"), `${JSON.stringify({
    name: "@xpell/ui",
    type: "module",
    exports: {
      "./system-xapps/manifest.json": "./system-xapps/manifest.json",
      "./package.json": "./package.json",
    },
  }, null, 2)}\n`, "utf-8");
  fs.writeFileSync(path.join(fake_ui_root, "system-xapps", "manifest.json"), `${JSON.stringify({
    _schema: "xpell-ui-system-xapps.v1",
    _owner_package: "@xpell/ui",
    _apps: [
      {
        _app_id: "vibe-system",
        _type: "system_app",
        _path: "vibe-system",
        _entry: "app.json",
      },
    ],
  }, null, 2)}\n`, "utf-8");
  fs.writeFileSync(path.join(fake_ui_root, "system-xapps", "vibe-system", "app.json"), `${JSON.stringify({
    _app_id: "vibe-system",
    _system: true,
    _readonly: true,
    _meta: {
      _entry_view_id: "main",
    },
  }, null, 2)}\n`, "utf-8");
  fs.writeFileSync(path.join(fake_ui_root, "system-xapps", "vibe-system", "views", "main.json"), `${JSON.stringify({
    _id: "main",
    _type: "view",
    _children: [],
  }, null, 2)}\n`, "utf-8");

  const fake_install = installPackagedSystemXApps({
    _work_folder: path.join(fake_package_root, "work"),
    _require_from: path.join(fake_package_root, "host.js"),
  });
  assert.equal(fake_install._apps[0]?._app_id, "vibe-system");
  assert.ok(fs.existsSync(path.join(fake_install._runtime_root, "vibe-system", "app.json")), "npm/package-style runtime install must copy vibe-system");

  const install = installPackagedSystemXApps({
    _work_folder: fs.mkdtempSync(path.join(os.tmpdir(), "xpell-starter-system-xapps-")),
  });
  assert.ok(fs.existsSync(path.join(install._runtime_root, "vibe-system", "app.json")), "workspace runtime install must copy vibe-system");

  const system_view = read_json(path.join(install._runtime_root, "vibe-system", "views", "xvibe-sys-main.json"));
  const serialized = JSON.stringify(system_view);
  assert.ok(serialized.includes("\"_title\":\"List / Tracker\""));
  assert.ok(serialized.includes("\"_starter_id\":\"list\""));
  assert.ok(serialized.includes("A clean reusable foundation for lists, trackers, checklists, and lightweight record-management apps."));

  assert_data_only_handlers(system_view, "vibe-system main view");
  assert_ids_exist(system_view, [
    "apps-table",
    "package-status-label",
    "import-app-modal",
    "import-app-file",
    "import-app-preview-table",
    "import-app-selected-label",
    "import-app-upload-label",
    "import-app-package-label",
    "import-app-source-label",
    "import-app-counts-label",
    "import-app-target-label",
    "import-app-replace-label",
  ], "vibe-system package action");

  assert.ok(serialized.includes("\"_text\":\"Import App\""), "Import App action must be visible");
  assert.ok(serialized.includes("\"_text\":\"Export\""), "Export action must be visible");
  assert.ok(serialized.includes("\"_text\":\"Move to Trash\""), "Move to Trash action must be visible");

  const apps_table = find_json_object_by_id(system_view, "apps-table");
  const open_list_command = apps_table?._on?.["_wormhole-open"];
  assert.equal(open_list_command?._module, "xvm");
  assert.equal(open_list_command?._op, "list-apps");
  assert.equal(open_list_command?._params?._include_system, false);

  const action_column = apps_table?._columns?.find((column: any) => column?._key === "actions");
  const actions = action_column?._actions ?? [];
  const action_by_text = (text: string) => actions.find((action: any) => action?._text === text);
  const click_command = (action: any) => {
    const command = action?._on?.click;
    return Array.isArray(command) ? command[0] : command;
  };

  const open_action = click_command(action_by_text("Open"));
  assert.equal(open_action?._module, "xvm");
  assert.equal(open_action?._op, "load-server-app");
  assert.equal(open_action?._params?._edit, false);

  const edit_action = click_command(action_by_text("Edit"));
  assert.equal(edit_action?._module, "xvm");
  assert.equal(edit_action?._op, "load-server-app");
  assert.equal(edit_action?._params?._edit, true);

  const export_action = click_command(action_by_text("Export"));
  assert.equal(export_action?._module, "vibe-system");
  assert.equal(export_action?._op, "export-app");
  assert.equal(export_action?._params?._row_app_id, "$row._app_id");
  assert.equal(export_action?._params?._row_env, "$row._env");

  const set_default_action = click_command(action_by_text("Set Default"));
  assert.equal(set_default_action?._module, "vibe-system");
  assert.equal(set_default_action?._op, "set-default-app");
  assert.equal(set_default_action?._params?._row_app_id, "$row._app_id");
  assert.equal(set_default_action?._params?._row_env, "$row._env");

  const trash_action = click_command(action_by_text("Move to Trash"));
  assert.equal(trash_action?._module, "vibe-system");
  assert.equal(trash_action?._op, "trash-app");
  assert.equal(trash_action?._params?._row_app_id, "$row._app_id");
  assert.equal(trash_action?._params?._row_env, "$row._env");

  const import_file = find_json_object_by_id(system_view, "import-app-file");
  assert.equal(import_file?._control, undefined);
  assert.equal(import_file?._on?.change?._module, "vibe-system");
  assert.equal(import_file?._on?.change?._op, "select-import-file");
  assert.equal(import_file?._on?.change?._params?._event_target, "$event.target");

  assert.ok(serialized.includes("\"_op\":\"confirm-import-app\""), "Import confirmation action must be wired");
  assert.equal(serialized.includes("\"_package_path\""), false, "UI must not pass package filesystem paths");
  assert.equal(serialized.includes("rmSync"), false, "UI must not expose raw filesystem removal");
  assert.equal(serialized.includes("unlink"), false, "UI must not expose raw filesystem unlink");
  assert.equal(serialized.includes("deleteFile"), false, "UI must not expose raw filesystem deletion helpers");

  const client_actions_source = read_text(path.resolve(process.cwd(), "../client/src/system/VibeSystemAppActions.ts"));
  for (const op of [
    "upload-app-package",
    "inspect-app-package",
    "preview-app-import",
    "import-app",
    "export-app",
    "set-default-app",
    "trash-app",
  ]) {
    assert.ok(client_actions_source.includes(`"${op}"`), `vibe-system app actions must call ${op}`);
  }
  assert.equal(client_actions_source.includes("xvibe.active_app"), false, "Set Default must not write client active app storage");

  const client_startup_source = read_text(path.resolve(process.cwd(), "../client/src/xapp.ts"));
  const client_bootstrap_source = read_text(path.resolve(process.cwd(), "../client/src/bootstrap.ts"));
  const client_vite_source = read_text(path.resolve(process.cwd(), "../client/vite.config.js"));
  assert.ok(client_startup_source.includes("resolveBootstrapTarget"), "Client startup must resolve app from bootstrap metadata");
  assert.ok(client_startup_source.includes("[xapp] bootstrap resolved"), "Client startup must log bounded bootstrap resolution");
  assert.ok(client_bootstrap_source.includes("fetchCanonicalServerBootstrap"), "Vite dev startup must fetch canonical server bootstrap when HTML metadata is absent");
  assert.ok(client_bootstrap_source.includes("/__xnode_bootstrap"), "Vite dev bootstrap fetch must use the proxied bootstrap path");
  assert.ok(client_bootstrap_source.includes("\"server-fetch\""), "Fetched bootstrap source must be reported as server-fetch");
  assert.ok(client_vite_source.includes("target: \"http://localhost:3000\""), "Vite dev must proxy bootstrap fetches to XNode");
  assert.ok(client_vite_source.includes("/__xnode_bootstrap"), "Vite dev must expose a clean local bootstrap proxy path");
  assert.equal(client_startup_source.includes("XDB.getString(\"xvibe.active_app\")"), false, "Client startup must not read active app from localStorage");
  assert.equal(client_startup_source.includes("XDB.getString('xvibe.active_app')"), false, "Client startup must not read active app from localStorage");
  assert.equal(client_bootstrap_source.includes("xvibe.active_app"), false, "Bootstrap resolver must not know the old active app storage key");
  assert.ok(client_actions_source.includes("package_ref_from_result"), "Import must keep using upload package refs");
  for (const preserved of ["Conversations", "Project Memory", "XDB", "old_views", "vibe-runs", "runtime state"]) {
    assert.ok(client_actions_source.includes(preserved), `Replace confirmation must mention preserved ${preserved}`);
  }
  assert.ok(client_actions_source.includes("_mode: \"upsert\""), "Existing-app import must be an intentional upsert");
  assert.ok(client_actions_source.includes("window.confirm("), "Existing import/trash actions must require confirmation");
  assert.ok(client_actions_source.includes("fetch(resolve_transfer_url(url))"), "Export must download through canonical HTTP transfer URL");
  assert.ok(client_actions_source.includes("is_zip_bytes(bytes)"), "Export must validate downloaded xapp bytes");
  assert.ok(client_actions_source.includes("safe_filename(app_id)"), "Export must preserve <app-id>.xapp filename");
  assert.ok(client_actions_source.includes("refresh_projects(env)"), "Import/trash success must refresh My Projects");
  assert.ok(client_actions_source.includes("app_id === \"vibe-system\""), "System app must not be trashable from UI");
  assert.ok(client_actions_source.includes("Move to Trash failed:"), "Precise trash errors must be surfaced");
  assert.ok(client_actions_source.includes("Export failed:"), "Precise export errors must be surfaced");
  assert.ok(client_actions_source.includes("Import failed:"), "Precise import errors must be surfaced");
  assert.equal(/from\s+["'](?:node:)?fs["']/.test(client_actions_source), false, "UI must not import filesystem APIs");
  assert.equal(/from\s+["'](?:node:)?path["']/.test(client_actions_source), false, "UI must not import path APIs");
  assert.equal(/\b(rmSync|unlinkSync|renameSync|writeFileSync|readFileSync)\b/.test(client_actions_source), false, "UI must not perform raw filesystem actions");
}

async function run_real_copy_tests() {
  const work_folder = fs.mkdtempSync(path.join(os.tmpdir(), "xpell-starter-contract-"));
  try {
    const system_xapps = installPackagedSystemXApps({
      _work_folder: work_folder,
    });
    await _x.loadModuleAsync(new ServerXVMModule({
      _work_folder: work_folder,
      _system_xapps_path: system_xapps._runtime_root,
    }));
    await _x.loadModuleAsync(new StarterModule());

    const system_app = await _x.execute({
      _module: "server-xvm",
      _op: "get-app",
      _params: {
        _app_id: "vibe-system",
        _env: "default",
        _include_views: true,
      },
    } as any);
    assert.equal((system_app as any)._ok, true);
    assert.equal((system_app as any)._result._app._system, true);
    assert.ok((system_app as any)._result._view_ids.includes("xvibe-sys-main"), "generated vibe-system main view must load");

    const active_apps = await _x.execute({
      _module: "server-xvm",
      _op: "list-apps",
      _params: {
        _env: "default",
        _include_system: false,
      },
    } as any);
    assert.equal((active_apps as any)._ok, true);
    assert.equal((active_apps as any)._result._app_ids.includes("vibe-system"), false, "system app must not appear in active user app list");

    const dashboard_result = await _x.execute({
      _module: "starter",
      _op: "create_app_from_starter",
      _params: {
        _starter_id: "dashboard",
        _app_id: "Shopping List Contract",
        _env: "default",
        _app_title: "Shopping List",
        _primary_entity: "shopping_item",
        _primary_view: "main",
      },
    } as any);
    assert.equal((dashboard_result as any)._ok, true);
    assert.equal((dashboard_result as any)._result._app_id, "shopping-list-contract");

    const dashboard_app_path = path.join(
      work_folder,
      "xvm",
      "apps",
      "default",
      "shopping-list-contract",
      "app.json"
    );
    const dashboard_view_path = path.join(
      work_folder,
      "xvm",
      "apps",
      "default",
      "shopping-list-contract",
      "views",
      "main.json"
    );
    const dashboard_app = read_json(dashboard_app_path);
    const dashboard_view = read_json(dashboard_view_path);
    assert.equal(dashboard_app._app_id, "shopping-list-contract");
    assert.equal(dashboard_app._meta._starter._id, "dashboard");
    assert.equal(dashboard_app._meta._starter._adaptation_targets._content_container_id, "dashboard-main-scroll");
    assert.equal(dashboard_app._meta._starter._adaptation_targets._page_title_id, "dashboard-toolbar-title-group");
    assert.equal(dashboard_app._meta._starter._primary_experience._entry_view_id, "main");
    assert.equal(dashboard_app._meta._starter._primary_experience._content_container_id, "dashboard-main-scroll");
    assert.equal(dashboard_app._meta._starter._primary_experience._requires_starter_adaptation, true);
    assert.equal(find_json_object_by_id(dashboard_view, "dashboard-sidebar")._logo.src, "/public/shopping-list-contract/assets/logo.svg");
    assert.equal(find_json_object_by_id(dashboard_view, "dashboard-main-scroll")._type, "xpage");
    assert.equal(find_json_object_by_id(dashboard_view, "dashboard-toolbar-title-group")._type, "xpage-header");
    assert.ok(fs.existsSync(path.join(work_folder, "public", "shopping-list-contract", "assets", "logo.svg")));

    const list_result = await _x.execute({
      _module: "starter",
      _op: "create_app_from_starter",
      _params: {
        _starter_id: "list",
        _app_id: "List Contract",
        _env: "default",
        _app_title: "List Contract",
        _app_description: "Contract list starter.",
        _primary_entity: "contract_record",
        _primary_entity_title: "Contract record",
        _primary_view: "contract_records",
        _primary_view_title: "Contract records",
      },
    } as any);
    assert.equal((list_result as any)._ok, true);
    assert.equal((list_result as any)._result._app_id, "list-contract");

    const list_app_path = path.join(
      work_folder,
      "xvm",
      "apps",
      "default",
      "list-contract",
      "app.json"
    );
    const list_view_path = path.join(
      work_folder,
      "xvm",
      "apps",
      "default",
      "list-contract",
      "views",
      "main.json"
    );
    const list_app = read_json(list_app_path);
    const list_view = read_json(list_view_path);
    assert.equal(list_app._app_id, "list-contract");
    assert.equal(list_app._meta._starter._id, "list");
    assert.equal(list_app._meta._starter._adaptation_strategy._mode, "none");
    assert.equal(list_app._meta._starter._adaptation_targets._content_container_id, "list-starter-primary-content");
    assert.equal(list_app._meta._starter._primary_experience._entry_view_id, "main");
    assert.equal(list_app._meta._starter._primary_experience._content_container_id, "list-starter-primary-content");
    assert.equal(list_app._meta._starter._primary_experience._main_list_region_id, "list-starter-list-region");
    assert.equal(find_json_object_by_id(list_view, "list-starter-style-sheet")._href, "/public/list-contract/style/custom.css");
    assert.equal(find_json_object_by_id(list_view, "list-starter-header")._title, "List Contract");
    assert.equal(find_json_object_by_id(list_view, "list-starter-list-region")._title, "Contract records");
    assert.ok(fs.existsSync(path.join(work_folder, "public", "list-contract", "style", "custom.css")));

    const empty_result = await _x.execute({
      _module: "starter",
      _op: "create_app_from_starter",
      _params: {
        _starter_id: "empty",
        _app_id: "Empty Contract",
        _env: "default",
      },
    } as any);
    assert.equal((empty_result as any)._ok, true);
    assert.equal((empty_result as any)._result._entry_view_id, "main");

    const get_dashboard = await _x.execute({
      _module: "server-xvm",
      _op: "get_app",
      _params: {
        _app_id: "shopping-list-contract",
        _env: "default",
        _include_views: true,
      },
    } as any);
    assert.equal((get_dashboard as any)._ok, true);
    assert.ok((get_dashboard as any)._result._view_ids.includes("main"));
    assert.equal((get_dashboard as any)._result._views.main._id, "main");

    const get_list = await _x.execute({
      _module: "server-xvm",
      _op: "get_app",
      _params: {
        _app_id: "list-contract",
        _env: "default",
        _include_views: true,
      },
    } as any);
    assert.equal((get_list as any)._ok, true);
    assert.ok((get_list as any)._result._view_ids.includes("main"));
    assert.equal((get_list as any)._result._views.main._id, "main");

    const get_empty = await _x.execute({
      _module: "server-xvm",
      _op: "get_app",
      _params: {
        _app_id: "empty-contract",
        _env: "default",
        _include_views: true,
      },
    } as any);
    assert.equal((get_empty as any)._ok, true);
    assert.ok((get_empty as any)._result._view_ids.includes("main"));
    assert.equal((get_empty as any)._result._app._meta._starter._adaptation_targets, undefined);
    assert.equal((get_empty as any)._result._app._meta._starter._primary_experience, undefined);
  } finally {
    fs.rmSync(work_folder, { recursive: true, force: true });
  }
}

await run_metadata_tests();
await run_primary_experience_contract_tests();
await run_dashboard_marker_tests();
await run_list_marker_tests();
await run_adaptation_anchor_tests();
await run_primary_experience_validation_failure_tests();
await run_dashboard_layout_contract_tests();
await run_list_layout_contract_tests();
await run_dashboard_asset_contract_tests();
await run_placeholder_tests();
await run_unresolved_required_placeholder_tests();
await run_optional_fallback_tests();
await run_fixed_id_and_legacy_tests();
await run_list_adaptation_fixture_tests();
await run_starter_registration_tests();
await run_real_copy_tests();

console.log("starter contract tests passed");
