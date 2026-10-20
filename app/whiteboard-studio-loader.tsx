"use client";

import dynamic from "next/dynamic";

const WhiteboardStudio = dynamic(() => import("./whiteboard-studio").then((module) => module.WhiteboardStudio), {
  ssr: false,
  loading: () => (
    <main className="lab-loading">
      <span>WHITEBOARD STUDIO</span>
      <strong>Preparing the canvas…</strong>
    </main>
  ),
});

export function WhiteboardStudioLoader({ initialDocumentId }: { initialDocumentId?: string } = {}) {
  return <WhiteboardStudio initialDocumentId={initialDocumentId} />;
}
