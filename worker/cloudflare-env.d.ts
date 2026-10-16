// Minimal ambient declarations for the Cloudflare Workers runtime surface this
// project uses. The full @cloudflare/workers-types package is not used because
// it redefines DOM globals (for example Response.json() becomes `unknown`) and
// would break type checking of the browser code in the same program.
// Keep this file a global script: no top-level import or export.

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectId {
  toString(): string;
}

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
  // Other RPC methods on the stub are called through this index signature.
  [method: string]: unknown;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectStorage {
  transactionSync<T>(callback: () => T): T;
  sql: {
    exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): Iterable<T> & { toArray(): T[] };
  };
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): WebSocket[];
  setWebSocketAutoResponse(pair: WebSocketRequestResponsePair): void;
}

declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string);
}

declare class WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

interface WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

interface ResponseInit {
  webSocket?: WebSocket | null;
}

declare module "cloudflare:workers" {
  export const env: {
    [binding: string]: unknown;
  };
}
