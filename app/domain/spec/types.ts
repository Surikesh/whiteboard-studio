import { editableTextBoxHeight } from "../shapes/text-height";

export type DiagramSpec = {
  format: "whiteboard-studio/v1";
  title?: string;
  intent?: string;
  focusQuestion?: string;
  diagramType?: "graph" | "concept-map" | "flowchart" | "sequence" | "state" | "architecture" | "hierarchy" | "causal" | "argument" | "comparison";
  sequence?: {
    participants: Array<{ id: string; label: string; icon?: string }>;
    messages: Array<{ from: string; to: string; label: string; dashed?: boolean }>;
  };
  table?: {
    columns: string[];
    rows: Array<{ label: string; values: string[] }>;
  };
  nodes: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    w?: number;
    h?: number;
    kind?: "box" | "note" | "text" | "service" | "asset" | "divider" | "decision" | "claim" | "evidence" | "outcome";
    assetKind?: string;
    color?: "black" | "grey" | "light-violet" | "violet" | "blue" | "light-blue" | "yellow" | "orange" | "green" | "light-green" | "red" | "light-red" | "white";
    technology?: string;
    owner?: string;
    status?: "healthy" | "warning" | "critical";
  }>;
  edges?: Array<{ from: string; to: string; label?: string; color?: DiagramSpec["nodes"][number]["color"]; relation?: "supports" | "opposes" | "positive" | "negative" | "yes" | "no" }>;
};

export function isDiagramSpec(value: unknown): value is DiagramSpec {
  if (!value || typeof value !== "object") return false;
  const spec = value as Partial<DiagramSpec>;
  if (spec.format !== "whiteboard-studio/v1" || !Array.isArray(spec.nodes)) return false;
  if (spec.diagramType !== "sequence") return true;
  return Boolean(spec.sequence && Array.isArray(spec.sequence.participants) && Array.isArray(spec.sequence.messages));
}

export function getSpecNodeSize(node: DiagramSpec["nodes"][number]) {
  const w = node.w ?? (node.kind === "service" ? 260 : node.kind === "asset" ? 180 : 240);
  return {
    w,
    h:
      node.kind === "service" || node.kind === "asset" || node.kind === "divider"
        ? (node.h ?? (node.kind === "service" ? 150 : node.kind === "asset" ? 190 : 120))
        : editableTextBoxHeight(node.label, w, node.h ?? 120),
  };
}
