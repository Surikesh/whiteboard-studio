// Pure helpers for durable board storage: snapshot -> .tldr conversion,
// filename sanitizing and revision pruning decisions.
import path from "node:path";
import { WORKSPACE_ID_SOURCE, isWorkspaceId } from "../../app/io/workspace-id.mjs";

export const ASSET_PREFIX = "/api/agent/assets/";

const CONTENT_TYPES = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};
export function assetContentType(name) {
  return CONTENT_TYPES[path.extname(name).toLowerCase()] ?? "image/jpeg";
}

export function isSafeBasename(name) {
  return typeof name === "string" && name.length > 0 && name.length < 256 && name === path.basename(name) && !name.includes("\\") && !name.includes("\0") && name !== "." && name !== "..";
}

export function isBoardId(id) {
  return isWorkspaceId(id);
}

export function safeTitle(title) {
  const cleaned = String(title ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 80)
    .trim();
  return cleaned || "Untitled";
}

export function boardFileName(title, id) {
  return `${safeTitle(title)} (${id}).tldr`;
}

export function boardFileId(fileName) {
  return new RegExp(`\\((${WORKSPACE_ID_SOURCE})\\)\\.tldr$`).exec(fileName)?.[1] ?? null;
}

export function revisionFileName(date = new Date()) {
  return `${date.toISOString().replace(/:/g, "-")}.tldr`;
}

export function revisionFileTime(file) {
  const m = /^(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d(?:\.\d+)?Z)\.tldr$/.exec(file);
  return m ? new Date(`${m[1]}:${m[2]}:${m[3]}`) : null;
}

/** Self-contained tldraw file (same shape as tldraw's serializeTldrawJson). */
export function snapshotToTldr(snapshot, readAsset = () => null) {
  const records = snapshot.documents
    .map((d) => d.state)
    .map((record) => {
      if (record?.typeName !== "asset" || typeof record.props?.src !== "string" || !record.props.src.startsWith(ASSET_PREFIX)) return record;
      const name = decodeURIComponent(record.props.src.slice(ASSET_PREFIX.length).split("?")[0]);
      if (!isSafeBasename(name)) return record;
      const data = readAsset(name);
      if (!data) return record;
      return { ...record, props: { ...record.props, src: `data:${assetContentType(name)};base64,${Buffer.from(data).toString("base64")}` } };
    });
  return { tldrawFileFormatVersion: 1, schema: snapshot.schema, records };
}

/** Files (newest-first list of names) to delete so only `max` newest remain. */
export function revisionsToPrune(files, max) {
  const sorted = [...files]
    .filter((f) => revisionFileTime(f))
    .sort()
    .reverse();
  return sorted.slice(Math.max(0, max));
}

/** True when a new revision should be written for a changed board. */
export function shouldWriteRevision(files, now, intervalMinutes) {
  const newest = [...files]
    .map(revisionFileTime)
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  return !newest || now - newest >= intervalMinutes * 60_000;
}
