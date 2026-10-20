import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Layering: ui -> state -> domain -> io, resolved against real files.
// Root files of app/ (whiteboard-studio.tsx, live-diagram*, spreadsheet-shape.tsx, agent-chat-model.mjs, asset-kinds.ts shim,
// layout/page/loader) form the shell zone: only ui and the shell itself may use them, and no lower layer may import them.
const app = "./app";
const shell = [
  "./app/whiteboard-studio.tsx",
  "./app/whiteboard-studio-loader.tsx",
  "./app/live-diagram.tsx",
  "./app/live-diagram-schema.ts",
  "./app/spreadsheet-shape.tsx",
  "./app/agent-chat-model.mjs",
  "./app/asset-kinds.ts",
  "./app/layout.tsx",
  "./app/page.tsx",
  "./app/d",
];
const layer = (target, forbidden, message) => forbidden.map((from) => ({ target, from, message }));
const noRuntimeEntry = ["./worker", "./scripts"].map((from) => ({ target: app, from, message: "app/** must not import worker/** or scripts/**." }));

const layering = {
  files: ["app/**/*.{ts,tsx,mjs}"],
  rules: {
    "import/no-restricted-paths": [
      "error",
      {
        zones: [
          ...noRuntimeEntry,
          ...layer(`${app}/io`, [`${app}/ui`, `${app}/state`, `${app}/domain`, ...shell], "app/io imports nothing from the app."),
          ...layer(`${app}/domain`, [`${app}/ui`, `${app}/state`, `${app}/io`, ...shell], "app/domain imports only tldraw, react and other domain modules."),
          ...layer(`${app}/state`, [`${app}/ui`, ...shell], "app/state imports domain and io only."),
        ],
      },
    ],
  },
};

// Domain imports only tldraw, react and other domain modules. Relative specifiers stay
// governed by the zones above; every other specifier (bare packages, node: builtins, aliases) must be tldraw or react.
const domainExternals = {
  files: ["app/domain/**/*.{ts,tsx,mjs}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            regex: "^(?!\\.{1,2}(/|$)|tldraw$|react$|react/)",
            message: "app/domain imports only tldraw, react and other domain modules.",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  layering,
  domainExternals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
