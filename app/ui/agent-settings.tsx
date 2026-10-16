"use client";

import { SETTINGS_SECTIONS } from "../agent-chat-model.mjs";

export function AgentSettings({ onClose }: { onClose: () => void }) {
  return (
    <section className="agent-settings" role="dialog" aria-label="Agent settings">
      <header>
        <strong>Agent settings</strong>
        <button onClick={onClose} aria-label="Close agent settings">
          ×
        </button>
      </header>
      <div className="agent-settings-body">
        <p>Nothing here is stored in the repository: secrets and provider choices live in your data directory or environment.</p>
        {SETTINGS_SECTIONS.map((section) => (
          <div key={section.title}>
            <h3>{section.title}</h3>
            {section.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
