export const ASSET_KINDS = [
  "person",
  "database",
  "server",
  "web-host",
  "cloud",
  "api",
  "queue",
  "brain",
  "switch",
  "form",
  "choice",
  "workflow",
  "metrics",
  "approval",
  "plan",
  "environment",
  "warning",
  "git-rebase",
  "docker",
  "kubernetes",
  "nginx",
  "redis",
  "elastic",
  "linux",
  "windows",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const FALLBACK_ASSET_KIND = "generic";

export function isAssetKind(kind: unknown): kind is AssetKind {
  return typeof kind === "string" && (ASSET_KINDS as readonly string[]).includes(kind);
}

/** Stored or spec kinds that are no longer in the catalog render as the neutral fallback. */
export function resolveAssetKind(kind: unknown): AssetKind | typeof FALLBACK_ASSET_KIND {
  return isAssetKind(kind) ? kind : FALLBACK_ASSET_KIND;
}
