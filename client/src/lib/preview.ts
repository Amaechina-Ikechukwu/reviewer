import type { CodeFile } from "../types";

/** Extensions the in-browser bundler will hand to Babel. Everything else is
 * wrapped as an asset module (css / json / svg / images / unknown). */
const MODULE_EXT = [".jsx", ".tsx", ".js", ".ts", ".mjs", ".cjs"];

/** Directory names that are meaningful project roots, so a shared top-level
 * folder with one of these names is real structure, not a ZIP wrapper. */
const PROJECT_DIRS = new Set(["src", "public", "app", "pages", "components", "assets", "lib", "styles"]);

function extname(name: string) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

function normalizePath(path: string) {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") out.pop();
    else if (part !== "." && part !== "") out.push(part);
  }
  return out.join("/");
}

/**
 * ZIP submissions are almost always nested under one or more wrapper folders
 * (`my-app/src/main.jsx`, `submission/my-app/index.html`). Module resolution
 * assumes project-root-relative paths, so peel the wrappers off first.
 */
export function wrapperPrefix(names: string[]): string {
  let prefix = "";
  let current = names;
  while (current.length > 0) {
    const first = current[0].split("/")[0];
    if (!first || !current[0].includes("/")) break;
    if (PROJECT_DIRS.has(first.toLowerCase())) break;
    if (!current.every((name) => name.startsWith(`${first}/`))) break;
    prefix += `${first}/`;
    current = current.map((name) => name.slice(first.length + 1));
  }
  return prefix;
}

/**
 * Detects a React project. Extension alone is not enough — Create React App
 * submissions keep JSX in plain `.js` files, and those were previously
 * skipped entirely so the student saw no preview at all.
 */
export function hasReactApp(files: CodeFile[]) {
  return files.some((file) => {
    if (/\.(jsx|tsx)$/i.test(file.filename)) return true;
    if (!/\.(js|ts|mjs|cjs)$/i.test(file.filename)) return false;
    return /\bfrom\s*["']react["']|require\(\s*["']react["']\s*\)/.test(file.content);
  });
}

/**
 * Which major version of Tailwind the submission uses, or 0 for none.
 * The two versions need different browser builds and different CSS handling:
 * v3 uses `@tailwind` directives and a config file, v4 uses
 * `@import "tailwindcss"` and `@theme`. Loading the v3 CDN for a v4 project
 * silently produces an unstyled page.
 */
function tailwindVersion(files: CodeFile[]): 0 | 3 | 4 {
  const pkg = files.find((file) => /(^|\/)package\.json$/i.test(file.filename));
  if (pkg) {
    if (/@tailwindcss\/(vite|postcss|browser|cli)/.test(pkg.content)) return 4;
    const pinned = pkg.content.match(/"tailwindcss"\s*:\s*"[^\d"]*(\d+)/);
    if (pinned) return Number(pinned[1]) >= 4 ? 4 : 3;
  }

  const stylesheets = files.filter((file) => /\.css$/i.test(file.filename));
  if (stylesheets.some((file) => /@import\s+["']tailwindcss|@theme\b|@plugin\s+["']/.test(file.content))) return 4;
  if (stylesheets.some((file) => /@tailwind\b/.test(file.content))) return 3;
  if (files.some((file) => /(^|\/)tailwind\.config\.(js|cjs|mjs|ts)$/i.test(file.filename))) return 3;

  return 0;
}

function tailwindScript(version: 0 | 3 | 4) {
  if (version === 4) return '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>';
  if (version === 3) return '<script src="https://cdn.tailwindcss.com"></script>';
  return "";
}

function pickEntry(textFiles: Record<string, string>): string | null {
  const keys = Object.keys(textFiles);
  const isModule = (key: string) => MODULE_EXT.includes(extname(key));

  // A file that mounts the app is always the best entry — starting from `App`
  // instead would drop routers, stores and other providers set up there.
  const mounts = keys
    .filter((key) => isModule(key) && /createRoot\s*\(|ReactDOM\.render\s*\(|\.render\s*\(\s*</.test(textFiles[key]))
    .sort((a, b) => a.split("/").length - b.split("/").length || a.length - b.length);
  if (mounts.length > 0) return mounts[0];

  const named = ["main", "index", "app", "App"];
  for (const dir of ["src/", "", "app/"]) {
    for (const base of named) {
      for (const ext of MODULE_EXT) {
        if (textFiles[`${dir}${base}${ext}`]) return `${dir}${base}${ext}`;
      }
    }
  }

  return keys.find((key) => /\.(jsx|tsx)$/i.test(key)) || null;
}

/*
 * Everything below runs inside the sandboxed preview iframe. It is serialized
 * with Function.prototype.toString(), so it must stay entirely self-contained:
 * no imports, no references to module scope.
 */
function previewLoader() {
  const w = window as any;
  const FILES: Record<string, string> = w.__FILES__;
  const IMAGES: Record<string, string> = w.__IMAGES__;
  const ENTRY: string = w.__ENTRY__;
  const TAILWIND: number = w.__TAILWIND__;
  const MODULE_EXT = [".jsx", ".tsx", ".js", ".ts", ".mjs", ".cjs"];

  const errBox = document.getElementById("__err") as HTMLElement;
  let failed = false;

  function showErr(message: string) {
    failed = true;
    errBox.textContent = message;
    errBox.style.display = "block";
    console.error(message);
  }

  w.addEventListener("error", (event: any) => {
    if (!failed) showErr("Runtime error: " + (event.message || String(event.error || "unknown")));
  });
  w.addEventListener("unhandledrejection", (event: any) => {
    const reason = event.reason;
    if (!failed) showErr("Unhandled rejection: " + ((reason && reason.message) || String(reason)));
  });

  function extOf(path: string) {
    const index = path.lastIndexOf(".");
    return index >= 0 ? path.slice(index).toLowerCase() : "";
  }

  function normalize(path: string) {
    const out: string[] = [];
    const parts = path.split("/");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === "..") out.pop();
      else if (part !== "." && part !== "") out.push(part);
    }
    return out.join("/");
  }

  function findFile(path: string): string | null {
    if (FILES[path] !== undefined || IMAGES[path] !== undefined) return path;
    for (let i = 0; i < MODULE_EXT.length; i++) {
      if (FILES[path + MODULE_EXT[i]] !== undefined) return path + MODULE_EXT[i];
    }
    for (let i = 0; i < MODULE_EXT.length; i++) {
      if (FILES[path + "/index" + MODULE_EXT[i]] !== undefined) return path + "/index" + MODULE_EXT[i];
    }
    return null;
  }

  /** Turns an import specifier into a project-relative path. */
  function resolveSpec(spec: string, fromFile: string) {
    if (spec.charAt(0) === ".") {
      const slash = fromFile.lastIndexOf("/");
      const dir = slash >= 0 ? fromFile.slice(0, slash) : "";
      return normalize((dir ? dir + "/" : "") + spec);
    }
    if (spec.charAt(0) === "/") {
      // Vite/CRA serve `public/` at the site root, so `/logo.png` lives there.
      const bare = normalize(spec);
      if (findFile("public/" + bare)) return "public/" + bare;
      return bare;
    }
    return normalize(spec);
  }

  const injectedCss: Record<string, boolean> = {};

  function injectCss(path: string, css: string) {
    if (injectedCss[path]) return;
    injectedCss[path] = true;

    // Tailwind syntax is inert as plain CSS — the browser build compiles it
    // only from a text/tailwindcss block. v3's CDN already ships base and
    // utilities, so its @tailwind directives are dropped; v4's build needs
    // the `@import "tailwindcss"` line kept so it knows what to generate.
    const hasTailwindSyntax = /@tailwind\b|@apply\b|@import\s+["']tailwindcss|@theme\b|@plugin\s+["']|@variant\b/.test(css);
    const asTailwind = TAILWIND > 0 && hasTailwindSyntax;
    const cleaned =
      TAILWIND === 3
        ? css.replace(/@tailwind[^;]*;/g, "")
        : TAILWIND === 4
          ? css
          : css.replace(/@tailwind[^;]*;/g, "").replace(/@import\s+["']tailwindcss[^"']*["']\s*;?/g, "");

    if (!cleaned.trim()) return;
    const style = document.createElement("style");
    if (asTailwind) style.setAttribute("type", "text/tailwindcss");
    style.textContent = cleaned;
    document.head.appendChild(style);
  }

  /** Non-JS imports are wrapped so Babel never sees CSS/JSON/SVG source. */
  function assetSource(found: string) {
    const ext = extOf(found);
    if (ext === ".css") {
      injectCss(found, FILES[found] || "");
      if (/\.module\.css$/i.test(found)) {
        // CSS-module class names are not hashed here, so echoing the key back
        // matches the class names in the injected stylesheet.
        return "export default new Proxy({}, { get: function (_, k) { return typeof k === 'string' ? k : undefined; } });";
      }
      return "export default {};";
    }
    if (ext === ".json") {
      try {
        JSON.parse(FILES[found]);
        return "export default " + FILES[found] + ";";
      } catch {
        return "export default {};";
      }
    }
    if (ext === ".svg") {
      const url = "data:image/svg+xml," + encodeURIComponent(FILES[found] || "");
      return (
        "export default " + JSON.stringify(url) + ";\n" +
        "export function ReactComponent() { return null; }"
      );
    }
    if (IMAGES[found] !== undefined) return "export default " + JSON.stringify(IMAGES[found]) + ";";
    return "export default " + JSON.stringify(found) + ";";
  }

  /** Last-ditch match on file name alone, for assets whose folder did not
   * survive the upload (a Vite scaffold's `/vite.svg` is the usual case). */
  function findByBasename(path: string) {
    const base = path.slice(path.lastIndexOf("/") + 1);
    if (!base) return null;
    const keys = Object.keys(FILES).concat(Object.keys(IMAGES));
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].slice(keys[i].lastIndexOf("/") + 1) === base) return keys[i];
    }
    return null;
  }

  const blobCache: Record<string, string> = {};
  const loading: Record<string, boolean> = {};

  async function loadModule(path: string, importChain: string[]): Promise<string> {
    if (blobCache[path]) return blobCache[path];

    const ext = extOf(path);
    const assetLike = !!ext && MODULE_EXT.indexOf(ext) === -1;
    const found = findFile(path) || (assetLike ? findByBasename(path) : null);

    if (!found) {
      // A missing image or stylesheet must not blank out the whole preview,
      // so stub it and let the rest of the app render.
      if (!assetLike) throw new Error("Cannot resolve module: " + path);
      console.warn("Preview: no file matches " + path + " — using a placeholder.");
      const stub = ext === ".css" ? "export default {};" : "export default " + JSON.stringify(path) + ";";
      blobCache[path] = URL.createObjectURL(new Blob([stub], { type: "application/javascript" }));
      return blobCache[path];
    }

    if (blobCache[found]) return blobCache[found];
    if (loading[found]) {
      throw new Error("Circular import: " + importChain.concat(found).join(" -> "));
    }
    loading[found] = true;

    try {
      if (MODULE_EXT.indexOf(extOf(found)) === -1) {
        const url = URL.createObjectURL(new Blob([assetSource(found)], { type: "application/javascript" }));
        blobCache[found] = url;
        return url;
      }

      let code = FILES[found];

      // Side-effect stylesheet imports (`import './index.css'`) have no
      // binding, so inject the CSS and drop the statement.
      code = code.replace(/import\s+["']([^"']+\.css)["']\s*;?/g, function (_match, spec) {
        const target = findFile(resolveSpec(spec, found));
        if (target) injectCss(target, FILES[target] || "");
        return "";
      });

      const localSpecs: string[] = [];
      const scanner = /(?:from\s*|import\s*\(\s*|import\s+)(["'])([^"']+)\1/g;
      let match: RegExpExecArray | null;
      while ((match = scanner.exec(code)) !== null) {
        const spec = match[2];
        const isLocal = spec.charAt(0) === "." || spec.charAt(0) === "/" || spec.indexOf("src/") === 0;
        if (isLocal && localSpecs.indexOf(spec) === -1) localSpecs.push(spec);
      }

      for (let i = 0; i < localSpecs.length; i++) {
        const spec = localSpecs[i];
        const url = await loadModule(resolveSpec(spec, found), importChain.concat(found));
        code = code.split('"' + spec + '"').join('"' + url + '"');
        code = code.split("'" + spec + "'").join("'" + url + "'");
      }

      // Remaining bare specifiers come from npm. `?external=react,react-dom`
      // keeps esm.sh from bundling a second copy of React, which otherwise
      // breaks every hook with "invalid hook call".
      code = code.replace(
        /(from\s*|import\s*\(\s*|import\s+)(["'])(@?[a-zA-Z][^"']*)\2/g,
        function (full, prefix, quote, spec) {
          if (spec === "react" || spec === "react-dom") return full;
          if (spec.indexOf("react/") === 0 || spec.indexOf("react-dom/") === 0) return full;
          if (spec.indexOf("blob:") === 0 || spec.indexOf("http") === 0 || spec.indexOf("data:") === 0) return full;
          return prefix + quote + "https://esm.sh/" + spec + "?external=react,react-dom" + quote;
        },
      );

      const presets: any[] = [["react", { runtime: "automatic" }]];
      if (/\.tsx?$/i.test(found)) presets.push(["typescript", { isTSX: true, allExtensions: true }]);

      let transformed: string;
      try {
        transformed = w.Babel.transform(code, { presets, filename: found, sourceType: "module" }).code;
      } catch (err: any) {
        throw new Error("Could not compile " + found + ": " + (err && err.message ? err.message : String(err)));
      }

      const url = URL.createObjectURL(new Blob([transformed], { type: "application/javascript" }));
      blobCache[found] = url;
      return url;
    } finally {
      loading[found] = false;
    }
  }

  (async function () {
    try {
      const url = await loadModule(ENTRY, []);
      const entryCode = FILES[ENTRY] || "";
      const mountsItself = /createRoot\s*\(|ReactDOM\.render\s*\(/.test(entryCode);

      // Entries that only export a component get a generated bootstrap module.
      // Its `react` imports resolve through the document import map, so the
      // preview never ends up with a second copy of React.
      const target = mountsItself
        ? url
        : URL.createObjectURL(
            new Blob(
              [
                'import Component from ' + JSON.stringify(url) + ';\n' +
                'import React from "react";\n' +
                'import { createRoot } from "react-dom/client";\n' +
                'if (!Component) throw new Error(' + JSON.stringify(ENTRY) + ' + " has no default export to render.");\n' +
                'createRoot(document.getElementById("root")).render(React.createElement(Component));\n',
              ],
              { type: "application/javascript" },
            ),
          );

      // Specifier is a variable so the outer app's bundler leaves it alone
      // when this function is serialized into the preview document.
      await import(/* @vite-ignore */ target);

      // A silently blank pane is the least debuggable outcome there is.
      setTimeout(function () {
        const root = document.getElementById("root");
        if (failed || !root) return;
        if (root.children.length === 0 && !(root.textContent || "").trim()) {
          showErr(
            "The preview loaded but nothing was rendered into #root.\n" +
            "Check that " + ENTRY + " mounts a component, and look for errors above.",
          );
        }
      }, 1500);
    } catch (err: any) {
      showErr(
        "Preview error: " + (err && err.message ? err.message : String(err)) +
        (err && err.stack ? "\n\n" + err.stack : ""),
      );
    }
  })();
}

/**
 * The preview iframe runs on an opaque origin (sandboxed without
 * allow-same-origin, which would hand the page our own origin), so touching
 * `localStorage` throws. Plenty of student projects persist state there, and
 * the thrown SecurityError takes the whole app down before it paints — so
 * swap in an in-memory store when the real one is unreachable.
 */
const STORAGE_SHIM = `<script>
(function () {
  function memoryStore() {
    var entries = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(entries, String(k)) ? entries[String(k)] : null; },
      setItem: function (k, v) { entries[String(k)] = String(v); },
      removeItem: function (k) { delete entries[String(k)]; },
      clear: function () { entries = {}; },
      key: function (i) { var keys = Object.keys(entries); return i < keys.length ? keys[i] : null; },
      get length() { return Object.keys(entries).length; }
    };
  }
  ["localStorage", "sessionStorage"].forEach(function (name) {
    try {
      window[name].setItem("__probe__", "1");
      window[name].removeItem("__probe__");
    } catch (err) {
      try { Object.defineProperty(window, name, { value: memoryStore(), configurable: true }); } catch (ignored) {}
    }
  });
})();
<\/script>`;

/**
 * Builds a self-contained HTML document that compiles and mounts a React
 * submission in the browser. Returns null when the files are not a React app.
 */
export function buildReactPreviewDocument(files: CodeFile[]): string | null {
  if (!hasReactApp(files)) return null;

  const prefix = wrapperPrefix(files.map((f) => f.filename));
  const textFiles: Record<string, string> = {};
  const imageFiles: Record<string, string> = {};
  for (const file of files) {
    const key = prefix && file.filename.startsWith(prefix) ? file.filename.slice(prefix.length) : file.filename;
    if (file.language === "image" || file.language === "pdf") imageFiles[key] = file.content;
    else textFiles[key] = file.content;
  }

  const entry = pickEntry(textFiles);
  if (!entry) return null;

  const tailwind = tailwindVersion(files);
  const encode = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${STORAGE_SHIM}
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18.3.1",
    "react-dom": "https://esm.sh/react-dom@18.3.1?external=react",
    "react-dom/client": "https://esm.sh/react-dom@18.3.1/client?external=react",
    "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
    "react/jsx-dev-runtime": "https://esm.sh/react@18.3.1/jsx-dev-runtime"
  }
}
</script>
<script src="https://unpkg.com/@babel/standalone@7.26.2/babel.min.js"></script>
${tailwindScript(tailwind)}
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; background: #fff; color: #111; }
#root { min-height: 100vh; }
#__err { display: none; color: #b42318; background: #fef3f2; border: 1px solid #fda29b; padding: 16px; margin: 16px; border-radius: 8px; font-family: ui-monospace, monospace; font-size: 12px; white-space: pre-wrap; overflow-x: auto; }
</style>
</head>
<body>
<pre id="__err"></pre>
<div id="root"></div>
<script>
window.__FILES__ = ${encode(textFiles)};
window.__IMAGES__ = ${encode(imageFiles)};
window.__ENTRY__ = ${encode(entry)};
window.__TAILWIND__ = ${tailwind};
</script>
<script>(${previewLoader.toString()})();<\/script>
</body>
</html>`;
}

/** True when an HTML file is only a mount point for a JS bundle, so previewing
 * it on its own would show a blank page. */
export function isAppShell(html: string) {
  return /<div[^>]*id=["']root["']/i.test(html) || /<script[^>]*type=["']module["']/i.test(html);
}

/**
 * Inlines a plain HTML/CSS/JS submission into one document. Linked assets are
 * resolved against the submission's own files, since nothing in a sandboxed
 * iframe can fetch them over the network.
 */
export function buildPreviewDocument(files: CodeFile[], htmlFile: CodeFile): string {
  const dir = htmlFile.filename.includes("/")
    ? htmlFile.filename.slice(0, htmlFile.filename.lastIndexOf("/") + 1)
    : "";
  const byName = new Map(files.map((file) => [file.filename, file]));

  const isRemote = (ref: string) => /^(https?:)?\/\//i.test(ref) || ref.startsWith("data:");

  function resolveRef(ref: string) {
    const clean = ref.split("?")[0].split("#")[0];
    if (!clean || isRemote(clean)) return null;
    const candidates = [
      normalizePath(dir + clean),
      normalizePath(clean.replace(/^\/+/, "")),
      normalizePath(`${dir}public/${clean.replace(/^\/+/, "")}`),
    ];
    for (const candidate of candidates) {
      const found = byName.get(candidate);
      if (found) return found;
    }
    return null;
  }

  const asDataUri = (file: CodeFile) =>
    file.language === "image" || file.language === "pdf"
      ? file.content
      : `data:image/svg+xml,${encodeURIComponent(file.content)}`;

  let html = htmlFile.content;
  let inlinedStyles = 0;
  let inlinedScripts = 0;

  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/stylesheet/i.test(tag)) return tag;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) return tag;
    const file = resolveRef(href);
    if (!file) return isRemote(href) ? tag : "";
    inlinedStyles += 1;
    return `<style>${file.content}</style>`;
  });

  html = html.replace(/<script\b([^>]*)>\s*<\/script>/gi, (tag, attrs: string) => {
    const src = attrs.match(/src\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src) return tag;
    const file = resolveRef(src);
    if (!file) return isRemote(src) ? tag : "";
    inlinedScripts += 1;
    const type = /type\s*=\s*["']module["']/i.test(attrs) ? ' type="module"' : "";
    return `<script${type}>${file.content.replace(/<\/script>/gi, "<\\/script>")}</script>`;
  });

  html = html.replace(/(<(?:img|source)\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi, (full, pre, quote, src) => {
    const file = resolveRef(src);
    if (!file) return full;
    if (file.language !== "image" && !file.filename.toLowerCase().endsWith(".svg")) return full;
    return `${pre}${quote}${asDataUri(file)}${quote}`;
  });

  html = html.includes("<head>")
    ? html.replace("<head>", `<head>${STORAGE_SHIM}`)
    : `${STORAGE_SHIM}${html}`;

  // Fall back to the old behaviour for pages that never linked their assets.
  if (inlinedStyles === 0) {
    const css = files
      .filter((f) => f.filename.toLowerCase().endsWith(".css") && f.filename.startsWith(dir))
      .map((f) => `<style>${f.content}</style>`)
      .join("\n");
    html = html.includes("</head>") ? html.replace("</head>", `${css}</head>`) : `${css}${html}`;
  }
  if (inlinedScripts === 0) {
    const js = files
      .filter((f) => f.filename.toLowerCase().endsWith(".js") && f.filename.startsWith(dir))
      .map((f) => `<script>${f.content.replace(/<\/script>/gi, "<\\/script>")}</script>`)
      .join("\n");
    html = html.includes("</body>") ? html.replace("</body>", `${js}</body>`) : `${html}${js}`;
  }

  return html;
}
