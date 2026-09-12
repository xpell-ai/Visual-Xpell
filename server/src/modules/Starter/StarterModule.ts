import fs from "node:fs";
import path from "node:path";

import {
  XError,
  XCommand,
  XModule,
  _x,
  _xlog,
  _xu,
} from "@xpell/node";

type JsonObject = Record<string, unknown>;

type PlaceholderValue = {
  _value: string;
  _source: "input" | "default";
};

export type StarterMetadata = {
  _id: string;
  _title: string;
  _description: string;
  _keywords: string[];
  _archetypes: string[];
  _entry_view: string;
  _adaptation_strategy: JsonObject;
  _preserve_object_ids: string[];
  _replaceable_object_ids: string[];
  _starter_capabilities: string[];
  _starter_version: string;
  _required_placeholders?: string[];
  _optional_placeholders?: string[];
  _fixed_object_ids?: string[];
  _adaptation_targets?: JsonObject;
  _primary_experience?: JsonObject;
  [key: string]: unknown;
};

export type StarterExpansionInput = {
  _starter_id: string;
  _app_id: string;
  _env?: string;
  _vision?: string;
  _app_name?: string;
  _app_title?: string;
  _app_description?: string;
  _app_archetype?: string;
  _app_scope?: string;
  _primary_entity?: string;
  _primary_entity_title?: string;
  _primary_view?: string;
  _primary_view_title?: string;
};

const DEFAULT_ENV = "default";
const STARTER_PUBLIC_FOLDERS = new Set(["style", "assets"]);
const PLACEHOLDER_PATTERN = /<([a-z][a-z0-9-]*)>/gu;
const SAFE_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9_-]*$/u;
const ID_LIKE_KEYS = new Set([
  "_id",
  "id",
  "_app_id",
  "_view_id",
  "_flow_id",
  "_entity_id",
  "_entry_view_id",
  "_entry_view",
  "_primary_view",
  "_primary_entity",
  "_source_view_id",
  "_target_id",
]);

export const STARTER_PLACEHOLDERS = [
  "<app-id>",
  "<app-name>",
  "<app-title>",
  "<app-description>",
  "<app-archetype>",
  "<app-scope>",
  "<primary-entity>",
  "<primary-entity-title>",
  "<primary-view>",
  "<primary-view-title>",
] as const;

function explicit_error(code: string, message: string, details?: JsonObject) {
  return {
    _ok: false,
    _error: {
      _code: code,
      _message: message,
      ...(details ? { _details: details } : {}),
    },
  };
}

function throw_starter_error(code: string, message: string, details?: JsonObject): never {
  throw new XError(code, message, {
    _meta: details,
  });
}

function assert_path_inside(root: string, candidate: string, code: string, message: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw_starter_error(code, message, { _root: root, _path: candidate });
  }
}

function optional_trimmed_string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function read_safe_segment(value: unknown, field_name: string): string {
  if (typeof value !== "string") {
    throw_starter_error("E_STARTER_INVALID_SEGMENT", `Invalid '${field_name}': expected safe path segment`, {
      _field: field_name,
    });
  }

  const segment = value.trim().toLowerCase();
  if (!SAFE_SEGMENT_PATTERN.test(segment)) {
    throw_starter_error("E_STARTER_INVALID_SEGMENT", `Invalid '${field_name}': expected safe path segment`, {
      _field: field_name,
      _value: value,
    });
  }

  return segment;
}

export function sanitize_app_id(value: unknown): string {
  if (typeof value !== "string") {
    throw_starter_error("E_STARTER_INVALID_APP_ID", "Invalid '_app_id': expected safe app id");
  }

  const raw = value.trim();
  if (raw.length === 0 || raw.includes("/") || raw.includes("\\") || raw.includes("..")) {
    throw_starter_error("E_STARTER_INVALID_APP_ID", "Invalid '_app_id': expected safe app id");
  }

  const normalized = raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_-]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^[-_]+|[-_]+$/gu, "");

  if (!SAFE_SEGMENT_PATTERN.test(normalized)) {
    throw_starter_error("E_STARTER_INVALID_APP_ID", "Invalid '_app_id': expected safe app id");
  }

  return normalized;
}

function sanitize_object_id(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9_.:-]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^[-_.:]+|[-_.:]+$/gu, "");

  if (!normalized || !/^[a-z0-9][a-z0-9_.:-]*$/u.test(normalized)) {
    throw_starter_error("E_STARTER_INVALID_OBJECT_ID", "Placeholder expansion produced an invalid object id", {
      _value: value,
    });
  }

  return normalized;
}

function title_from_id(value: string): string {
  return value
    .replace(/[-_]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function normalize_placeholder_name(value: string): string {
  const trimmed = value.trim();
  const match = /^<([a-z][a-z0-9-]*)>$/u.exec(trimmed);
  return match ? match[1] : trimmed.replace(/^<|>$/gu, "");
}

function placeholder_token(name: string): string {
  return `<${normalize_placeholder_name(name)}>`;
}

function read_string_array(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function is_plain_object(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copy_dir_recursive(src: string, dest: string): void {
  (_xu as unknown as { copyDirRecursive: (src: string, dest: string) => void })
    .copyDirRecursive(src, dest);
}

function clone_json<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function read_starter_metadata(app_file: JsonObject, fallback_starter_id: string): StarterMetadata {
  const meta = is_plain_object(app_file._meta) ? app_file._meta : {};
  const starter = is_plain_object(meta._starter) ? meta._starter : {};
  const title =
    optional_trimmed_string(starter._title) ??
    optional_trimmed_string(app_file._title) ??
    title_from_id(fallback_starter_id);

  return {
    ...starter,
    _id: optional_trimmed_string(starter._id) ?? fallback_starter_id,
    _title: title,
    _description:
      optional_trimmed_string(starter._description) ??
      optional_trimmed_string(app_file._description) ??
      `${title} starter`,
    _keywords: read_string_array(starter._keywords),
    _archetypes: read_string_array(starter._archetypes),
    _entry_view:
      optional_trimmed_string(starter._entry_view) ??
      optional_trimmed_string(meta._entry_view_id) ??
      "main",
    _adaptation_strategy: is_plain_object(starter._adaptation_strategy)
      ? starter._adaptation_strategy
      : { _mode: "preserve-compatible" },
    _preserve_object_ids: read_string_array(starter._preserve_object_ids),
    _replaceable_object_ids: read_string_array(starter._replaceable_object_ids),
    _starter_capabilities: read_string_array(starter._starter_capabilities),
    _starter_version: optional_trimmed_string(starter._starter_version) ?? "1.0.0",
    _required_placeholders: read_string_array(starter._required_placeholders),
    _optional_placeholders: read_string_array(starter._optional_placeholders),
    _fixed_object_ids: read_string_array(starter._fixed_object_ids),
  };
}

export function create_starter_placeholder_values(input: {
  _params: StarterExpansionInput;
  _starter: StarterMetadata;
  _starter_app: JsonObject;
}): Record<string, PlaceholderValue> {
  const app_id = sanitize_app_id(input._params._app_id);
  const app_name =
    optional_trimmed_string(input._params._app_name) ??
    optional_trimmed_string(input._starter_app._title) ??
    input._starter._title ??
    title_from_id(app_id);
  const app_title =
    optional_trimmed_string(input._params._app_title) ??
    optional_trimmed_string(input._starter_app._title) ??
    app_name;
  const app_description =
    optional_trimmed_string(input._params._app_description) ??
    optional_trimmed_string(input._params._vision) ??
    input._starter._description ??
    `${app_title} app`;
  const app_archetype =
    optional_trimmed_string(input._params._app_archetype) ??
    input._starter._archetypes[0] ??
    "custom";
  const app_scope =
    optional_trimmed_string(input._params._app_scope) ??
    "single-app";
  const primary_entity =
    sanitize_object_id(
      optional_trimmed_string(input._params._primary_entity) ??
      "record"
    );
  const primary_view =
    sanitize_object_id(
      optional_trimmed_string(input._params._primary_view) ??
      input._starter._entry_view ??
      "main"
    );

  return {
    "app-id": { _value: app_id, _source: "input" },
    "app-name": {
      _value: app_name,
      _source: optional_trimmed_string(input._params._app_name) ? "input" : "default",
    },
    "app-title": {
      _value: app_title,
      _source: optional_trimmed_string(input._params._app_title) ? "input" : "default",
    },
    "app-description": {
      _value: app_description,
      _source: optional_trimmed_string(input._params._app_description) || optional_trimmed_string(input._params._vision)
        ? "input"
        : "default",
    },
    "app-archetype": {
      _value: app_archetype,
      _source: optional_trimmed_string(input._params._app_archetype) ? "input" : "default",
    },
    "app-scope": {
      _value: app_scope,
      _source: optional_trimmed_string(input._params._app_scope) ? "input" : "default",
    },
    "primary-entity": {
      _value: primary_entity,
      _source: optional_trimmed_string(input._params._primary_entity) ? "input" : "default",
    },
    "primary-entity-title": {
      _value:
        optional_trimmed_string(input._params._primary_entity_title) ??
        title_from_id(primary_entity),
      _source: optional_trimmed_string(input._params._primary_entity_title) ? "input" : "default",
    },
    "primary-view": {
      _value: primary_view,
      _source: optional_trimmed_string(input._params._primary_view) ? "input" : "default",
    },
    "primary-view-title": {
      _value:
        optional_trimmed_string(input._params._primary_view_title) ??
        title_from_id(primary_view),
      _source: optional_trimmed_string(input._params._primary_view_title) ? "input" : "default",
    },
  };
}

function rewrite_public_reference(value: string, app_id: string): string {
  for (const folder of STARTER_PUBLIC_FOLDERS) {
    if (value.startsWith(`${folder}/`)) {
      return `/public/${app_id}/${value}`;
    }
  }

  return value;
}

function collect_required_placeholders(starter: StarterMetadata): Set<string> {
  return new Set(read_string_array(starter._required_placeholders).map(normalize_placeholder_name));
}

function fixed_object_ids(starter: StarterMetadata): Set<string> {
  return new Set([
    ...read_string_array(starter._fixed_object_ids),
    ...read_string_array(starter._preserve_object_ids),
  ]);
}

function collect_json_object_ids(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collect_json_object_ids(item, ids);
    return;
  }

  if (!is_plain_object(value)) return;

  if (typeof value._id === "string" && value._id.trim().length > 0) {
    ids.add(value._id.trim());
  }

  for (const child of Object.values(value)) {
    collect_json_object_ids(child, ids);
  }
}

function collect_starter_view_object_ids(starter_dir: string): Set<string> {
  const ids = new Set<string>();
  const views_dir = path.join(starter_dir, "views");
  if (!fs.existsSync(views_dir)) return ids;

  for (const entry of fs.readdirSync(views_dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const view = read_json_object_file(path.join(views_dir, entry.name));
    collect_json_object_ids(view, ids);
  }

  return ids;
}

type StarterViewIndex = {
  _view_ids: Set<string>;
  _object_ids: Set<string>;
  _objects_by_id: Map<string, JsonObject>;
};

function collect_json_objects_by_id(value: unknown, index: StarterViewIndex): void {
  if (Array.isArray(value)) {
    for (const item of value) collect_json_objects_by_id(item, index);
    return;
  }

  if (!is_plain_object(value)) return;

  if (typeof value._id === "string" && value._id.trim().length > 0) {
    const id = value._id.trim();
    index._object_ids.add(id);
    index._objects_by_id.set(id, value);
  }

  for (const child of Object.values(value)) {
    collect_json_objects_by_id(child, index);
  }
}

function collect_starter_view_index(starter_dir: string): StarterViewIndex {
  const index: StarterViewIndex = {
    _view_ids: new Set<string>(),
    _object_ids: new Set<string>(),
    _objects_by_id: new Map<string, JsonObject>(),
  };
  const views_dir = path.join(starter_dir, "views");
  if (!fs.existsSync(views_dir)) return index;

  for (const entry of fs.readdirSync(views_dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const view = read_json_object_file(path.join(views_dir, entry.name));
    if (typeof view._id === "string" && view._id.trim().length > 0) {
      index._view_ids.add(view._id.trim());
    }
    collect_json_objects_by_id(view, index);
  }

  return index;
}

function adaptation_target_fields(targets: JsonObject): string[] {
  return Object.keys(targets)
    .filter((key) => key !== "_required" && key !== "_optional" && key.endsWith("_id"));
}

function read_adaptation_target_id(targets: JsonObject, field: string): string | undefined {
  const raw = targets[field];
  if (typeof raw === "string") return optional_trimmed_string(raw);
  if (is_plain_object(raw)) return optional_trimmed_string(raw._id);
  return undefined;
}

function is_required_adaptation_target(targets: JsonObject, field: string): boolean {
  const raw = targets[field];
  return read_string_array(targets._required).includes(field) ||
    (is_plain_object(raw) && raw._required === true);
}

export function validate_starter_adaptation_targets(input: {
  _starter_dir: string;
  _starter: StarterMetadata;
}): void {
  const targets = is_plain_object(input._starter._adaptation_targets)
    ? input._starter._adaptation_targets
    : undefined;
  if (!targets) return;

  const object_ids = collect_starter_view_object_ids(input._starter_dir);
  const fields = new Set([
    ...adaptation_target_fields(targets),
    ...read_string_array(targets._required),
  ]);

  for (const field of fields) {
    const target_id = read_adaptation_target_id(targets, field);
    const required = is_required_adaptation_target(targets, field);

    if (!target_id) {
      if (required) {
        throw_starter_error("E_STARTER_INVALID_ADAPTATION_TARGET", "Required starter adaptation target is missing", {
          _starter_id: input._starter._id,
          _field: field,
        });
      }
      continue;
    }

    if (target_id.includes("<") || target_id.includes(">")) {
      throw_starter_error("E_STARTER_INVALID_ADAPTATION_TARGET", "Starter adaptation target must be an explicit object id", {
        _starter_id: input._starter._id,
        _field: field,
        _target_id: target_id,
      });
    }

    if (!object_ids.has(target_id)) {
      throw_starter_error("E_STARTER_INVALID_ADAPTATION_TARGET", "Starter adaptation target id does not exist", {
        _starter_id: input._starter._id,
        _field: field,
        _target_id: target_id,
      });
    }
  }
}

function primary_experience_target_fields(experience: JsonObject): string[] {
  return Object.keys(experience)
    .filter((key) => key !== "_required" && key !== "_optional" && key.endsWith("_id"));
}

function read_primary_experience_id(experience: JsonObject, field: string): string | undefined {
  const raw = experience[field];
  if (typeof raw === "string") return optional_trimmed_string(raw);
  if (is_plain_object(raw)) return optional_trimmed_string(raw._id);
  return undefined;
}

function is_required_primary_experience_target(experience: JsonObject, field: string): boolean {
  const raw = experience[field];
  return field === "_entry_view_id" ||
    field === "_content_container_id" ||
    read_string_array(experience._required).includes(field) ||
    (is_plain_object(raw) && raw._required === true);
}

function validate_explicit_target_id(input: {
  _starter_id: string;
  _field: string;
  _target_id: string;
  _index: StarterViewIndex;
  _code: string;
}): void {
  if (input._target_id.includes("<") || input._target_id.includes(">")) {
    throw_starter_error(input._code, "Starter primary-experience target must be an explicit object id", {
      _starter_id: input._starter_id,
      _field: input._field,
      _target_id: input._target_id,
    });
  }

  if (!input._index._object_ids.has(input._target_id)) {
    throw_starter_error(input._code, "Starter primary-experience target id does not exist", {
      _starter_id: input._starter_id,
      _field: input._field,
      _target_id: input._target_id,
    });
  }
}

function is_non_leaf_composition_container(target: JsonObject | undefined): boolean {
  return Boolean(target && Array.isArray(target._children));
}

export function validate_starter_primary_experience(input: {
  _starter_dir: string;
  _starter: StarterMetadata;
}): void {
  const experience = is_plain_object(input._starter._primary_experience)
    ? input._starter._primary_experience
    : undefined;
  if (!experience) return;

  const mode = optional_trimmed_string(experience._mode);
  if (!mode) {
    throw_starter_error("E_STARTER_INVALID_PRIMARY_EXPERIENCE", "Starter primary-experience mode is missing", {
      _starter_id: input._starter._id,
      _field: "_mode",
    });
  }

  const index = collect_starter_view_index(input._starter_dir);
  const fields = new Set([
    "_entry_view_id",
    "_content_container_id",
    ...primary_experience_target_fields(experience),
    ...read_string_array(experience._required),
  ]);

  for (const field of fields) {
    const target_id = read_primary_experience_id(experience, field);
    const required = is_required_primary_experience_target(experience, field);

    if (!target_id) {
      if (required) {
        throw_starter_error("E_STARTER_INVALID_PRIMARY_EXPERIENCE", "Required starter primary-experience target is missing", {
          _starter_id: input._starter._id,
          _field: field,
        });
      }
      continue;
    }

    if (field === "_entry_view_id") {
      if (!index._view_ids.has(target_id)) {
        throw_starter_error("E_STARTER_INVALID_PRIMARY_EXPERIENCE", "Starter primary-experience target view does not exist", {
          _starter_id: input._starter._id,
          _field: field,
          _target_id: target_id,
        });
      }
      continue;
    }

    validate_explicit_target_id({
      _starter_id: input._starter._id,
      _field: field,
      _target_id: target_id,
      _index: index,
      _code: "E_STARTER_INVALID_PRIMARY_EXPERIENCE",
    });
  }

  const content_container_id = read_primary_experience_id(experience, "_content_container_id");
  const content_container = content_container_id
    ? index._objects_by_id.get(content_container_id)
    : undefined;
  if (!is_non_leaf_composition_container(content_container)) {
    throw_starter_error("E_STARTER_INVALID_PRIMARY_EXPERIENCE", "Starter primary-experience content container must be a non-leaf object", {
      _starter_id: input._starter._id,
      _field: "_content_container_id",
      _target_id: content_container_id,
    });
  }

  for (const [field, value] of Object.entries(experience)) {
    if (!field.endsWith("_ids")) continue;
    for (const target_id of read_string_array(value)) {
      validate_explicit_target_id({
        _starter_id: input._starter._id,
        _field: field,
        _target_id: target_id,
        _index: index,
        _code: "E_STARTER_INVALID_PRIMARY_EXPERIENCE",
      });
    }
  }
}

export function validate_starter_object_classifications(starter: StarterMetadata): void {
  const preserved = new Set(read_string_array(starter._preserve_object_ids));
  for (const id of read_string_array(starter._replaceable_object_ids)) {
    if (preserved.has(id)) {
      throw_starter_error("E_STARTER_INVALID_OBJECT_CLASSIFICATION", "Starter object cannot be both preserved and replaceable", {
        _starter_id: starter._id,
        _object_id: id,
      });
    }
  }

  const experience = is_plain_object(starter._primary_experience)
    ? starter._primary_experience
    : undefined;
  if (!experience) return;

  for (const id of read_string_array(experience._replaceable_region_ids)) {
    if (preserved.has(id)) {
      throw_starter_error("E_STARTER_INVALID_OBJECT_CLASSIFICATION", "Starter primary-experience region cannot be both preserved and replaceable", {
        _starter_id: starter._id,
        _object_id: id,
      });
    }
  }
}

export function validate_starter_contract_metadata(input: {
  _starter_dir: string;
  _starter: StarterMetadata;
}): void {
  validate_starter_object_classifications(input._starter);
  validate_starter_adaptation_targets(input);
  validate_starter_primary_experience(input);
}

export function expand_starter_placeholders(input: {
  _value: unknown;
  _values: Record<string, PlaceholderValue>;
  _starter: StarterMetadata;
  _app_id: string;
  _path?: string;
  _key?: string;
}): unknown {
  const current_path = input._path ?? "$";

  if (typeof input._value === "string") {
    const required = collect_required_placeholders(input._starter);
    const fixed_ids = fixed_object_ids(input._starter);
    const original = input._value;

    if ((input._key === "_id" || input._key === "id") && fixed_ids.has(original)) {
      return rewrite_public_reference(original, input._app_id);
    }

    let expanded = original.replace(PLACEHOLDER_PATTERN, (match, raw_name: string) => {
      const name = normalize_placeholder_name(raw_name);
      const value = input._values[name];
      if (!value) {
        if (required.has(name)) {
          throw_starter_error("E_STARTER_UNRESOLVED_PLACEHOLDER", "Required starter placeholder is unresolved", {
            _placeholder: placeholder_token(name),
            _path: current_path,
          });
        }
        return match;
      }

      return value._value;
    });

    for (const name of required) {
      if (expanded.includes(placeholder_token(name))) {
        throw_starter_error("E_STARTER_UNRESOLVED_PLACEHOLDER", "Required starter placeholder is unresolved", {
          _placeholder: placeholder_token(name),
          _path: current_path,
        });
      }
    }

    if (input._key && ID_LIKE_KEYS.has(input._key) && expanded !== original) {
      expanded = sanitize_object_id(expanded);
    }

    return rewrite_public_reference(expanded, input._app_id);
  }

  if (Array.isArray(input._value)) {
    return input._value.map((item, index) =>
      expand_starter_placeholders({
        ...input,
        _value: item,
        _path: `${current_path}[${index}]`,
        _key: undefined,
      })
    );
  }

  if (is_plain_object(input._value)) {
    const out: JsonObject = {};
    for (const [key, item] of Object.entries(input._value)) {
      out[key] = expand_starter_placeholders({
        ...input,
        _value: item,
        _path: `${current_path}.${key}`,
        _key: key,
      });
    }

    return out;
  }

  return input._value;
}

function read_json_object_file(file_path: string): JsonObject {
  try {
    const parsed = JSON.parse(fs.readFileSync(file_path, "utf-8"));
    if (!is_plain_object(parsed)) {
      throw new Error("Expected JSON object");
    }

    return parsed;
  } catch (error) {
    throw_starter_error("E_STARTER_INVALID_JSON", "Starter JSON file is invalid", {
      _path: file_path,
      _error: error instanceof Error ? error.message : String(error),
    });
  }
}

function write_json_object_file(file_path: string, data: JsonObject): void {
  fs.writeFileSync(file_path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function rewrite_json_files_in_dir(input: {
  _dir: string;
  _app_id: string;
  _values: Record<string, PlaceholderValue>;
  _starter: StarterMetadata;
}): void {
  if (!fs.existsSync(input._dir)) return;

  for (const entry of fs.readdirSync(input._dir, { withFileTypes: true })) {
    const file_path = path.join(input._dir, entry.name);
    if (entry.isDirectory()) {
      rewrite_json_files_in_dir({
        ...input,
        _dir: file_path,
      });
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const parsed = read_json_object_file(file_path);
    const expanded = expand_starter_placeholders({
      _value: parsed,
      _values: input._values,
      _starter: input._starter,
      _app_id: input._app_id,
      _path: "$",
    });

    if (!is_plain_object(expanded)) {
      throw_starter_error("E_STARTER_INVALID_JSON", "Expanded starter JSON must remain an object", {
        _path: file_path,
      });
    }

    write_json_object_file(file_path, expanded);
  }
}

function resolve_server_xvm_runtime(): {
  _work_folder: string;
  _apps_root: string;
} {
  const get_module = (_x as unknown as { getModule?: (name: string) => unknown }).getModule;
  const server_xvm = typeof get_module === "function"
    ? get_module.call(_x, "server-xvm")
    : undefined;
  const raw = is_plain_object(server_xvm) ? server_xvm : {};
  const work_folder = optional_trimmed_string(raw._work_folder) ?? "./work";
  const apps_root =
    optional_trimmed_string(raw._apps_root) ??
    path.join(work_folder, "xvm", "apps");

  return {
    _work_folder: path.resolve(work_folder),
    _apps_root: path.resolve(apps_root),
  };
}

function resolve_starters_root(): string {
  const starters_root = path.resolve(
    optional_trimmed_string(process.env.XPELL_STARTERS_ROOT) ??
    path.join("./system-xapps", "app-starters")
  );
  if (!fs.existsSync(starters_root) || !fs.statSync(starters_root).isDirectory()) {
    throw_starter_error("E_STARTER_NOT_FOUND", "Configured starters folder not found", {
      _path: starters_root,
    });
  }

  return starters_root;
}

export function resolve_starter_source_dir(starter_id: string, starters_root = resolve_starters_root()): string {
  const safe_starter_id = read_safe_segment(starter_id, "_starter_id");
  const exact_dir = path.resolve(starters_root, safe_starter_id);
  assert_path_inside(starters_root, exact_dir, "E_STARTER_INVALID_SEGMENT", "Invalid starter path");
  if (fs.existsSync(exact_dir) && fs.statSync(exact_dir).isDirectory()) {
    return exact_dir;
  }

  const found = fs.readdirSync(starters_root, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.toLowerCase() === safe_starter_id);
  if (found) {
    const found_dir = path.resolve(starters_root, found.name);
    assert_path_inside(starters_root, found_dir, "E_STARTER_INVALID_SEGMENT", "Invalid starter path");
    return found_dir;
  }

  throw_starter_error("E_STARTER_NOT_FOUND", `Starter not found: ${safe_starter_id}`, {
    _starter_id: safe_starter_id,
  });
}

function resolve_target_app_dir(env: string, app_id: string): string {
  const runtime = resolve_server_xvm_runtime();
  const app_dir = path.resolve(runtime._apps_root, env, app_id);
  assert_path_inside(runtime._apps_root, app_dir, "E_STARTER_INVALID_APP_ID", "Invalid target app path");
  return app_dir;
}

function resolve_public_app_dir(app_id: string): string {
  const runtime = resolve_server_xvm_runtime();
  const public_root = path.resolve(runtime._work_folder, "public");
  const public_app_dir = path.resolve(public_root, app_id);
  assert_path_inside(public_root, public_app_dir, "E_STARTER_INVALID_APP_ID", "Invalid public app path");
  return public_app_dir;
}

function copy_starter_runtime_files(starter_dir: string, target_dir: string): void {
  fs.mkdirSync(target_dir, { recursive: true });

  for (const entry of fs.readdirSync(starter_dir, { withFileTypes: true })) {
    if (STARTER_PUBLIC_FOLDERS.has(entry.name) || entry.name === ".DS_Store") {
      continue;
    }

    const src_path = path.join(starter_dir, entry.name);
    const target_path = path.join(target_dir, entry.name);
    if (entry.isDirectory()) {
      copy_dir_recursive(src_path, target_path);
    } else if (entry.isFile()) {
      fs.copyFileSync(src_path, target_path);
    }
  }
}

function copy_starter_public_files(starter_dir: string, public_app_dir: string): void {
  fs.mkdirSync(public_app_dir, { recursive: true });

  for (const folder of STARTER_PUBLIC_FOLDERS) {
    const src_path = path.join(starter_dir, folder);
    if (!fs.existsSync(src_path)) continue;
    if (!fs.statSync(src_path).isDirectory()) {
      throw_starter_error("E_STARTER_COPY_FAILED", "Starter public path is not a directory", {
        _path: src_path,
      });
    }

    copy_dir_recursive(src_path, path.join(public_app_dir, folder));
  }
}

export function load_starter_contract(starter_dir: string, starter_id: string): {
  _app: JsonObject;
  _starter: StarterMetadata;
} {
  const app_file_path = path.join(starter_dir, "app.json");
  if (!fs.existsSync(app_file_path)) {
    throw_starter_error("E_STARTER_COPY_FAILED", "Starter app.json is missing", {
      _starter_id: starter_id,
    });
  }

  const starter_app = read_json_object_file(app_file_path);
  const starter = read_starter_metadata(starter_app, starter_id);
  validate_starter_contract_metadata({
    _starter_dir: starter_dir,
    _starter: starter,
  });
  return {
    _app: starter_app,
    _starter: starter,
  };
}

function ensure_metadata_required_placeholders_are_resolved(input: {
  _starter: StarterMetadata;
  _values: Record<string, PlaceholderValue>;
}): void {
  for (const name of collect_required_placeholders(input._starter)) {
    if (!input._values[name]) {
      throw_starter_error("E_STARTER_UNRESOLVED_PLACEHOLDER", "Required starter placeholder is unresolved", {
        _placeholder: placeholder_token(name),
      });
    }
  }
}

export async function create_app_from_starter(params: StarterExpansionInput) {
  const starter_id = read_safe_segment(params._starter_id, "_starter_id");
  const app_id = sanitize_app_id(params._app_id);
  const env = read_safe_segment(params._env ?? DEFAULT_ENV, "_env");
  const starter_dir = resolve_starter_source_dir(starter_id);
  const target_dir = resolve_target_app_dir(env, app_id);
  const public_app_dir = resolve_public_app_dir(app_id);

  if (fs.existsSync(target_dir)) {
    throw_starter_error("E_STARTER_APP_ALREADY_EXISTS", `Target app already exists: ${app_id}`, {
      _app_id: app_id,
      _env: env,
    });
  }

  if (fs.existsSync(public_app_dir)) {
    throw_starter_error("E_STARTER_APP_ALREADY_EXISTS", `Target app public folder already exists: ${app_id}`, {
      _app_id: app_id,
      _path: public_app_dir,
    });
  }

  const contract = load_starter_contract(starter_dir, starter_id);
  const values = create_starter_placeholder_values({
    _params: { ...params, _app_id: app_id, _env: env },
    _starter: contract._starter,
    _starter_app: contract._app,
  });
  ensure_metadata_required_placeholders_are_resolved({
    _starter: contract._starter,
    _values: values,
  });

  try {
    copy_starter_runtime_files(starter_dir, target_dir);
    copy_starter_public_files(starter_dir, public_app_dir);
    rewrite_json_files_in_dir({
      _dir: target_dir,
      _app_id: app_id,
      _values: values,
      _starter: contract._starter,
    });
  } catch (error) {
    try {
      fs.rmSync(target_dir, { recursive: true, force: true });
      fs.rmSync(public_app_dir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup after a deterministic starter copy failure.
    }

    throw error;
  }

  const app_file_path = path.join(target_dir, "app.json");
  const copied_app = read_json_object_file(app_file_path);
  const copied_meta = is_plain_object(copied_app._meta) ? copied_app._meta : {};
  const now = new Date().toISOString();
  const starter_meta = clone_json(contract._starter) as JsonObject;
  const app_file: JsonObject = {
    ...copied_app,
    _app_id: app_id,
    _env: env,
    _system: false,
    _readonly: false,
    _meta: {
      ...copied_meta,
      _starter: starter_meta,
      _starter_id: starter_id,
      ...(optional_trimmed_string(params._vision) ? { _vision: optional_trimmed_string(params._vision) } : {}),
      _created_at:
        optional_trimmed_string(copied_meta._created_at) ??
        now,
      _updated_at: now,
      _entry_view_id:
        optional_trimmed_string(copied_meta._entry_view_id) ??
        contract._starter._entry_view,
    },
    _config: is_plain_object(copied_app._config) ? copied_app._config : {},
  };

  write_json_object_file(app_file_path, app_file);
  validate_starter_contract_metadata({
    _starter_dir: target_dir,
    _starter: contract._starter,
  });

  const load_response = await _x.execute(new XCommand({
    _module: "server-xvm",
    _op: "load_app_from_disk",
    _params: {
      _app_id: app_id,
      _env: env,
    },
  }));

  if (!is_plain_object(load_response) || load_response._ok !== true) {
    throw_starter_error("E_STARTER_LOAD_FAILED", "Failed to load starter app", {
      _app_id: app_id,
      _env: env,
      _starter_id: starter_id,
      _response: load_response as unknown as JsonObject,
    });
  }

  return {
    _ok: true,
    _result: {
      _app_id: app_id,
      _env: env,
      _starter_id: starter_id,
      _entry_view_id:
        optional_trimmed_string((app_file._meta as JsonObject)._entry_view_id) ??
        contract._starter._entry_view,
      _created: true,
    },
  };
}

export class StarterModule extends XModule {
  static _name = "starter";
  static _ops = {
    create_app_from_starter: {
      _name: "create_app_from_starter",
      _scope: "module",
      _description: "Create a mutable app by copying and expanding a declared starter.",
    },
  };

  constructor() {
    super({ _name: StarterModule._name });
  }

  async _create_app_from_starter(xcmd: XCommand) {
    const params = is_plain_object(xcmd?._params)
      ? xcmd._params as unknown as StarterExpansionInput
      : {} as StarterExpansionInput;

    try {
      _xlog.log("[starter] create app from starter requested", {
        _starter_id: params._starter_id,
        _app_id: params._app_id,
        _env: params._env ?? DEFAULT_ENV,
      });
      const result = await create_app_from_starter(params);
      _xlog.log("[starter] app created from starter", result._result);
      return result;
    } catch (error) {
      _xlog.error("[starter] create_app_from_starter failed", error);
      if (error instanceof XError) {
        const xerror = error as Error & { _code?: string; _meta?: JsonObject };
        return explicit_error(xerror._code ?? "E_STARTER_CREATE_APP_FAILED", xerror.message, xerror._meta);
      }

      return explicit_error(
        "E_STARTER_CREATE_APP_FAILED",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}

export default StarterModule;
