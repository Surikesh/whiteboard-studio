import type { Editor } from "tldraw";

const THUMBNAIL_DB = "whiteboard-studio-workspace-thumbnails";
const THUMBNAIL_STORE = "thumbnails";

function openThumbnailDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(THUMBNAIL_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(THUMBNAIL_STORE)) request.result.createObjectStore(THUMBNAIL_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function writeThumbnail(id: string, svg: string): Promise<void> {
  const database = await openThumbnailDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(THUMBNAIL_STORE, "readwrite");
    transaction.objectStore(THUMBNAIL_STORE).put(svg, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function readThumbnails(ids: string[]): Promise<Record<string, string>> {
  const database = await openThumbnailDatabase();
  const entries = await Promise.all(
    ids.map(
      (id) =>
        new Promise<readonly [string, string] | null>((resolve) => {
          const request = database.transaction(THUMBNAIL_STORE, "readonly").objectStore(THUMBNAIL_STORE).get(id);
          request.onsuccess = () => resolve(typeof request.result === "string" ? [id, request.result] : null);
          request.onerror = () => resolve(null);
        }),
    ),
  );
  database.close();
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null));
}

export async function captureDocumentThumbnail(editor: Editor, id: string): Promise<string | null> {
  const shapes = editor.getCurrentPageShapes();
  if (!shapes.length) return null;
  const result = await editor.getSvgString(shapes, { background: false, padding: 24 });
  if (!result) return null;
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`;
  await writeThumbnail(id, src);
  return src;
}
