import { WhiteboardStudioLoader } from "../../whiteboard-studio-loader";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WhiteboardStudioLoader initialDocumentId={id} />;
}
