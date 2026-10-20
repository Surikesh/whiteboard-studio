# Automatic diagram intent router

The embedded assistant must choose a diagram by the question it needs to answer, not by a preferred visual style. The user is not required to name a diagram type.

## Decision order

1. **Write the focus question.** Every diagram must answer one explicit question; return it in `focusQuestion`.
2. **Use the lightest adequate medium.** Prefer prose for a short linear explanation and a table for repeated comparison across common criteria. Draw only when spatial structure, behavior, sequence, boundaries, branching, or relationships carry the answer. A comparison that is best as a table still uses Whiteboard Studio's native editable `table` payload.
3. **Select semantic behavior.** When behavior is load-bearing, choose the nearest semantic pattern below before selecting a layout grammar. A semantic pattern adds meaning-specific primitives and constraints; it does not create a new `diagramType`.
4. **Select exactly one explanatory grammar.** Add a new grammar only when none of the supported grammars can represent the answer without distortion.
5. **Choose an audience/detail profile and destination**, then apply its adaptive complexity budget.

## Semantic patterns

| Trigger                                        | Semantic pattern    | Nearest existing grammar      | Meaning-specific requirement                                                           |
| ---------------------------------------------- | ------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| queue depth, capacity, bottleneck, fan-in      | `fan-in-bottleneck` | `architecture` or `flowchart` | Show independently traceable producers, constrained resource, and capacity/queue fact. |
| trust boundary, allowed/forbidden path         | `trust-boundary`    | `architecture`                | Draw editable boundaries and distinguish allowed from forbidden paths semantically.    |
| repeated governance/control layers             | `control-layers`    | `hierarchy` or `architecture` | Keep layers ordered and show what each layer governs.                                  |
| unstructured input becoming a durable artifact | `input-to-artifact` | `flowchart`                   | Distinguish transformation stages from the durable output.                             |
| reinforcing cycle with accumulated state       | `feedback-loop`     | `causal`                      | Name accumulated state and label the direction/sign of influence.                      |
| ordered interaction between actors             | `message-sequence`  | `sequence`                    | Preserve actor order, message order, and direction.                                    |

If no pattern applies, omit `semanticPattern`; do not force one. Preserve the existing `diagramType` values in `whiteboard-studio/v1`.

## Explanatory grammars

1. **sequence** — Who sends what to whom, and in what time order? Use for protocols, API calls, conversations, hand-offs, and request/response traces.
2. **flowchart** — What happens next, including conditions, yes/no branches, retries, and terminal outcomes? Use action nodes, `decision` diamonds, and explicit branch labels. Never use a flowchart merely to relate concepts.
3. **state** — Which states can one entity occupy, and which events cause transitions?
4. **architecture** — What systems/components exist, what are their boundaries, and what depends on what? Keep one abstraction level per view.
5. **concept-map** — What does a subject mean, what does it contain, and how do concepts relate? Every edge needs a short verb phrase so `A —label→ B` reads as a meaningful proposition. Do not add a synthetic final conclusion.
6. **hierarchy** — How is a subject decomposed into categories, parts, or levels? Edges mean `contains`, `is a type of`, or `consists of`.
7. **causal** — What factors cause or influence other factors in a complex problem? Nodes are variables/factors, not actions; edge labels state influence and, where relevant, `+` or `−`. Cycles are allowed only when they explain feedback.
8. **argument** — What claim is being evaluated, and which evidence supports or challenges it? Use `claim`, `evidence`, and `outcome` nodes; label edges `supports` or `opposes`.
9. **comparison** — How do alternatives differ across the same criteria? Always use the native editable `table` payload: alternatives are columns, criteria are rows, and each intersection is one editable cell. Do not imitate a table with independent cards and do not connect cells with arrows.

## Audience, detail, and destination

Authoring inputs may include:

- `audience`: `executive | mixed | engineer` (default `mixed`);
- `detail`: `simplified | balanced | faithful` (default `balanced`);
- `destination`: `canvas | slide | document` (default `canvas`).

These are routing/procedure inputs and do not require a `whiteboard-studio/v1` schema change. Use the closest combined profile:

| Profile                | Primary nodes | Edges | Review behavior                   |
| ---------------------- | ------------: | ----: | --------------------------------- |
| executive / simplified |           5–9 |  8–12 | Split aggressively.               |
| mixed / balanced       |          8–15 | 12–20 | Group and split when needed.      |
| engineer / faithful    |         15–24 | 20–36 | Require grouping; split above 24. |

Budgets are review triggers, not automatic failures or permission to discard content. Connector collisions and unreadable labels are hard failures at every profile. When a view exceeds its useful budget, produce a focused overview and one or more detail views with stable cross-reference labels. Every source fact must be represented directly, by an explicit aggregate, or in a fidelity ledger; never silently drop it.

## Remove test and fidelity ledger

Before saving, ask:

- Can any node be removed without weakening the answer?
- Can two nodes that always travel together be merged?
- Can an edge be removed because layout already expresses the relationship?
- Can a label be shortened or removed without losing meaning?

Every remaining node and edge must carry information. For redraws, imports, merges, or overview/detail splits, include a fidelity ledger stating source/drawn node and edge counts plus every merge, collapse, drop, and preserved load-bearing relationship. A dropped item needs an explicit reason.

## Hard invariants versus defaults

**Hard requirements:** an explicit focus question; the prose/table gate; semantic behavior before layout when behavior carries meaning; informative nodes and edges; overview/detail splitting when needed; no connector through an unrelated node; no connector hidden beneath another connector; no edge-label collision with nodes, connectors, or labels; correct bindings; editable explanatory text; executable checks for rules claimed as machine-verified; rendered-canvas inspection before completion.

**Stylistic defaults:** one dominant reading direction; zero to two focal elements; orthogonal routing for architecture, flowchart, hierarchy, and comparison flows; 5–9 primary nodes for executive overviews; static presentation; minimal legends and annotations. Deviate when the focus question or grammar benefits, while preserving hard invariants.

There is no universal skin, nine-node maximum, orthogonal-routing requirement, ban on curves/diagonals/shadows/fonts/dark palettes, divisibility-by-four rule, or fixed legend position.

## Selection rules

- If a request genuinely asks several questions, create the smallest useful primary view and identify the follow-up/detail view; do not mix visual grammars in one view.
- `sequence` is the only type using the `sequence` payload. All other non-comparison types use editable native nodes and edges.
- All explanatory text must remain editable. Never bake labels into an image.
- Do not invent a bottom "conclusion" node unless the chosen type is `argument` or the user explicitly asks for a conclusion.
- Edge labels describe semantics, not decoration. Concept-map labels normally contain a verb.
- In the brief response before the patch, state: `Type: …` and one short reason for the choice.

## Patch schema

```json
{
  "format": "whiteboard-studio/v1",
  "intent": "short normalized intent",
  "focusQuestion": "the single question answered by this diagram",
  "diagramType": "concept-map|flowchart|sequence|state|architecture|hierarchy|causal|argument|comparison",
  "title": "concise title",
  "nodes": [{ "id": "stable-id", "label": "editable text", "x": 100, "y": 150, "w": 260, "kind": "box|note|text|service|decision|claim|evidence|outcome" }],
  "edges": [{ "from": "node-id", "to": "node-id", "label": "short semantic relation", "relation": "supports|opposes|positive|negative|yes|no" }],
  "table": {
    "columns": ["Alternative A", "Alternative B"],
    "rows": [{ "label": "Criterion 1", "values": ["A value", "B value"] }]
  }
}
```

For `sequence`, keep `nodes: []` and use the existing `sequence.participants` and `sequence.messages` payload. For `comparison`, keep `nodes: []` and `edges: []` and use `table`; every row must have exactly one value per column.
