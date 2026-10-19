# Realtime workspace layout preflight

This is the owning procedure for aligning and validating an existing Tldraw workspace. It operates on the authoritative realtime `Editor`, not on the possibly stale source spec in `public/diagrams`.

## Why this exists

A workspace has two different representations:

- `public/diagrams/*.diagram.json` — seed/source spec;
- the Durable Object room — the live editable snapshot users actually see.

`workspace.mjs show` reads the source spec. It is not evidence of live canvas geometry. Layout cleanup must therefore connect to `/d/<id>` and call the real Tldraw Editor API.

## Required workflow

This procedure shares the same hard geometry invariants as new-diagram preflight: no node overlap, no connector through an unrelated node, no hidden shared connector path, no label collision, correct bindings, and independently traceable fan-in/fan-out. Reading direction, orthogonal routing, focal count, and legend placement are grammar-aware defaults rather than universal laws.

1. Preserve the user's reading direction and semantic grouping.
2. Describe compact columns, explicit shape sizes, followers, and containing boundaries in a layout config. See `examples/layout/compact-columns.json`, which targets a board created from `public/diagrams/demo-web-architecture.diagram.json`. Shape tokens match a substring of the shape ID, and spec nodes become `spec-<node id>-<suffix>`.
3. Run:

```bash
npm run workspace:layout -- td_... path/to/layout.json /tmp/layout-preflight
```

4. The command performs real `editor.alignShapes()` followed by `editor.stackShapes()` against the realtime room.
5. It repositions declared followers after their groups and expands declared boundaries.
6. It fails when a compact group has:
   - border gap below `minimumGap`;
   - unequal left edges;
   - unequal right edges;
   - a follower gap below `minimumGap`.
7. Inspect all generated artifacts:
   - `*-report.json` — numeric evidence;
   - `*-overview.png` — whole-flow evidence;
   - `*-<group>.png` — readable close-up evidence, normally around 100%.
8. Run `npm test` after changing harness code.
9. Report completion only when `failures` is empty and every screenshot has been visually inspected.

## Common evidence shape

New-diagram and realtime-workspace preflight should converge on this evidence envelope. During Slice 1, fields not yet executable must be omitted or identified as unverified; never report a prompt checklist as a numeric pass.

```json
{
  "diagramType": "architecture",
  "semanticPattern": "trust-boundary",
  "audience": "mixed",
  "detail": "balanced",
  "checks": {
    "nodeOverlap": 0,
    "nodeEdgeIntersections": 0,
    "labelCollisions": 0,
    "spacingFailures": 0,
    "iconSemanticFailures": 0
  },
  "screenshots": {
    "overview": "...",
    "closeups": ["..."]
  },
  "failures": []
}
```

The realtime room remains authoritative. Read-only validation must not mutate it; layout cleanup may mutate only the declared shapes through the documented Editor transforms and must preserve unrelated manual edits.

## Rendering invariants

- Compact repeated rows use explicit heights and at least 32 px visible border-to-border clearance.
- Blank geo shapes are boundaries. Text auto-sizing must never collapse them.
- Explicit compact heights are authoritative minimums. The hydration cleanup must not expand every generated geo to 120 px.
- Align first, then stack. Do not substitute coordinate mutation while claiming that Editor transforms were used.
- A fit-to-canvas screenshot alone is insufficient for overlap validation.

## Harness surfaces

- `app/tldraw-lab.tsx` exposes the mounted realtime editor as local `window.__tldrawEditor` for Playwright harness commands.
- `scripts/workspace-layout.mjs` owns realtime alignment, numeric gates, and screenshots.
- `LAYOUT_GUIDE.md` owns visual spacing rules.
- `VISUAL_STYLE_GUIDE.md` owns the corresponding visual preflight requirement.
