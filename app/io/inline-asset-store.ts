import type { TLAssetStore } from "tldraw";

// Assets live inline in the room. The Durable Object's SQLite rejects rows over 2 MB, and a rejected
// write drops the whole sync session ("Something went wrong"), so large images are scaled down first.
export const MAX_INLINE_ASSET_CHARS = 1_500_000;

export function readAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Asset encoding returned no data")));
    reader.onerror = () => reject(reader.error ?? new Error("Asset encoding failed"));
    reader.readAsDataURL(blob);
  });
}

export async function inlineAssetSrc(file: File) {
  const src = await readAsDataUrl(file);
  if (src.length <= MAX_INLINE_ASSET_CHARS) return src;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("File is too large to store on the board");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const type = file.type === "image/png" ? "image/png" : "image/jpeg"; // PNG keeps transparency
  let scale = Math.sqrt(MAX_INLINE_ASSET_CHARS / src.length);
  for (let attempt = 0; attempt < 8; attempt++, scale *= 0.8) {
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const scaled = canvas.toDataURL(type, 0.9);
    if (scaled.length <= MAX_INLINE_ASSET_CHARS) return scaled;
  }
  throw new Error("Image is too large to store on the board");
}

export const inlineAssetStore: TLAssetStore = {
  async upload(_asset, file) {
    // Keep pasted and dropped images self-contained in the collaborative
    // document. The optional agent bridge is not present in a normal local
    // editor session, so routing uploads through it made images flash and
    // disappear after a 404 response.
    return { src: await inlineAssetSrc(file) };
  },
  resolve(asset) {
    return asset.props.src;
  },
};
