import { isAssetKind } from "./asset-kinds";
import { assetCatalog } from "./asset-catalog";

type TechLogoName =
  | "jira"
  | "gitlab"
  | "docker"
  | "kubernetes"
  | "nginx"
  | "redis"
  | "celery"
  | "elastic"
  | "ansible"
  | "suse"
  | "vmware"
  | "linux"
  | "windows"
  | "apple"
  | "opentext"
  | "artifactory"
  | "tests-generated"
  | "smoke-testing-generated";
const TECH_LOGO_KINDS = new Set(["docker", "kubernetes", "nginx", "redis", "celery", "elastic", "ansible", "suse", "vmware", "linux", "windows", "apple"] as const);
const PICTOGRAM_KINDS = new Set(["focused-work", "harness-settings", "orchestrator", "skill"] as const);

function TechLogo({ name, label }: { name: TechLogoName; label: string }) {
  const raster = name.endsWith("-generated");
  return <img className={`tech-logo${raster ? " tech-logo--generated" : ""}`} src={`/icons/tech/${name}.${raster ? "png" : "svg"}`} alt={label} draggable={false} />;
}

function GeneratedPictogram({ name, label }: { name: string; label: string }) {
  return <img className="tech-logo tech-logo--generated" src={`/icons/generated/${name}.png`} alt={label} draggable={false} />;
}

export function AssetIcon({ kind }: { kind: string }) {
  if (!isAssetKind(kind))
    return (
      <svg className="pencil-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.65" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="5" width="16" height="14" rx="2" />
      </svg>
    );
  if ((PICTOGRAM_KINDS as Set<string>).has(kind)) return <GeneratedPictogram name={kind} label={assetCatalog[kind].label} />;
  if ((TECH_LOGO_KINDS as Set<string>).has(kind)) return <TechLogo name={kind as TechLogoName} label={assetCatalog[kind].label} />;
  if (kind === "jira") return <TechLogo name="jira" label="Jira" />;
  if (kind === "gitlab") return <TechLogo name="gitlab" label="GitLab" />;
  if (kind === "quality") return <TechLogo name="tests-generated" label="Tests" />;
  if (kind === "verification") return <TechLogo name="smoke-testing-generated" label="Smoke testing" />;
  if (kind === "artifactory") return <TechLogo name="artifactory" label="JFrog Artifactory" />;
  if (kind === "compose") return <TechLogo name="docker" label="Docker Compose" />;
  if (kind === "service-manager") return <TechLogo name="opentext" label="OpenText Service Manager" />;
  if (kind === "runtime")
    return (
      <div className="runtime-logos" aria-label="Nginx, Docker, Redis, Celery and Elastic">
        <TechLogo name="nginx" label="Nginx" />
        <TechLogo name="docker" label="Docker" />
        <TechLogo name="redis" label="Redis" />
        <TechLogo name="celery" label="Celery" />
        <TechLogo name="elastic" label="Elastic" />
      </div>
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
        {kind === "factory" && (
          <>
            <path d="M5.2 6.7A8.2 8.2 0 0 1 18 5.3l1.7 1.6M18.8 17.3A8.2 8.2 0 0 1 6 18.7l-1.7-1.6" />
            <path d="m19.8 3.7-.1 3.2-3.2-.2M4.2 20.3l.1-3.2 3.2.2" />
            <g transform="translate(12 12)">
              <path
                d="M-1.4-5h2.8l.5 1.6 1.5.6 1.5-.8 2 2-1 1.5.7 1.6 1.7.5v2.8l-1.7.5-.7 1.6 1 1.5-2 2-1.5-.8-1.5.6-.5 1.6h-2.8l-.5-1.6-1.5-.6-1.5.8-2-2 1-1.5-.7-1.6-1.7-.5V2l1.7-.5.7-1.6-1-1.5 2-2 1.5.8 1.5-.6z"
                transform="scale(.55)"
              />
              <circle r="1.5" />
            </g>
            <g transform="translate(6.7 12.5) scale(.55)">
              <path d="M-1.4-5h2.8l.5 1.6 1.5.6 1.5-.8 2 2-1 1.5.7 1.6 1.7.5v2.8l-1.7.5-.7 1.6 1 1.5-2 2-1.5-.8-1.5.6-.5 1.6h-2.8l-.5-1.6-1.5-.6-1.5.8-2-2 1-1.5-.7-1.6-1.7-.5V2l1.7-.5.7-1.6-1-1.5 2-2 1.5.8 1.5-.6z" />
              <circle r="1.8" />
            </g>
            <g transform="translate(17.3 12.5) scale(.55)">
              <path d="M-1.4-5h2.8l.5 1.6 1.5.6 1.5-.8 2 2-1 1.5.7 1.6 1.7.5v2.8l-1.7.5-.7 1.6 1 1.5-2 2-1.5-.8-1.5.6-.5 1.6h-2.8l-.5-1.6-1.5-.6-1.5.8-2-2 1-1.5-.7-1.6-1.7-.5V2l1.7-.5.7-1.6-1-1.5 2-2 1.5.8 1.5-.6z" />
              <circle r="1.8" />
            </g>
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
        {kind === "context" && (
          <>
            <rect x="5" y="5" width="14" height="15" rx="2" />
            <path d="M8 2h11v15M8 9h8M8 13h6" />
            <path d="M2 8V4a2 2 0 0 1 2-2h3M2 16v4a2 2 0 0 0 2 2h3M22 8V4a2 2 0 0 0-2-2M22 16v4a2 2 0 0 1-2 2" />
          </>
        )}
        {kind === "session" && (
          <>
            <rect x="2" y="3" width="20" height="16" rx="2" />
            <path d="M2 7h20M6 5h.01M9 5h.01M6 11l3 2-3 2M11 16h5" />
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
        {kind === "toolbox" && (
          <>
            <path d="M3 9h18v11H3zM8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M3 13h18M10 13v2h4v-2" />
            <path d="M6 17h3M15 17h3" />
          </>
        )}
        {kind === "roadmap" && (
          <>
            <path d="M4 20V4M4 7h6l2 3h8M4 14h5l2 3h9" />
            <circle cx="4" cy="7" r="2" />
            <circle cx="4" cy="14" r="2" />
            <circle cx="20" cy="10" r="2" />
            <circle cx="20" cy="17" r="2" />
          </>
        )}
        {kind === "organization" && (
          <>
            <circle cx="12" cy="5" r="3" />
            <circle cx="5" cy="18" r="3" />
            <circle cx="19" cy="18" r="3" />
            <path d="M12 8v4M5 15v-1a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" />
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
        {kind === "evidence" && (
          <>
            <path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h5M8 16h3" />
            <circle cx="16.5" cy="16.5" r="3" />
            <path d="m19 19 2 2" />
          </>
        )}
        {kind === "plan" && (
          <>
            <path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5" />
            <path d="m15 17 2 2 4-4" />
          </>
        )}
        {kind === "routing-layer" && (
          <>
            <rect x="3" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="8.5" y="16" width="7" height="5" rx="1" />
            <path d="M6.5 8v3h11V8M12 11v5" />
            <path d="m10 13 2-2 2 2" />
          </>
        )}
        {kind === "preset-authoring" && (
          <>
            <path d="M5 3h10l4 4v14H5zM15 3v5h4" />
            <path d="M8 11h6M8 15h4" />
            <path d="m14 18 5-5 2 2-5 5-3 1z" />
          </>
        )}
        {kind === "harness-files" && (
          <>
            <path d="M3 6.5h7l2 2h9v11H3z" />
            <path d="M6 4h6l2 2h7v2.5M7 12h4M7 15h7M7 18h5" />
            <path d="M16.5 12.5h2M17.5 11.5v2M16 16h3" strokeWidth="1.9" />
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
        {kind === "service-catalog" && (
          <>
            <circle cx="12" cy="5" r="2.5" />
            <rect x="3" y="15" width="6" height="5" rx="1" />
            <rect x="15" y="15" width="6" height="5" rx="1" />
            <path d="M12 7.5v3.5M6 15v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
            <path d="M10 5H6M14 5h4" />
          </>
        )}
        {kind === "network-zones" && (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c3 3.1 3 14.9 0 18M12 3c-3 3.1-3 14.9 0 18" />
            <path d="M5.5 6.5h13M5.5 17.5h13" />
          </>
        )}
        {kind === "policy-catalog" && (
          <>
            <path d="M5 2.5h10l4 4v15H5zM15 2.5v5h4" />
            <path d="M8 11h7M8 15h4" />
            <path d="m13.5 17.5 2 2 4-4" />
          </>
        )}
        {kind === "netpolicy" && (
          <g strokeWidth="2.15">
            <path d="M12 3.4c2.4 1.8 4.8 2.2 7.2 2.2v5.1c0 5-2.9 8.1-7.2 10.3-4.3-2.2-7.2-5.3-7.2-10.3V5.6c2.4 0 4.8-.4 7.2-2.2Z" stroke="#0878bd" />
            <path d="M9.2 12v-1.6a2.8 2.8 0 0 1 5.6 0V12M8.5 12h7v5h-7zM12 14v1.2" stroke="#303b49" />
            <path d="M7.2 5V2.6H5M12 4V1.6M16.8 5V2.6H19M4.8 8H2.2M4.8 12H2.2M4.8 16H2.2M19.2 8h2.6M19.2 12h2.6M19.2 16h2.6M8 19.2v2.2H5.5M12 21v1.4M16 19.2v2.2h2.5" stroke="#0878bd" />
            <g fill="#0878bd" stroke="none">
              <circle cx="5" cy="2.6" r="1" />
              <circle cx="12" cy="1.6" r="1" />
              <circle cx="19" cy="2.6" r="1" />
              <circle cx="2.2" cy="8" r="1" />
              <circle cx="2.2" cy="12" r="1" />
              <circle cx="2.2" cy="16" r="1" />
              <circle cx="21.8" cy="8" r="1" />
              <circle cx="21.8" cy="12" r="1" />
              <circle cx="21.8" cy="16" r="1" />
              <circle cx="5.5" cy="21.4" r="1" />
              <circle cx="12" cy="22.4" r="1" />
              <circle cx="18.5" cy="21.4" r="1" />
            </g>
          </g>
        )}
        {kind === "runner" && (
          <g transform="translate(24 0) scale(-.5 .5)">
            <path
              fill="#FC6D26"
              stroke="#8f351d"
              d="M13.865 5.5a5.093 5.093 0 1 1-3.677 1.49 5.1 5.1 0 0 1 3.677-1.49m13.467 1.09 8.028 8.028-3.351 3.352-4.678-4.677-3.744 3.747L42.89 36.342l-3.351 3.352L28.926 29.08l-3.744 3.747 6.322 6.322-3.352 3.351-9.673-9.673 7.096-7.098-5.34-5.339-7.097 7.096-8.028-8.029 3.351-3.35 4.677 4.676z"
            />
          </g>
        )}
        {kind === "cleanup" && (
          <>
            <g transform="scale(.75)" fill="currentColor" stroke="none">
              <path d="M16 2v2h10v15h2V4a2 2 0 0 0-2-2Z" />
              <path d="M11 7v2h10v15h2V9a2 2 0 0 0-2-2Z" />
              <path d="M6 12h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2m10 2-10-.001V28h10Z" />
            </g>
            <g stroke="#dc2626" strokeWidth="3.4" strokeLinecap="round">
              <path d="m15.5 15.5 6 6M21.5 15.5l-6 6" />
            </g>
          </>
        )}
        {kind === "release" && (
          <g strokeWidth="4.2">
            <path d="M5 3h10l4 4v14H5zM15 3v5h4" />
            <path d="M8 12h5M8 16h4" />
            <circle cx="17.5" cy="17.5" r="3.2" />
            <path d="M17.5 12.8v1.5M17.5 20.7v1.5M12.8 17.5h1.5M20.7 17.5h1.5" />
          </g>
        )}
        {kind === "symlink" && (
          <g transform="scale(.75)" fill="currentColor" stroke="none">
            <path d="M16 2v2h10v15h2V4a2 2 0 0 0-2-2Z" />
            <path d="M11 7v2h10v15h2V9a2 2 0 0 0-2-2Z" />
            <path d="M6 12h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2m10 2-10-.001V28h10Z" />
          </g>
        )}
        {kind === "package-replace" && (
          <>
            <path d="m4 7 6-3 6 3-6 3zM4 7v7l6 3.5 6-3.5V7M10 10v7.5" />
            <path d="M15.5 11.5h4.5M18 9l2.5 2.5L18 14" stroke="#e5a528" strokeWidth="2.3" />
            <path d="m20 17-6 3-3-1.5" stroke="#e5a528" strokeWidth="2.3" />
          </>
        )}
        {kind === "applicant" && (
          <>
            <circle cx="7" cy="6.5" r="3.3" />
            <path d="M1.5 21.5v-2a5.5 5.5 0 0 1 9.4-3.9" />
            <path d="m9.6 14.6 4-1.6" />
            <rect x="13.5" y="5" width="8.5" height="12.5" rx="1" />
            <path d="M15.6 8.6h4.3M15.6 11.4h4.3M15.6 14.2h2.6" strokeWidth="1.9" />
          </>
        )}
        {kind === "architect" && (
          <>
            <circle cx="7" cy="6.5" r="3.3" />
            <path d="M1.5 21.5v-2a5.5 5.5 0 0 1 11 0v2" />
            <path d="M14 21.5V4.5l9 17z" />
            <path d="M16.4 18.9v-5.6l3 5.6z" strokeWidth="1.9" />
          </>
        )}
        {kind === "support-engineer" && (
          <>
            <circle cx="12" cy="9" r="4.4" />
            <path d="M5.8 10V8.8a6.2 6.2 0 0 1 12.4 0V10" />
            <rect x="4.4" y="8.6" width="2.8" height="4.6" rx="1.2" />
            <rect x="16.8" y="8.6" width="2.8" height="4.6" rx="1.2" />
            <path d="M5.8 13.2v.8a2.6 2.6 0 0 0 2.6 2.6h2.2" />
            <path d="M4 22.5a8 6 0 0 1 16 0" />
          </>
        )}
        {kind === "infra-admin" && (
          <>
            <circle cx="5.8" cy="7.5" r="3.1" />
            <path d="M.8 21.5v-1.8a5 5 0 0 1 10 0v1.8" />
            <rect x="16" y="2.5" width="7" height="19" rx="1" />
            <path d="M16 8.8h7M16 15.2h7" />
            <path d="M18 5.7h.01M18 12h.01M18 18.4h.01" strokeWidth="3" />
            <path d="M20 5.7h1.3M20 12h1.3M20 18.4h1.3" strokeWidth="1.6" />
            <path d="M13.6 2.6a2.6 2.6 0 0 0-3.3 3.3l-3.4 3.4a1 1 0 0 0 1.4 1.4l3.4-3.4a2.6 2.6 0 0 0 3.3-3.3l-1.5 1.5-1.4-1.4z" transform="translate(5 8) scale(.68)" strokeWidth="2.7" />
          </>
        )}
        {kind === "registry" && (
          <>
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5 1.5 1.5 0 0 0 5.5 22H20v-4" />
            <g strokeWidth="1.7">
              <rect x="10.8" y="4.6" width="4.4" height="3.2" rx=".6" />
              <rect x="7.6" y="11.6" width="4" height="3.2" rx=".6" />
              <rect x="14.4" y="11.6" width="4" height="3.2" rx=".6" />
              <path d="M13 7.8v2M9.6 9.8h6.8M9.6 9.8v1.8M16.4 9.8v1.8" />
            </g>
          </>
        )}
        {kind === "environment" && (
          <>
            <path d="M12.8 9.2a2 2 0 0 0-1.6 0L3 12.9a.9.9 0 0 0 0 1.6l8.2 3.7a2 2 0 0 0 1.6 0l8.2-3.7a.9.9 0 0 0 0-1.6z" />
            <path d="M2.4 17.6a.9.9 0 0 0 .6.8l8.2 3.7a2 2 0 0 0 1.6 0l8.2-3.7a.9.9 0 0 0 .6-.8" />
            <path d="M12 13.7V2l6 2.4-6 2.4" />
          </>
        )}
        {kind === "operator" && (
          <>
            <circle cx="6" cy="7" r="3.2" />
            <path d="M.8 21.5v-1.6a5.2 5.2 0 0 1 10.4 0v1.6" />
            <rect x="12.5" y="5" width="10.5" height="8.5" rx="1.2" />
            <path d="m14.6 8 1.7 1.3-1.7 1.3M17.6 11.4h2.6" strokeWidth="1.8" />
            <path d="M17.75 13.5v3.2M15 17h5.5M11 15.5h1.5" />
          </>
        )}
        {kind === "file-exchange" && (
          <>
            <rect x="2" y="2.5" width="20" height="7" rx="1.6" />
            <path d="M5.5 6h.01" strokeWidth="3" />
            <path d="M14 6h5" />
            <path d="M7 12.5v9M4.2 15.3 7 12.5l2.8 2.8" />
            <path d="M17 12.5v9M14.2 18.7l2.8 2.8 2.8-2.8" />
          </>
        )}
        {kind === "archive" && (
          <>
            <rect x="2" y="3" width="20" height="5" rx="1.2" />
            <path d="M4 8v12a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 20V8" />
            <path d="M10 12h4" />
            <path d="M12 12v6M9.8 15.8 12 18l2.2-2.2" strokeWidth="2" />
          </>
        )}
        {kind === "app-window" && (
          <>
            <rect x="1.5" y="3" width="21" height="17" rx="2" />
            <path d="M1.5 7h21M4.5 5h.01M7 5h.01" />
            <path d="M8 7v13" />
            <path d="M3.5 10h2.5M3.5 13h2.5M3.5 16h2.5" strokeWidth="1.8" />
            <path d="M11 9.5h8.5a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-5.5l-2.5 2v-2H11a1 1 0 0 1-1-1v-3.5a1 1 0 0 1 1-1z" strokeWidth="1.9" />
          </>
        )}
        {kind === "lazy-download" && (
          <>
            <path d="M12 2v2.2M12 6.6v2.2M12 11.2v2.6" />
            <path d="m8.4 10.6 3.6 3.6 3.6-3.6" />
            <path d="M3 14.5v4.5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4.5" />
            <circle cx="19" cy="5" r="3.3" strokeWidth="1.8" />
            <path d="M19 3.4V5l1.1.9" strokeWidth="1.6" />
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
