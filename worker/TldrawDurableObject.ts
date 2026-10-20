import { DurableObjectSqliteSyncWrapper, type SessionStateSnapshot, SQLiteSyncStorage, TLSocketRoom } from "@tldraw/sync-core";
import { createTLSchema, defaultShapeSchemas, type TLRecord } from "@tldraw/tlschema";
import { T } from "@tldraw/validate";
import { isWorkspaceId } from "../app/io/workspace-id.mjs";
import { liveFrameMigrations, liveFrameProps } from "../app/live-diagram-schema";

const boxProps = {
  w: T.number,
  h: T.number,
};

// Keep this schema aligned with the custom ShapeUtils in app/whiteboard-studio.tsx.
const schema = createTLSchema({
  shapes: {
    ...defaultShapeSchemas,
    "live-frame": { props: liveFrameProps, migrations: liveFrameMigrations },
    "clean-box": { props: { ...boxProps, label: T.string, color: T.string } },
    "lab-card": {
      props: { ...boxProps, eyebrow: T.string, title: T.string, body: T.string, tone: T.string },
    },
    "service-card": {
      props: {
        ...boxProps,
        name: T.string,
        technology: T.string,
        owner: T.string,
        status: T.string,
      },
    },
    "diagram-asset": { props: { ...boxProps, kind: T.string, label: T.string } },
    spreadsheet: {
      props: { ...boxProps, title: T.string, workbook: T.string, previewZoom: T.optional(T.number) },
    },
  },
});

interface SocketAttachment {
  sessionId: string;
  snapshot: SessionStateSnapshot | null;
}

/** One durable, SQLite-backed realtime room per whiteboard ID. */
export class TldrawDurableObject {
  private room: TLSocketRoom<TLRecord, void> | null = null;
  private readonly sockets = new Map<string, WebSocket>();

  constructor(private readonly ctx: DurableObjectState) {
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  private getRoom() {
    if (!this.room) {
      const storage = new SQLiteSyncStorage<TLRecord>({
        sql: new DurableObjectSqliteSyncWrapper(this.ctx.storage),
      });
      this.room = new TLSocketRoom<TLRecord, void>({
        schema,
        storage,
        clientTimeout: Infinity,
        onSessionSnapshot: (sessionId, snapshot) => {
          this.sockets.get(sessionId)?.serializeAttachment({ sessionId, snapshot });
        },
      });

      for (const socket of this.ctx.getWebSockets()) {
        const attachment = socket.deserializeAttachment() as SocketAttachment | null;
        if (attachment?.sessionId && attachment.snapshot) {
          this.sockets.set(attachment.sessionId, socket);
          this.room.handleSocketResume({
            sessionId: attachment.sessionId,
            socket,
            snapshot: attachment.snapshot,
          });
        }
      }
    }
    return this.room;
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/workspace") return this.handleWorkspaceIndex(request);
    if (url.pathname.startsWith("/api/lab/snapshot/")) {
      const room = this.getRoom();
      // `?clock=1` lets the exporter poll cheaply and fetch the full snapshot only on change.
      const clockOnly = url.searchParams.get("clock") === "1";
      return Response.json(
        { roomId: decodeURIComponent(url.pathname.split("/").pop() ?? "").replace(/\.json$/, ""), clock: room.getCurrentDocumentClock(), snapshot: clockOnly ? null : room.getCurrentSnapshot() },
        { headers: { "cache-control": "no-store" } },
      );
    }
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return new Response("Missing sessionId", { status: 400 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ sessionId, snapshot: null } satisfies SocketAttachment);
    this.sockets.set(sessionId, server);
    this.getRoom().handleSocketConnect({ sessionId, socket: server });
    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleWorkspaceIndex(request: Request) {
    const url = new URL(request.url);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS workspace_documents (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    if (request.method === "GET") {
      const documents = [...this.ctx.storage.sql.exec<{ data: string }>("SELECT data FROM workspace_documents ORDER BY updated_at DESC")].flatMap((row) => {
        try {
          return [JSON.parse(row.data)];
        } catch {
          return [];
        }
      });
      return Response.json(documents, { headers: { "cache-control": "no-store" } });
    }
    if (request.method === "PUT" || request.method === "POST") {
      const document = (await request.json()) as { id?: unknown; updatedAt?: unknown };
      if (typeof document.id !== "string" || !isWorkspaceId(document.id) || typeof document.updatedAt !== "string") {
        return Response.json({ error: "Invalid workspace document" }, { status: 400 });
      }
      this.ctx.storage.sql.exec(
        "INSERT INTO workspace_documents (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        document.id,
        JSON.stringify(document),
        document.updatedAt,
      );
      return Response.json(document);
    }
    if (request.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!isWorkspaceId(id)) return Response.json({ error: "Invalid workspace id" }, { status: 400 });
      this.ctx.storage.sql.exec("DELETE FROM workspace_documents WHERE id = ?", id);
      return new Response(null, { status: 204 });
    }
    return new Response("Method not allowed", { status: 405 });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const sessionId = this.getSessionId(socket);
    if (sessionId) this.getRoom().handleSocketMessage(sessionId, message);
  }

  webSocketClose(socket: WebSocket) {
    this.endSocket(socket, "handleSocketClose");
  }

  webSocketError(socket: WebSocket) {
    this.endSocket(socket, "handleSocketError");
  }

  private getSessionId(socket: WebSocket) {
    return (socket.deserializeAttachment() as SocketAttachment | null)?.sessionId ?? null;
  }

  private endSocket(socket: WebSocket, method: "handleSocketClose" | "handleSocketError") {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.sessionId) return;
    this.sockets.delete(attachment.sessionId);
    const room = this.getRoom();
    if (attachment.snapshot && !room.getSessionSnapshot(attachment.sessionId)) {
      room.handleSocketResume({ sessionId: attachment.sessionId, socket, snapshot: attachment.snapshot });
    }
    room[method](attachment.sessionId);
  }
}
