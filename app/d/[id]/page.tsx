import { TldrawLabLoader } from "../../tldraw-lab-loader";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TldrawLabLoader initialDocumentId={id} />;
}
