export type WorkspaceDocument = {
  id: string;
  title: string;
  project: string;
  tags: string[];
  status: "draft" | "active" | "done";
  nextStep: string;
  createdAt: string;
  updatedAt: string;
  sourceUrl?: string;
  sourceUpdatedAt?: string;
};
export type WorkspaceRevision = { at: string; snapshot: unknown };

export const LIVE_DEMO_ID = "td_live_diagram_demo_v1";

export const WORKSPACE_KEY = "whiteboard-studio-workspace/v1";
export const revisionKey = (id: string) => `${WORKSPACE_KEY}/revisions/${id}`;
export const pendingKey = (id: string) => `${WORKSPACE_KEY}/pending/${id}`;

export function readDocuments(): WorkspaceDocument[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? "[]");
  } catch {
    return [];
  } // unreadable or corrupt local cache: treat as empty, the server list repopulates it
}

export function safeSetLocalStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    // Realtime room state is authoritative. Mobile Safari can have a very small
    // localStorage quota, especially when snapshots contain embedded images.
    console.warn(`Local backup skipped for ${key}:`, error);
    return false;
  }
}

export function writeDocuments(documents: WorkspaceDocument[]) {
  safeSetLocalStorage(WORKSPACE_KEY, JSON.stringify(documents));
}

export function syncSharedDocument(document: WorkspaceDocument) {
  return fetch("/api/workspace", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(document),
    keepalive: true,
  }).then((response) => {
    if (!response.ok) throw new Error(`Workspace sync failed: ${response.status}`);
  });
}

export function deleteSharedDocument(id: string) {
  return fetch(`/api/workspace?id=${encodeURIComponent(id)}`, { method: "DELETE", keepalive: true }).then((response) => {
    if (!response.ok) throw new Error(`Workspace delete failed: ${response.status}`);
  });
}

export function newDocument(title = "New diagram"): WorkspaceDocument {
  const now = new Date().toISOString();
  return {
    id: `td_${Date.now().toString(36)}${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`,
    title,
    project: "No project",
    tags: [],
    status: "draft",
    nextStep: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function documentPath(id: string) {
  return `/d/${encodeURIComponent(id)}`;
}

export function documentOnlySnapshot(snapshot: unknown): unknown {
  if (snapshot && typeof snapshot === "object" && "document" in snapshot) {
    return { document: (snapshot as { document: unknown }).document };
  }
  return snapshot;
}

export function mergeWorkspaceDocuments(agentDocuments: WorkspaceDocument[], sharedDocuments: WorkspaceDocument[], browserDocuments: WorkspaceDocument[], currentId: string): WorkspaceDocument[] {
  const byId = new Map([...agentDocuments, ...sharedDocuments].map((document) => [document.id, document]));
  for (const document of browserDocuments) {
    const agent = byId.get(document.id);
    const merged = agent && agent.updatedAt > document.updatedAt ? { ...document, ...agent } : { ...agent, ...document };
    byId.set(document.id, agent?.sourceUrl ? { ...merged, sourceUpdatedAt: agent.updatedAt } : merged);
  }
  for (const [id, document] of byId) {
    if (document.sourceUrl && !document.sourceUpdatedAt) byId.set(id, { ...document, sourceUpdatedAt: document.updatedAt });
  }
  if (currentId && !byId.has(currentId)) byId.set(currentId, { ...newDocument(currentId === LIVE_DEMO_ID ? "Live diagram · User → Agent → Service → Response" : "Untitled"), id: currentId });
  return [...byId.values()];
}

type DocumentPusherDeps = {
  remoteUpdatedAt: Map<string, string>;
  putsInFlight: Map<string, string>;
  getDocuments: () => WorkspaceDocument[];
  send: (document: WorkspaceDocument) => Promise<unknown>;
};

// Per-document PUT scheduling: skips versions the server already has, allows one write in flight,
// and re-pushes once when a newer version was committed while a write was running.
export function createDocumentPusher({ remoteUpdatedAt, putsInFlight, getDocuments, send }: DocumentPusherDeps) {
  const pushDocument = (document: WorkspaceDocument): Promise<void> => {
    const known = remoteUpdatedAt.get(document.id);
    if (known !== undefined && document.updatedAt <= known) return Promise.resolve();
    if (putsInFlight.has(document.id)) return Promise.resolve();
    const sent = document.updatedAt;
    putsInFlight.set(document.id, sent);
    return send(document).then(
      () => {
        putsInFlight.delete(document.id);
        const current = remoteUpdatedAt.get(document.id);
        if (current === undefined || sent > current) remoteUpdatedAt.set(document.id, sent);
        const latest = getDocuments().find((item) => item.id === document.id);
        if (latest && latest.updatedAt > sent) void pushDocument(latest).catch(() => undefined); // best-effort follow-up: the next committed change or poll retries, so a send failure is intentionally swallowed
      },
      (error) => {
        putsInFlight.delete(document.id);
        throw error;
      },
    );
  };
  return pushDocument;
}

// A poll is complete only when every source was retrieved (null = retrieval failed, not an empty list).
export async function retrieveWorkspaceSources(fetchImpl: typeof fetch) {
  const [agentResult, sharedResult] = await Promise.all([
    fetchImpl("/workspace/index.json", { cache: "no-store" }).then((response) => (response.ok ? (response.json() as Promise<WorkspaceDocument[]>) : null)),
    fetchImpl("/api/workspace", { cache: "no-store" }).then((response) => (response.ok ? (response.json() as Promise<WorkspaceDocument[]>) : null)),
  ]);
  return { agentResult, sharedResult, complete: agentResult !== null && sharedResult !== null };
}

// Committed-state persistence decision: no PUT unless the last poll was complete.
export function pushCommittedDocuments(documents: WorkspaceDocument[], reconcileComplete: boolean, push: (document: WorkspaceDocument) => Promise<void>) {
  for (const document of documents) {
    if (!reconcileComplete) break;
    void push(document).catch(() => undefined); // send failure is intentional: the document stays in local state and the next committed push retries
  }
}
