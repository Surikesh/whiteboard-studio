import vinext from "vinext";
import { defineConfig, type UserConfig } from "vite";
import { ensureDataDirs, labPaths } from "./scripts/lib/lab-config.mjs";
import { migrateData } from "./scripts/lib/migrate-data.mjs";
import { labStoragePlugin } from "./scripts/lab-storage-plugin.mjs";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  durable_objects: {
    bindings: [{ name: "TLDRAW_DURABLE_OBJECT", class_name: "TldrawDurableObject" }],
  },
  migrations: [{ tag: "v1", new_sqlite_classes: ["TldrawDurableObject"] }],
};

export default defineConfig(async ({ command }): Promise<UserConfig> => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Durable data lives outside the checkout (see scripts/lib/lab-config.mjs).
  // Miniflare writes the Durable Object SQLite files under
  // <state>/v3/do/tldraw-lab-TldrawDurableObject/*.sqlite.
  // Directories and migration are only touched by the dev server, never by builds.
  const paths = labPaths();
  if (command === "serve") {
    ensureDataDirs(paths);
    migrateData({ projectDir: process.cwd(), paths });
  }

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      // Quick Tunnel hostnames are generated dynamically on every launch.
      allowedHosts: true,
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    resolve: {
      // tldraw state relies on object identity; force client and sync packages to
      // share one copy when Vite optimizes the vinext and Worker graphs.
      dedupe: ["tldraw", "@tldraw/editor", "@tldraw/state", "@tldraw/state-react", "@tldraw/store", "@tldraw/tlschema", "@tldraw/utils", "@tldraw/validate"],
    },
    // The Worker graph (rsc + ssr) pre-bundled only @tldraw/validate, inlining a second copy of @tldraw/utils next to the
    // unbundled @tldraw/sync-core and @tldraw/tlschema; tldraw then warned about multiple library instances at startup.
    // Pre-bundling the whole sync stack together makes the optimizer share one @tldraw/utils chunk.
    environments: Object.fromEntries(
      ["rsc", "ssr"].map((name) => [name, { optimizeDeps: { include: ["@tldraw/sync-core", "@tldraw/tlschema", "@tldraw/validate", "@tldraw/utils", "@tldraw/store", "@tldraw/state"] } }]),
    ),
    plugins: [
      vinext(),
      labStoragePlugin({ projectDir: process.cwd() }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
        persistState: { path: paths.state },
      }),
    ],
  };
});
