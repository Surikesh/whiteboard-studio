import type { TLShape } from "tldraw";

export const CARD_TYPE = "lab-card";
export const CLEAN_BOX_TYPE = "clean-box";
export const SERVICE_TYPE = "service-card";
export const ASSET_TYPE = "diagram-asset";
export const LEGACY_ONTOLOGY_TYPE = "ontology-node";

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [CLEAN_BOX_TYPE]: {
      w: number;
      h: number;
      label: string;
      color: "black" | "blue" | "green" | "red" | "violet" | "orange";
    };
    [CARD_TYPE]: {
      w: number;
      h: number;
      eyebrow: string;
      title: string;
      body: string;
      tone: "violet" | "mint" | "amber";
    };
    [SERVICE_TYPE]: {
      w: number;
      h: number;
      name: string;
      technology: string;
      owner: string;
      status: "healthy" | "warning" | "critical";
    };
    [ASSET_TYPE]: {
      w: number;
      h: number;
      kind: string;
      label: string;
    };
    [LEGACY_ONTOLOGY_TYPE]: {
      w: number;
      h: number;
      kind: string;
      label: string;
      properties: string;
    };
  }
}

export type CleanBoxShape = TLShape<typeof CLEAN_BOX_TYPE>;
export type LabCardShape = TLShape<typeof CARD_TYPE>;
export type ServiceShape = TLShape<typeof SERVICE_TYPE>;
export type AssetShape = TLShape<typeof ASSET_TYPE>;
export type LegacyOntologyShape = TLShape<typeof LEGACY_ONTOLOGY_TYPE>;
