"use client";

import { Editor, createShapeId, useValue } from "tldraw";
import { useState } from "react";
import { ASSET_KINDS, LEGACY_ASSET_KINDS, type AssetKind } from "../domain/asset-kinds";
import { assetCatalog } from "../domain/asset-catalog";
import { AssetIcon } from "../domain/icons";
import { ASSET_TYPE } from "../domain/shapes/types";
import { COMPONENT_LIBRARY_KEY, readSavedComponents, type SavedComponent } from "../io/component-store";
import { safeSetLocalStorage } from "../io/workspace-storage";
import { useT } from "../domain/i18n";

export function ComponentLibrary({ editor, open, onClose }: { editor: Editor; open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [savedComponents, setSavedComponents] = useState<SavedComponent[]>(readSavedComponents);
  const selectedCount = useValue("selected component shapes", () => editor.getSelectedShapeIds().length, [editor]);
  const t = useT();
  if (!open) return null;
  const needle = query.trim().toLowerCase();
  const kinds = ASSET_KINDS.filter((kind) => !LEGACY_ASSET_KINDS.includes(kind) && `${assetCatalog[kind].label} ${assetCatalog[kind].group} ${kind}`.toLowerCase().includes(needle));
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
    const name = window.prompt(t("components.namePrompt"), shapes.length === 1 ? t("components.defaultName") : t("components.groupName", { count: shapes.length }))?.trim();
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
    <aside className="component-library" aria-label={t("components.aria")}>
      <header>
        <div>
          <strong>{t("components.title")}</strong>
          <small>{t("components.hint")}</small>
        </div>
        <button aria-label={t("components.close")} onClick={onClose}>
          ×
        </button>
      </header>
      <input autoFocus aria-label={t("components.searchAria")} placeholder={t("components.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
      <section>
        <h2>{t("components.architecture")}</h2>
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
          <h2>{t("components.mine")}</h2>
          <button disabled={!selectedCount} onClick={saveSelection}>
            {t("components.saveSelection")}
          </button>
        </div>
        {!saved.length ? (
          <p>{savedComponents.length ? t("components.nothingFound") : t("components.savedEmpty")}</p>
        ) : (
          saved.map((item) => (
            <div className="saved-component" key={item.id}>
              <button onClick={() => insertSaved(item)}>
                <span>{item.name.slice(0, 1).toUpperCase()}</span>
                <strong>{item.name}</strong>
                <small>{t("components.items", { count: item.shapes.length })}</small>
              </button>
              <button aria-label={t("components.delete", { name: item.name })} onClick={() => removeSaved(item.id)}>
                ×
              </button>
            </div>
          ))
        )}
      </section>
    </aside>
  );
}
