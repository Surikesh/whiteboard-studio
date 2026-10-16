"use client";

import { Editor, createShapeId, useValue } from "tldraw";
import { useState } from "react";
import { ASSET_KINDS, type AssetKind } from "../domain/asset-kinds";
import { assetCatalog } from "../domain/asset-catalog";
import { AssetIcon } from "../domain/icons";
import { ASSET_TYPE } from "../domain/shapes/types";
import { COMPONENT_LIBRARY_KEY, readSavedComponents, type SavedComponent } from "../io/component-store";
import { safeSetLocalStorage } from "../io/workspace-storage";

export function ComponentLibrary({ editor, open, onClose }: { editor: Editor; open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [savedComponents, setSavedComponents] = useState<SavedComponent[]>(readSavedComponents);
  const selectedCount = useValue("selected component shapes", () => editor.getSelectedShapeIds().length, [editor]);
  if (!open) return null;
  const needle = query.trim().toLowerCase();
  const kinds = ASSET_KINDS.filter((kind) => `${assetCatalog[kind].label} ${assetCatalog[kind].group} ${kind}`.toLowerCase().includes(needle));
  const saved = savedComponents.filter((item) => item.name.toLowerCase().includes(needle));
  const insertAsset = (kind: AssetKind) => {
    const center = editor.getViewportPageBounds().center;
    const id = createShapeId();
    editor.createShape({ id, type: ASSET_TYPE, x: center.x - 75, y: center.y - 85, props: { w: 150, h: 170, kind, label: assetCatalog[kind].label } });
    editor.select(id);
    onClose();
  };
  const saveSelection = () => {
    const shapes = editor.getSelectedShapes();
    if (!shapes.length) return;
    const name = window.prompt("Component name", shapes.length === 1 ? "My component" : `Group of ${shapes.length} items`)?.trim();
    if (!name) return;
    const minX = Math.min(...shapes.map((shape) => shape.x));
    const minY = Math.min(...shapes.map((shape) => shape.y));
    const item: SavedComponent = {
      id: `component_${Date.now().toString(36)}`,
      name,
      createdAt: new Date().toISOString(),
      shapes: shapes.map((shape) => ({ type: shape.type, x: shape.x - minX, y: shape.y - minY, rotation: shape.rotation, opacity: shape.opacity, props: shape.props, meta: shape.meta })),
    };
    const next = [item, ...savedComponents];
    setSavedComponents(next);
    safeSetLocalStorage(COMPONENT_LIBRARY_KEY, JSON.stringify(next));
  };
  const insertSaved = (item: SavedComponent) => {
    const center = editor.getViewportPageBounds().center;
    const ids = item.shapes.map(() => createShapeId());
    editor.createShapes(item.shapes.map((shape, index) => ({ ...shape, id: ids[index], x: center.x - 100 + shape.x, y: center.y - 80 + shape.y })) as Parameters<Editor["createShapes"]>[0]);
    editor.select(...ids);
    onClose();
  };
  const removeSaved = (id: string) => {
    const next = savedComponents.filter((item) => item.id !== id);
    setSavedComponents(next);
    safeSetLocalStorage(COMPONENT_LIBRARY_KEY, JSON.stringify(next));
  };
  return (
    <aside className="component-library" aria-label="Component library">
      <header>
        <div>
          <strong>Components</strong>
          <small>Click to add to the canvas</small>
        </div>
        <button aria-label="Close library" onClick={onClose}>
          ×
        </button>
      </header>
      <input autoFocus aria-label="Search components" placeholder="Search: database, user, API…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <section>
        <h2>Architecture</h2>
        <div className="component-catalog">
          {kinds.map((kind) => (
            <button key={kind} onClick={() => insertAsset(kind)}>
              <span className={`component-catalog__icon asset-shape--${assetCatalog[kind].tone}`}>
                <AssetIcon kind={kind} />
              </span>
              <span>
                <strong>{assetCatalog[kind].label}</strong>
                <small>{assetCatalog[kind].group}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="saved-components">
        <div className="component-section-heading">
          <h2>My components</h2>
          <button disabled={!selectedCount} onClick={saveSelection}>
            Save selection
          </button>
        </div>
        {!saved.length ? (
          <p>{savedComponents.length ? "Nothing found" : "Select items on the canvas and save them as a reusable component."}</p>
        ) : (
          saved.map((item) => (
            <div className="saved-component" key={item.id}>
              <button onClick={() => insertSaved(item)}>
                <span>{item.name.slice(0, 1).toUpperCase()}</span>
                <strong>{item.name}</strong>
                <small>{item.shapes.length} items</small>
              </button>
              <button aria-label={`Delete ${item.name}`} onClick={() => removeSaved(item.id)}>
                ×
              </button>
            </div>
          ))
        )}
      </section>
    </aside>
  );
}
