"use client";

import dynamic from "next/dynamic";

const TldrawLab = dynamic(() => import("./tldraw-lab").then((module) => module.TldrawLab), {
  ssr: false,
  loading: () => (
    <main className="lab-loading">
      <span>TLDRAW LAB</span>
      <strong>Preparing the canvas…</strong>
    </main>
  ),
});

export function TldrawLabLoader({ initialDocumentId }: { initialDocumentId?: string } = {}) {
  return <TldrawLab initialDocumentId={initialDocumentId} />;
}
