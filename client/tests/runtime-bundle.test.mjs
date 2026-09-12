import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire, register } from "node:module";
import { fileURLToPath } from "node:url";

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPublicRoot = path.resolve(clientRoot, "../server/work/public");
const require = createRequire(import.meta.url);

const xpellUiPackageJson = require.resolve("@xpell/ui/package.json");
const xpellUiRoot = path.dirname(xpellUiPackageJson);
const xpellUiDist = path.join(xpellUiRoot, "dist", "xpell-ui.es.js");
const xpellUiCss = path.join(xpellUiRoot, "src", "XUI", "Style", "xui.css");

assert.equal(
  xpellUiRoot.endsWith(path.join("packages", "xpell-ui")),
  true,
  "@xpell/ui must resolve to the workspace package, not a stale installed copy",
);

const xpellUiDistText = fs.readFileSync(xpellUiDist, "utf8");
assert.equal(xpellUiDistText.includes("refresh-mcp-access"), true, "@xpell/ui dist must expose refresh-mcp-access");
assert.equal(xpellUiDistText.includes("_refresh_mcp_access"), true, "@xpell/ui dist must contain the dispatcher method");
register(path.join(xpellUiRoot, "tests", "ignore-css-loader.mjs"), import.meta.url);

class TestElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.className = "";
    this.attributes = {};
    this.style = {};
    this.children = [];
    this.childNodes = this.children;
    this.textContent = "";
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === "class") this.className = String(value);
  }

  getAttribute(key) {
    if (key === "class") return this.className;
    return this.attributes[key] ?? null;
  }

  hasAttribute(key) {
    return Object.prototype.hasOwnProperty.call(this.attributes, key);
  }

  removeAttribute(key) {
    delete this.attributes[key];
    if (key === "class") this.className = "";
  }

  replaceChildren(...children) {
    this.children.length = 0;
    this.children.push(...children);
  }
}

globalThis.HTMLElement = TestElement;
globalThis.HTMLTableElement = TestElement;
globalThis.window = {
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  },
  location: {
    origin: "http://admin.test",
    href: "http://admin.test/admin",
  },
};
globalThis.document = {
  createElement(tag) { return new TestElement(tag); },
  body: new TestElement("body"),
  documentElement: {
    classList: {
      add() {},
      remove() {},
    },
    setAttribute() {},
  },
};

const { _x, XUI, VibeSystemModule } = await import("@xpell/ui");
const { BARCODE_SCANNER_MODULE_ID, createBarcodeScannerModule } = await import("@xpell/food-product-lookup/client");
const { XDashPack } = await import("@xpell/xdashboard");

const xpellUiCssText = fs.readFileSync(xpellUiCss, "utf8");
assert.equal(xpellUiCssText.includes('[data-theme="xdashboard-2026-dark"]'), true, "XUI must include the 2026 dark dashboard theme");
assert.equal(xpellUiCssText.includes('[data-theme="xdashboard-2026-light"]'), true, "XUI must include the 2026 light dashboard theme");

const xdashboardObjects = XDashPack.getObjects();
assert.equal(typeof xdashboardObjects.xshell, "function", "XDashboard must register xshell");
assert.equal(typeof xdashboardObjects.xpage, "function", "XDashboard must register xpage");
assert.equal(typeof xdashboardObjects["xpage-header"], "function", "XDashboard must register xpage-header");
assert.equal(typeof xdashboardObjects.toolbar, "function", "XDashboard must register toolbar");
assert.equal(typeof xdashboardObjects.xsection, "function", "XDashboard must register xsection");
assert.equal(typeof xdashboardObjects.table, "function", "XDashboard must register table");
assert.equal(typeof xdashboardObjects.igroup, "function", "XDashboard must register igroup");
assert.equal(typeof xdashboardObjects.xselect, "function", "XDashboard must register xselect");
assert.equal(typeof xdashboardObjects.badge, "function", "XDashboard must register badge");

const page = new xdashboardObjects.xpage({
  _id: "runtime-operations-page",
  _type: "xpage",
  class: "dashboard-main-scroll",
  _width: "contained",
  _density: "comfortable",
});
assert.equal(page.class, "xpage xpage--width-contained xpage--density-comfortable dashboard-main-scroll");

const pageHeader = new xdashboardObjects["xpage-header"]({
  _id: "runtime-operations-header",
  _type: "xpage-header",
  _title: "Operations Dashboard",
  _subtitle: "Runtime header",
  _density: "comfortable",
});
assert.equal(pageHeader.class, "xpage-header xpage-header--density-comfortable");

const toolbar = new xdashboardObjects.toolbar({
  _id: "runtime-toolbar",
  _type: "toolbar",
  class: "list-starter-toolbar",
  _variant: "subtle",
  _density: "comfortable",
});
assert.equal(toolbar.class, "xtoolbar list-starter-toolbar xtoolbar--variant-subtle xtoolbar--density-comfortable");

const igroup = new xdashboardObjects.igroup({
  _id: "runtime-igroup",
  _type: "igroup",
  class: "list-starter-toolbar-actions",
  _variant: "plain",
  _density: "comfortable",
});
assert.equal(igroup.class, "xigroup list-starter-toolbar-actions xigroup--variant-plain xigroup--density-comfortable");

const badge = new xdashboardObjects.badge({
  _id: "runtime-ready-badge",
  _type: "badge",
  _text: "Ready",
  _variant: "success",
  _size: "md",
  _pill: true,
});
const badgeDom = badge.getDOMObject();
assert.equal(badgeDom.textContent, "", "XDashboard badge root text must be suppressed");
assert.equal(
  badgeDom.children.map((child) => child.textContent).filter((text) => text === "Ready").length,
  1,
  "XDashboard badge must render badge text exactly once",
);

const objects = new Map();
const makeObject = (id) => {
  const object = {
    _text: "",
    _value: "",
    value: "",
    disabled: false,
    _visible: true,
    dom: {
      textContent: "",
      value: "",
      style: { display: "" },
      setAttribute() {},
    },
    setText(text) {
      this._text = String(text ?? "");
      this.dom.textContent = this._text;
    },
    setValue(value) {
      this._value = String(value ?? "");
      this.value = this._value;
      this.dom.value = this._value;
    },
    show() {
      this._visible = true;
      this.dom.style.display = "";
    },
    hide() {
      this._visible = false;
      this.dom.style.display = "none";
    },
  };
  objects.set(id, object);
};

for (const id of [
  "mcp-status-value",
  "mcp-endpoint-value",
  "mcp-token-expires",
  "mcp-generation-status",
  "mcp-disabled-help",
  "mcp-generate-token",
  "mcp-copy-token",
  "mcp-token-group",
  "mcp-token-value",
  "mcp-setup-snippet",
]) {
  makeObject(id);
}

XUI.getObject = (id) => objects.get(id) ?? null;

const module = new VibeSystemModule();
assert.equal(module._name, "vibe-system");
assert.equal(typeof module._refresh_mcp_access, "function");

const scannerModule = createBarcodeScannerModule();
assert.equal(scannerModule._name, BARCODE_SCANNER_MODULE_ID);

if (!_x.getModule("vibe-system")) {
  await _x.loadModuleAsync(module);
}

if (!_x.getModule(BARCODE_SCANNER_MODULE_ID)) {
  await _x.loadModuleAsync(scannerModule);
}

const scannerSkillEntry = _x.getSkills()._modules.find((entry) => entry._name === BARCODE_SCANNER_MODULE_ID);
assert.ok(scannerSkillEntry, "barcode-scanner must appear in the client runtime skill snapshot");
assert.equal(
  scannerSkillEntry._skills?.[0]?._type,
  "client-module-api",
  "barcode-scanner must be discoverable as a client module skill",
);

const dispatchResult = await _x.execute({
  _module: "vibe-system",
  _op: "refresh-mcp-access",
  _params: {},
});

assert.equal(dispatchResult._ok, true);
assert.equal(dispatchResult._status, "connecting");
assert.equal(dispatchResult._deferred, true);
assert.equal(objects.get("mcp-status-value")._text, "● Checking");
assert.equal(objects.get("mcp-disabled-help")._text, "MCP status is unavailable until the server connection is ready.");

const indexHtmlPath = path.join(serverPublicRoot, "index.html");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
const scriptMatch = indexHtml.match(/<script\b[^>]*\bsrc=["']([^"']*index-[^"']+\.js)["']/i);
assert.ok(scriptMatch, "server public index.html must reference a hashed Vite index asset");

const scriptSrc = scriptMatch[1];
const normalizedScriptPath = scriptSrc.replace(/^\/public\//, "").replace(/^\//, "");
const runtimeBundlePath = path.join(serverPublicRoot, normalizedScriptPath);
assert.equal(fs.existsSync(runtimeBundlePath), true, `referenced runtime bundle must exist: ${scriptSrc}`);

const runtimeBundle = fs.readFileSync(runtimeBundlePath, "utf8");
assert.equal(runtimeBundle.includes("refresh-mcp-access"), true, "served runtime bundle must include refresh-mcp-access");
assert.equal(runtimeBundle.includes("_refresh_mcp_access"), true, "served runtime bundle must include _refresh_mcp_access");
assert.equal(runtimeBundle.includes("barcode-scanner"), true, "served runtime bundle must include barcode-scanner");
assert.equal(runtimeBundle.includes("start-scan"), true, "served runtime bundle must include barcode-scanner start-scan op");
assert.equal(runtimeBundle.includes("index-DlbdJha2.js"), false, "served runtime bundle must not point back to the stale August asset");

const canonicalLoadIndex = runtimeBundle.indexOf("getModule(\"vibe-system\")");
const callerModulesIndex = runtimeBundle.indexOf("._modules", canonicalLoadIndex);
assert.notEqual(canonicalLoadIndex, -1, "served runtime bundle must check canonical vibe-system registration");
assert.notEqual(callerModulesIndex, -1, "served runtime bundle must contain caller module loading");
assert.equal(
  canonicalLoadIndex < callerModulesIndex,
  true,
  "served runtime bundle must register canonical VibeSystem before caller-provided modules can shadow it",
);

console.log("starter runtime bundle tests passed");
