export type SavedComponentShape = { type: string; x: number; y: number; rotation: number; opacity: number; props: unknown; meta: unknown };
export type SavedComponent = { id: string; name: string; createdAt: string; shapes: SavedComponentShape[] };
export const COMPONENT_LIBRARY_KEY = "tldraw-workspace/component-library/v1";

export function readSavedComponents(): SavedComponent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(COMPONENT_LIBRARY_KEY) ?? "[]");
  } catch {
    return [];
  } // unreadable or corrupt local library: treat as empty
}
