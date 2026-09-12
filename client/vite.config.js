import { defineConfig } from "vite";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const xpellUiRoot = dirname(require.resolve("@xpell/ui/package.json"));

export default defineConfig({
  base: "/public/",
  server: {
    proxy: {
      "/__xnode_bootstrap": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (requestPath) => {
          const rewritten = requestPath.replace(/^\/__xnode_bootstrap/, "");
          return rewritten || "/";
        }
      },
      "/xauth": {
        target: "http://localhost:3000",
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      "@xpell/ui/xui.css": resolve(xpellUiRoot, "dist/ui.css")
    }
  },
  build: {
    outDir: resolve(__dirname, "../server/work/public"),
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, "index.html")
    },
    cssCodeSplit: false
  }
});
