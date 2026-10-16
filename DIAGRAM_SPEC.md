# Tldraw Lab diagram spec

Agents can create a diagram as JSON and open it in this editor without generating internal Tldraw records. First select the explanatory grammar using [DIAGRAM_ROUTER.md](DIAGRAM_ROUTER.md), apply the mandatory icon-led defaults in [VISUAL_STYLE_GUIDE.md](VISUAL_STYLE_GUIDE.md), then choose coordinates using [LAYOUT_GUIDE.md](LAYOUT_GUIDE.md). The user never needs to name the diagram type.

```json
{
  "format": "tldraw-lab/v1",
  "intent": "explain system structure",
  "focusQuestion": "Which components exist and how do they depend on one another?",
  "diagramType": "architecture",
  "title": "Optional title",
  "nodes": [
    { "id": "api", "label": "API", "x": 80, "y": 160, "kind": "service", "technology": "Go", "owner": "Platform", "status": "healthy" },
    { "id": "db", "label": "PostgreSQL", "x": 440, "y": 160, "kind": "box", "color": "blue" }
  ],
  "edges": [{ "from": "api", "to": "db", "label": "SQL" }]
}
```

Supported `diagramType` values: `concept-map`, `flowchart`, `sequence`, `state`, `architecture`, `hierarchy`, `causal`, `argument`, and `comparison`. Preserve these values and `tldraw-lab/v1`; semantic patterns do not create new diagram types. Comparison diagrams use an editable table payload such as `"table":{"columns":["A","B"],"rows":[{"label":"Cost","values":["Low","High"]}]}` with `nodes: []`; do not imitate tables with independent cards. Node `kind`: `asset` (default for concrete entities), `box`, `note`, `text`, `service`, `decision`, `claim`, `evidence`, or `outcome`. An `asset` node requires `assetKind`; see [VISUAL_STYLE_GUIDE.md](VISUAL_STYLE_GUIDE.md). Coordinates are canvas pixels. Optional dimensions are `w` and `h`. `service` nodes accept `technology`, `owner`, and `status` (`healthy`, `warning`, `critical`), but status cards are reserved for diagrams whose subject is operational health and are not the default representation of software. Edge `relation` may be `supports`, `opposes`, `positive`, `negative`, `yes`, or `no`; relation colors and labels remain editable.

## Authoring procedure (schema-compatible)

Before writing the source spec, record the focus question, perform the prose/table gate, select any load-bearing `semanticPattern`, then choose the explanatory grammar and routing profile from [DIAGRAM_ROUTER.md](DIAGRAM_ROUTER.md). Also choose `audience`, `detail`, and `destination`. These values may remain authoring/evidence metadata in this slice and are not required persisted fields in `tldraw-lab/v1`.

Apply the selected adaptive complexity budget as a review trigger. If the answer cannot remain readable within one view, produce an overview and one or more detail specs with stable cross-reference labels. Run the remove test before saving. For redraw/import/simplification/splitting work, accompany the specs with a fidelity ledger listing source and drawn counts plus every merge, collapse, drop, and preserved load-bearing relationship; never silently omit source content.

Connector routing is grammar-aware (`orthogonal`, `linear`, or `graph`), not universally orthogonal. All profiles still require correct bindings, independently traceable paths, no connector through an unrelated node, no hidden shared connector path, and no label collision. See [LAYOUT_GUIDE.md](LAYOUT_GUIDE.md).

## Sequence diagrams

Follow [SEQUENCE_LAYOUT_GUIDE.md](SEQUENCE_LAYOUT_GUIDE.md). Sequence geometry is generated automatically:

```json
{
  "format": "tldraw-lab/v1",
  "diagramType": "sequence",
  "title": "Create diagram",
  "nodes": [],
  "sequence": {
    "participants": [
      { "id": "user", "label": "User", "icon": "👤" },
      { "id": "agent", "label": "Pi Agent", "icon": "✨" },
      { "id": "lab", "label": "Tldraw Lab", "icon": "🧩" }
    ],
    "messages": [
      { "from": "user", "to": "agent", "label": "Describe diagram" },
      { "from": "agent", "to": "lab", "label": "Load spec" },
      { "from": "lab", "to": "agent", "label": "Canvas ready", "dashed": true }
    ]
  }
}
```

Participant columns and message ranks are calculated by the loader. Keep `nodes: []` for schema compatibility.

Validate and place a spec where the app can serve it:

```bash
node scripts/diagram.mjs save /tmp/my-diagram.json my-diagram
```

With the dev server running, open the URL printed by the command. A served spec can also be imported with **Open JSON**. Use **Download JSON** to save the full editable Tldraw snapshot after manual changes.
