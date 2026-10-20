import { isAssetKind, type AssetKind } from "./asset-kinds";

export type AssetCatalogEntry = { label: string; tone: string; group: string };
export const assetCatalog: Record<AssetKind, AssetCatalogEntry> = {
  person: { label: "User", tone: "coral", group: "People" },
  database: { label: "Database", tone: "blue", group: "Data" },
  server: { label: "Server", tone: "blue", group: "Infrastructure" },
  "web-host": { label: "Web Host", tone: "blue", group: "Infrastructure" },
  cloud: { label: "Cloud", tone: "violet", group: "Infrastructure" },
  api: { label: "API", tone: "mint", group: "Integrations" },
  queue: { label: "Queue", tone: "amber", group: "Data" },
  brain: { label: "AI / model", tone: "violet", group: "Integrations" },
  switch: { label: "Router", tone: "mint", group: "Infrastructure" },
  form: { label: "Form", tone: "blue", group: "Business" },
  choice: { label: "Choice", tone: "amber", group: "Processes" },
  workflow: { label: "Workflow", tone: "amber", group: "Processes" },
  metrics: { label: "Metrics", tone: "blue", group: "Business" },
  approval: { label: "Approval", tone: "mint", group: "Business" },
  plan: { label: "Structured plan", tone: "mint", group: "Business" },
  "git-rebase": { label: "Git", tone: "violet", group: "CI/CD" },
  docker: { label: "Docker", tone: "blue", group: "Technologies" },
  kubernetes: { label: "Kubernetes", tone: "blue", group: "Technologies" },
  nginx: { label: "Nginx", tone: "mint", group: "Technologies" },
  redis: { label: "Redis", tone: "coral", group: "Technologies" },
  elastic: { label: "Elastic", tone: "amber", group: "Technologies" },
  linux: { label: "Linux", tone: "amber", group: "Technologies" },
  windows: { label: "Windows", tone: "blue", group: "Technologies" },
  environment: { label: "Environment", tone: "mint", group: "Infrastructure" },
  warning: { label: "Gap / warning", tone: "coral", group: "Annotations" },
};

export const fallbackAsset: AssetCatalogEntry = { label: "Component", tone: "blue", group: "General" };
export const catalogEntry = (kind: string) => (isAssetKind(kind) ? assetCatalog[kind] : fallbackAsset);
