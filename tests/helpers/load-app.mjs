// Bundles an app TSX/TS module with rolldown (already installed via vite) so node:test can import it.
// Third-party packages stay external; CSS imports become empty modules. No new dependencies.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rolldown } from "rolldown";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "node_modules/.cache/tldraw-lab-tests");

export async function loadAppModule(relativePath) {
  mkdirSync(outDir, { recursive: true });
  const file = `${path.basename(relativePath).replace(/\W+/g, "-")}-${process.pid}.mjs`;
  const bundle = await rolldown({
    input: path.join(root, relativePath),
    platform: "node",
    logLevel: "silent",
    external: (id) => !id.startsWith("@univerjs/") && !id.endsWith(".css") && !id.startsWith(".") && !id.startsWith("\0") && !path.isAbsolute(id),
    plugins: [
      {
        name: "empty-css",
        resolveId(id) {
          if (id.startsWith("@univerjs/")) return { id: "\0univer-stub" };
          return id.endsWith(".css") ? { id: "\0empty-css" } : null;
        },
        // The spreadsheet editor (Univer) needs a browser; the shape is not exercised here, so it is stubbed.
        load(id) {
          if (id === "\0univer-stub") return "const noop = () => ({}); export const createUniver = noop, LocaleType = {}, mergeLocales = noop, UniverSheetsCorePreset = noop; export default {};";
          return id === "\0empty-css" ? "export default {};" : null;
        },
      },
    ],
    transform: { jsx: { runtime: "automatic" } },
  });
  await bundle.write({ file: path.join(outDir, file), format: "esm" });
  await bundle.close();
  return import(pathToFileURL(path.join(outDir, file)).href);
}
