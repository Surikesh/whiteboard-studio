# Plan: adopt Diagram Design quality rules in Whiteboard Studio

## Status

Slice 1 (documentation and routing contract) is reflected in `DIAGRAM_ROUTER.md`,
`DIAGRAM_SPEC.md`, `LAYOUT_GUIDE.md` and `VISUAL_STYLE_GUIDE.md`: the prose/table
gate, semantic patterns, audience/detail budgets, the remove test and fidelity
ledger, and distinct fan-in/fan-out anchors (`fromAnchor` / `toAnchor`). Slices 2–5
are not implemented yet; `scripts/diagram-preflight.mjs` does not exist. The rest
of this document is the original plan, kept for the remaining slices.

## Goal

Strengthen the existing diagram-authoring workflow using the best ideas from
[`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design),
without replacing editable Tldraw output, the icon-led visual language, or the
current workspace workflow.

The target pipeline is:

```text
focus question
→ explanatory/semantic routing
→ layout grammar
→ adaptive complexity budget
→ editable Tldraw spec
→ deterministic geometry checks
→ rendered visual verification
```

## Product outcome

After implementation, an agent creating or editing a diagram should:

1. Decide whether a diagram is better than prose or a table.
2. Identify the semantic behavior that carries the meaning before selecting a
   visual layout.
3. Choose a supported Tldraw diagram grammar and an audience/detail profile.
4. Apply an adaptive complexity budget and split overview/detail views when
   necessary.
5. Generate editable Tldraw content with traceable connectors and restrained
   visual emphasis.
6. Validate machine-checkable geometry before opening the diagram.
7. Validate the actual rendered canvas with numeric evidence and screenshots.

## Constraints to preserve

- Tldraw remains the canonical editable output.
- Do not introduce Diagram Design's HTML/SVG templates as the primary artifact.
- Preserve `whiteboard-studio/v1` compatibility (and loading of specs written
  under the earlier id `tldraw-lab/v1`) unless a schema revision is explicitly
  approved.
- Preserve the icon-led visual language and semantic icon gate.
- Preserve the central workspace workflow and stable `/d/<td_id>` documents.
- Preserve user manual edits in the realtime room.
- Do not copy Diagram Design's coral/Geist/Instrument Serif skin.
- Do not require all diagrams to use orthogonal connectors.
- Do not impose a universal nine-node hard limit.
- Do not add network-dependent fonts or assets.

## Rules to adopt

### Adopt as hard requirements

- A diagram must answer an explicit focus question.
- Before drawing, check whether prose or a table communicates the answer better.
- Select semantic behavior before layout when behavior is load-bearing.
- Every node and edge must carry information.
- Split dense material into overview and detail views.
- Several connectors must never hide one another.
- A connector must not pass through an unrelated node.
- Edge labels must not overlap nodes, connectors, or other labels.
- Machine-verifiable rules should have executable checks and adversarial tests.
- Completion requires inspection of the rendered canvas, not JSON validity alone.

### Adopt as defaults, not universal laws

- One dominant reading direction.
- One or two focal visual elements.
- Orthogonal routing for architecture, workflow, and grid-based diagrams.
- Five to nine primary nodes for executive overview diagrams.
- Static presentation by default.
- Minimal legends and annotations.

### Explicitly reject as universal requirements

- A fixed visual skin.
- A blanket ban on shadows, particular fonts, or dark palettes.
- A blanket ban on diagonal or curved edges.
- A universal maximum of nine nodes.
- A requirement that every coordinate and font size be divisible by four.
- A fixed bottom-only legend position.

## Proposed architecture

### 1. Extend routing with semantic patterns

Add a semantic layer alongside the existing explanatory grammar in
`DIAGRAM_ROUTER.md`.

Initial semantic patterns:

| Trigger                                        | Semantic pattern      | Nearest existing diagram type |
| ---------------------------------------------- | --------------------- | ----------------------------- |
| queue depth, capacity, bottleneck, fan-in      | `fan-in-bottleneck`   | `architecture` or `flowchart` |
| trust boundary, allowed/forbidden path         | `trust-boundary`      | `architecture`                |
| repeated governance/control layers             | `control-layers`      | `hierarchy` or `architecture` |
| two evaluations with first divergence          | `paired-policy-trace` | `flowchart`                   |
| unstructured input becoming a durable artifact | `input-to-artifact`   | `flowchart`                   |
| reinforcing cycle with accumulated state       | `feedback-loop`       | `causal`                      |
| ordered interaction between actors             | `message-sequence`    | `sequence`                    |

Rules:

- A semantic pattern adds meaning-specific primitives and constraints; it does
  not automatically create a new diagram type.
- Add a new diagram type only when no existing layout grammar can represent the
  content without distortion.
- Preserve the existing `diagramType` values during the first implementation
  slice.

### 2. Introduce audience and detail profiles

Add optional authoring inputs, initially at the routing/procedure level rather
than requiring an immediate schema change:

- `audience`: `executive | mixed | engineer`
- `detail`: `simplified | balanced | faithful`
- `destination`: `canvas | slide | document`

Suggested budgets:

| Profile              | Primary nodes | Edges | Behavior                         |
| -------------------- | ------------: | ----: | -------------------------------- |
| executive/simplified |           5–9 |  8–12 | Split aggressively               |
| mixed/balanced       |          8–15 | 12–20 | Group and split when needed      |
| engineer/faithful    |         15–24 | 20–36 | Require grouping; split above 24 |

These are review triggers, not automatic failures. Connector collisions and
unreadable labels remain hard failures at every profile.

### 3. Add a remove test and fidelity ledger

Before saving a generated diagram, require the agent to evaluate:

- Can any node be removed without losing the answer?
- Can two nodes that always travel together be merged?
- Can an edge be removed because layout already expresses the relationship?
- Can a label be shortened or removed?

For redraw/import operations, produce a fidelity ledger:

```text
Source: 16 nodes / 22 edges
Drawn: 10 nodes / 13 edges
Merged: worker replicas → Worker Pool
Collapsed: retry decision → edge label
Dropped: decorative note with no relationship
Preserved: request path and trust boundaries
```

Never silently drop source content.

### 4. Make connector policy grammar-aware

Replace blanket connector rules with routing profiles:

- `orthogonal`: architecture, flowchart, hierarchy, comparison flows.
- `linear`: sequence, timelines, simple pipelines.
- `graph`: concept-map, causal, dense dependency relationships.

Hard invariants across all profiles:

- no connector through an unrelated node;
- no connector hidden beneath another connector;
- no label collision;
- independently traceable fan-in/fan-out;
- correct source and target binding;
- crossings minimized and explicitly handled where possible.

For orthogonal diagrams, add distinct attach points for fan-in/fan-out instead
of forcing every edge through the exact side center. Preserve center anchors for
single-edge chains. This resolves the current conflict between readable fanning
and `LAYOUT_GUIDE.md`'s universal center-anchor contract.

### 5. Add restrained emphasis rules

Extend `VISUAL_STYLE_GUIDE.md` with semantic emphasis rather than a fixed skin:

- zero to two focal elements by default;
- emphasis must answer “where should the reader look first?”;
- color may encode either focus or semantics, but the role must be consistent;
- do not decorate every node with badges or metadata;
- shape, icon, label, and position should not redundantly encode the same fact
  unless accessibility requires it.

The existing icon-led system remains authoritative.

### 6. Add executable geometry validation

Create or extend a validator that can inspect a generated spec and/or hydrated
Tldraw records. Suggested checks:

- node bounds do not overlap;
- minimum visible spacing is met;
- edge segments do not intersect unrelated node bounds;
- edge-label bounds do not intersect node bounds;
- edge-label bounds do not intersect other labels;
- repeated compact rows align and have equal widths;
- fan-in/fan-out bindings are distinct where required;
- parent/child ranks and reading direction match the selected grammar;
- content stays inside screenshot/export bounds.

Each checker must ship with positive and adversarial fixtures. Do not claim to
verify a rule that is still only a prompt checklist.

### 7. Unify new-diagram and realtime-workspace preflight

The current workflow has strong realtime cleanup in
`WORKSPACE_LAYOUT_PREFLIGHT.md`, but new diagrams and existing workspace edits
should emit a common evidence shape:

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

The realtime room remains authoritative for edits to an existing workspace.

## Implementation slices

### Slice 1 — Documentation and routing contract

Modify only documentation/procedure surfaces:

- `DIAGRAM_ROUTER.md`
- `DIAGRAM_SPEC.md`
- `LAYOUT_GUIDE.md`
- `VISUAL_STYLE_GUIDE.md`
- `WORKSPACE_LAYOUT_PREFLIGHT.md`
- any agent skill that routes to these documents, if needed

Deliver:

- diagram-vs-prose/table gate;
- semantic-pattern routing table;
- audience/detail budgets;
- remove test;
- grammar-aware connector policy;
- overview/detail split rule;
- explicit distinction between hard invariants and stylistic defaults.

Acceptance:

- no contradiction remains between center-only anchors and distinct fan-out
  attachment points;
- no rule claims universal orthogonal routing;
- existing icon-led requirements remain intact;
- another agent can follow the documents without loading Diagram Design.

### Slice 2 — Validator for static source specs

Add a CLI validator for `whiteboard-studio/v1` source specs. Reuse existing loader
geometry rather than duplicating shape-size assumptions where possible.

Suggested command:

```bash
node scripts/diagram-preflight.mjs path/to/spec.json --report /tmp/report.json
```

Initial hard checks:

- schema validity;
- node overlap;
- minimum node spacing;
- edge crossing unrelated nodes;
- label collision where label geometry is available;
- invalid routing profile for selected diagram grammar.

Acceptance:

- valid fixtures pass;
- one adversarial fixture exists for every failure category;
- command exits non-zero when `failures` is non-empty;
- report is deterministic and machine-readable.

### Slice 3 — Hydrated/rendered geometry checks

Use the mounted Tldraw Editor in Playwright to inspect actual shape and binding
geometry after hydration.

Deliver:

- hydrated bounds for nodes, arrows, and labels;
- screenshot/export clipping checks;
- readable overview and close-up captures;
- common evidence report shared with workspace cleanup.

Acceptance:

- catches a collision caused by actual Tldraw text metrics that source-spec
  validation misses;
- catches an arrow crossing an unrelated node;
- catches a clipped label;
- leaves the editor state byte-for-byte or record-for-record unchanged after
  read-only validation.

### Slice 4 — Overview/detail generation

Add planning support for splitting content that exceeds the selected budget.
Do not silently discard detail.

Deliver:

- one overview spec;
- one or more detail specs;
- stable cross-reference labels or metadata;
- fidelity ledger describing merges and splits.

Acceptance:

- a fixture above 24 nodes produces an overview plus bounded detail diagrams;
- every source node is represented either directly or by an explicitly listed
  aggregate;
- no source relationship disappears without appearing in the ledger.

### Slice 5 — Regression evaluation against real diagrams

Build a small corpus from representative existing workspaces:

- architecture with trust boundaries;
- top-down workflow with fan-out/fan-in;
- sequence diagram;
- concept map with graph routing;
- dense engineering diagram requiring overview/detail;
- imported/redrawn diagram.

For each case compare before/after on:

- answer to focus question;
- traceability of every edge;
- label readability;
- semantic icon accuracy;
- density;
- editability;
- number of validation failures;
- time/steps required to produce the artifact.

Acceptance:

- no regression in editability;
- no generic health cards introduced;
- no approximate icons introduced;
- all hard geometry checks pass;
- screenshots are inspected at both overview and readable zoom.

## Test strategy

### Unit tests

- semantic router chooses expected pattern and grammar;
- budget calculator returns expected thresholds;
- node-bound intersection;
- segment-bound intersection;
- label collision;
- fan-in/fan-out attachment allocation;
- fidelity ledger completeness.

### Adversarial fixtures

- two edges sharing the same visible path;
- edge passing through a non-endpoint node;
- label hidden beneath a node;
- long translated label that wraps unexpectedly;
- multiple fan-out edges sharing one attach point;
- concept map incorrectly forced into orthogonal grid routing;
- dense diagram incorrectly accepted as an executive overview;
- source node silently omitted during simplification;

### Integration tests

- save → load → hydrate → validate → screenshot;
- workspace connect → Editor transforms → validate → screenshot;
- stable `/d/<td_id>` URL still opens the editable result;
- no `semi` fill or persisted background/grid shape appears.

### Visual review

For every golden use case inspect:

- whole diagram at fit-to-canvas;
- at least one close-up at readable zoom;
- labels and bindings after real font/layout hydration;
- light and dark editor surroundings if relevant, without changing diagram
  semantics.

Avoid screenshot pixel goldens for all visual behavior. Prefer numeric geometry
checks plus focused screenshots; use pixel comparison only for narrowly stable
clipping regressions.

## Files likely involved

Confirm exact ownership before editing, but expect work in:

- `DIAGRAM_ROUTER.md`
- `DIAGRAM_SPEC.md`
- `LAYOUT_GUIDE.md`
- `VISUAL_STYLE_GUIDE.md`
- `WORKSPACE_LAYOUT_PREFLIGHT.md`
- `scripts/diagram.mjs`
- `scripts/workspace-layout.mjs`
- a new `scripts/diagram-preflight.mjs`
- renderer/loader code under `app/`
- test fixtures and project test configuration
- any agent skill that routes to this repository

Do not modify such a skill until the owning project behavior and tests are
updated; the project should remain the source of truth and a thin skill should
route to it.

## Definition of done

The work is complete when:

1. Routing distinguishes semantic behavior from layout grammar.
2. Hard geometry invariants are separated from stylistic defaults.
3. Audience/detail profiles control adaptive complexity budgets.
4. Dense diagrams split into overview/detail without silent loss.
5. Static and realtime validation produce the same evidence schema.
6. Every machine-verifiable hard rule has tests, including adversarial tests.
7. The actual rendered canvas passes numeric and visual preflight.
8. Existing editable workspace behavior and manual edits are preserved.
9. The icon-led visual language and semantic icon gate remain authoritative.
10. Documentation and any thin routing skill agree with verified behavior.

## Recommended execution order

Implement slices 1–3 first. They deliver the highest value: better reasoning,
clearer contracts, and enforceable geometry. Reassess after Slice 3 before
building automatic overview/detail generation; splitting is useful but should
not precede trustworthy validation.

## First action for the implementation session

1. Read this plan and the five current owning documents completely.
2. Inspect `DIAGRAM_ROUTER.md`, `scripts/diagram.mjs`,
   `scripts/workspace-layout.mjs`, and the current tests.
3. Confirm that the Slice 1 rules in the documents still agree with each other
   (routing, anchors, spacing, validation).
4. Implement Slice 2 only.
5. Run the existing test suite and validate one architecture, one sequence, and
   one concept-map fixture before proceeding to Slice 3.
