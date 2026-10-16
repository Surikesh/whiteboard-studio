// The one grammar for workspace (board) ids. Everything that mints or checks an id imports this:
// the browser (app/io), the Worker, the CLI and the storage scripts. No slashes, dots or spaces; length is capped.
// Shipped families: generated `td_<base36>` and named ones such as `td_demo_web_architecture`.
export const WORKSPACE_ID_MAX_LENGTH = 128;
export const WORKSPACE_ID_SOURCE = "td_[A-Za-z0-9_]+";

const WORKSPACE_ID = new RegExp(`^${WORKSPACE_ID_SOURCE}$`);

/** @param {unknown} id */
export function isWorkspaceId(id) {
  return typeof id === "string" && id.length <= WORKSPACE_ID_MAX_LENGTH && WORKSPACE_ID.test(id);
}
