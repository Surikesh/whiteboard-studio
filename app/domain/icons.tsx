import { isAssetKind } from "./asset-kinds";
import { assetCatalog } from "./asset-catalog";

function TechLogo({ name, label }: { name: "docker" | "kubernetes" | "nginx" | "redis" | "elastic" | "linux" | "windows"; label: string }) {
  return <img className="tech-logo" src={`/icons/tech/${name}.svg`} alt={label} draggable={false} />;
}

export function AssetIcon({ kind }: { kind: string }) {
  if (kind === "docker" || kind === "kubernetes" || kind === "nginx" || kind === "redis" || kind === "elastic" || kind === "linux" || kind === "windows")
    return <TechLogo name={kind} label={assetCatalog[kind].label} />;
  if (!isAssetKind(kind))
    return (
      <svg className="pencil-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.65" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="5" width="16" height="14" rx="2" />
      </svg>
    );
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2.65,
  };
  return (
    <svg className="pencil-icon" viewBox="0 0 24 24" aria-hidden="true" {...common}>
      <defs>
        <filter id="pencil-line" x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.055" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.42" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter="url(#pencil-line)">
        {kind === "person" && (
          <>
            <circle cx="12" cy="8" r="5" />
            <path d="M20 21a8 8 0 0 0-16 0" />
          </>
        )}
        {kind === "database" && (
          <>
            <ellipse cx="12" cy="5" rx="8" ry="3" />
            <path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
            <path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" />
          </>
        )}
        {kind === "server" && (
          <>
            <rect width="20" height="8" x="2" y="2" rx="2" />
            <rect width="20" height="8" x="2" y="14" rx="2" />
            <line x1="6" x2="6.01" y1="6" y2="6" />
            <line x1="6" x2="6.01" y1="18" y2="18" />
          </>
        )}
        {kind === "web-host" && (
          <>
            <rect x="2" y="3" width="20" height="15" rx="2" />
            <path d="M2 7h20M6 5h.01M9 5h.01" />
            <path d="M8 22h8M12 18v4" />
            <path d="m9.5 11-2 1.5 2 1.5M14.5 11l2 1.5-2 1.5M13 9.8l-2 5.4" strokeWidth="1.9" />
          </>
        )}
        {kind === "cloud" && <path d="M6.5 19h11a4.5 4.5 0 0 0 .6-8.96A6.5 6.5 0 0 0 5.72 8.6 5.25 5.25 0 0 0 6.5 19Z" />}
        {kind === "api" && (
          <>
            <path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" />
          </>
        )}
        {kind === "queue" && (
          <>
            <circle cx="5" cy="12" r="2.2" />
            <circle cx="12" cy="12" r="2.2" />
            <circle cx="19" cy="12" r="2.2" />
            <path d="M7.2 12h2.6M14.2 12h2.6" />
          </>
        )}
        {kind === "brain" && (
          <>
            <path d="M12 18V5" />
            <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
            <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
            <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
            <path d="M18 18a4 4 0 0 0 2-7.464" />
            <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
            <path d="M6 18a4 4 0 0 1-2-7.464" />
            <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
          </>
        )}
        {kind === "switch" && (
          <>
            <rect x="16" y="16" width="6" height="6" rx="1" />
            <rect x="2" y="16" width="6" height="6" rx="1" />
            <rect x="9" y="2" width="6" height="6" rx="1" />
            <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
            <path d="M12 12V8" />
          </>
        )}
        {kind === "form" && (
          <>
            <rect x="4" y="3.5" width="16" height="18" rx="2" />
            <path d="M9 3.5V2h6v1.5M8 8h8M8 12h8M8 16h5" />
            <path d="m5.8 8 1 1 1.6-2M5.8 12l1 1 1.6-2M5.8 16l1 1 1.6-2" />
          </>
        )}
        {kind === "choice" && (
          <>
            <path d="M4 4v5a3 3 0 0 0 3 3h10M12 7l5 5-5 5" />
            <circle cx="4" cy="4" r="2" />
            <path d="M8 12v5a3 3 0 0 0 3 3h6" />
          </>
        )}
        {kind === "workflow" && (
          <>
            <circle cx="5" cy="5" r="2.5" />
            <circle cx="19" cy="12" r="2.5" />
            <circle cx="5" cy="19" r="2.5" />
            <path d="M7.5 5h5a4 4 0 0 1 4 4v.5M16.5 14.5v.5a4 4 0 0 1-4 4h-5" />
            <path d="m14 7 2.5 2.5L19 7M10 17l-2.5 2L10 21" />
          </>
        )}
        {kind === "metrics" && (
          <>
            <path d="M4 20V4M4 20h17" />
            <rect x="7" y="13" width="3" height="5" />
            <rect x="12" y="9" width="3" height="9" />
            <rect x="17" y="5" width="3" height="13" />
          </>
        )}
        {kind === "approval" && (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="m7.5 12 3 3 6-7" />
            <path d="M8 2.8 10 5M16 2.8 14 5" />
          </>
        )}
        {kind === "plan" && (
          <>
            <path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5" />
            <path d="m15 17 2 2 4-4" />
          </>
        )}
        {kind === "git-rebase" && (
          <>
            <circle cx="6" cy="4" r="2" />
            <circle cx="6" cy="20" r="2" />
            <circle cx="18" cy="7" r="2" />
            <circle cx="18" cy="17" r="2" />
            <path d="M6 6v12M8 7.5c5 0 8 2 8 7.5" />
            <path d="m13.5 13 2.5 2 2-2.5" />
            <path d="M18 9v6" />
          </>
        )}
        {kind === "environment" && (
          <>
            <path d="M12.8 9.2a2 2 0 0 0-1.6 0L3 12.9a.9.9 0 0 0 0 1.6l8.2 3.7a2 2 0 0 0 1.6 0l8.2-3.7a.9.9 0 0 0 0-1.6z" />
            <path d="M2.4 17.6a.9.9 0 0 0 .6.8l8.2 3.7a2 2 0 0 0 1.6 0l8.2-3.7a.9.9 0 0 0 .6-.8" />
            <path d="M12 13.7V2l6 2.4-6 2.4" />
          </>
        )}
        {kind === "warning" && (
          <>
            <path d="m12 3 10 18H2z" stroke="#e5a528" strokeWidth="3.4" />
            <path d="M12 9v5M12 18h.01" stroke="#292825" strokeWidth="3.4" />
          </>
        )}
      </g>
    </svg>
  );
}
