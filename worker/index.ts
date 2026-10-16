/** Cloudflare Worker entry point: routes workspace and room requests to the Durable Object, everything else to vinext. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  TLDRAW_DURABLE_OBJECT: DurableObjectNamespace;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

import { isWorkspaceId } from "../app/io/workspace-id.mjs";

export { TldrawDurableObject } from "./TldrawDurableObject";

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/workspace") {
      const workspace = env.TLDRAW_DURABLE_OBJECT.get(env.TLDRAW_DURABLE_OBJECT.idFromName("__workspace-index__"));
      return workspace.fetch(request);
    }

    const snapshotMatch = url.pathname.match(/^\/api\/lab\/snapshot\/([^/.]+)(?:\.json)?$/);
    if (snapshotMatch) {
      // Local-only: anything that came through a Cloudflare tunnel is refused.
      // Inside the worker, Miniflare stamps loopback clients with CF-Connecting-IP
      // (miniflare 4.20260515.0, node_modules/miniflare/dist/src/workers/core/entry.worker.js:4435), so only
      // a non-loopback value (set by Cloudflare's edge) marks a tunnelled request.
      const clientIp = request.headers.get("cf-connecting-ip");
      if (clientIp && !/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1|localhost)$/.test(clientIp.trim())) return new Response("Forbidden", { status: 403 });
      const roomId = decodeURIComponent(snapshotMatch[1]);
      if (!isWorkspaceId(roomId)) return Response.json({ error: "Invalid room id" }, { status: 400 });
      const room = env.TLDRAW_DURABLE_OBJECT.get(env.TLDRAW_DURABLE_OBJECT.idFromName(roomId));
      return room.fetch(request);
    }

    const roomMatch = url.pathname.match(/^\/api\/connect\/([^/]+)$/);
    if (roomMatch) {
      const roomId = decodeURIComponent(roomMatch[1]);
      const room = env.TLDRAW_DURABLE_OBJECT.get(env.TLDRAW_DURABLE_OBJECT.idFromName(roomId));
      return room.fetch(request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
