// Editor source is split across app/tldraw-lab.tsx and app/domain/**, app/io/**, app/state/** and app/ui/**; source-text assertions read the union.
import { readFile, readdir } from "node:fs/promises";

const appRoot = new URL("../../app/", import.meta.url);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => (entry.isDirectory() ? walk(new URL(`${entry.name}/`, dir)) : [new URL(entry.name, dir)])));
  return nested.flat();
}

export async function readLabSource() {
  const files = [
    new URL("tldraw-lab.tsx", appRoot),
    ...[...(await walk(new URL("domain/", appRoot))), ...(await walk(new URL("io/", appRoot))), ...(await walk(new URL("state/", appRoot))), ...(await walk(new URL("ui/", appRoot)))].sort((a, b) =>
      a.href.localeCompare(b.href),
    ),
  ];
  return (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
}
