"use client";

import type { Editor } from "tldraw";
import { useCallback, useEffect, useRef, useState } from "react";
import { PencilBuddy } from "./agent-buddy/pencil-buddy";
import { AgentSettings } from "./agent-settings";
import { OPEN_AGENT_SETTINGS_EVENT, chatHint, chatState, chatSubtitle } from "../agent-chat-model.mjs";
import { useT, useUiLocale } from "../domain/i18n";
import { dateLocale } from "../domain/locale.mjs";

type AgentImage = { name: string; url: string };
type ClaimResult = { patch?: unknown; images?: AgentImage[] };
type ChatMessage = { id: string; role: "user" | "assistant"; text: string; at: string; patch?: unknown; images?: AgentImage[]; error?: boolean; claimedAt?: string };

export function AgentChat({ roomId, getEditor, applyPatch }: { roomId: string; getEditor: () => Editor | null; applyPatch: (patch: unknown) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Without a configured provider the bubble still opens a hint with the settings entry; the buddy stays hidden.
  const [status, setStatus] = useState<Parameters<typeof chatState>[0]>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [cheers, setCheers] = useState(0); // counts patches applied; Graphite cheers on each one while the agent is still working
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const applied = useRef(new Set<string>());
  const bridgeAbsent = useRef(false); // /api/agent/* answered 404: no bridge runs (plain `npm start`), so poll rarely

  const { configured, enabled, busy } = chatState(status);
  const t = useT();
  const locale = useUiLocale();
  const refresh = useCallback(async () => {
    try {
      const statusResponse = await fetch("/api/agent/status", { cache: "no-store" });
      bridgeAbsent.current = statusResponse.status === 404;
      if (bridgeAbsent.current) {
        setStatus(null);
        return;
      }
      const messagesResponse = await fetch(`/api/agent/messages?roomId=${encodeURIComponent(roomId)}`, { cache: "no-store" });
      const status = await statusResponse.json();
      const history = await messagesResponse.json();
      setStatus(status);
      const next = Array.isArray(history.messages) ? history.messages : [];
      setMessages(next);
      for (const message of next) {
        if ((!message.patch && !message.images?.length) || message.claimedAt || applied.current.has(message.id)) continue;
        applied.current.add(message.id);
        const claim = await fetch("/api/agent/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: message.id }) });
        if (claim.ok) {
          await applyPatch((await claim.json()) as ClaimResult);
          setCheers((count) => count + 1);
        }
      }
    } catch {
      setStatus(null);
    } // bridge unreachable (agent access off or server restarting): show the chat as disabled, the poll retries
  }, [roomId, applyPatch]);

  useEffect(() => {
    let timer = 0;
    const tick = async () => {
      await refresh();
      timer = window.setTimeout(() => void tick(), bridgeAbsent.current ? 60_000 : 1500);
    };
    timer = window.setTimeout(() => void tick(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    const show = () => setSettingsOpen(true);
    window.addEventListener(OPEN_AGENT_SETTINGS_EVENT, show);
    return () => window.removeEventListener(OPEN_AGENT_SETTINGS_EVENT, show);
  }, []);

  const resetContext = async () => {
    if (busy || sending) return;
    const response = await fetch(`/api/agent/messages?roomId=${encodeURIComponent(roomId)}`, { method: "DELETE" });
    if (!response.ok) return;
    applied.current.clear();
    setMessages([]);
    setText("");
  };

  const send = async () => {
    if (!enabled || sending || !text.trim()) return;
    setSending(true);
    const board =
      getEditor()
        ?.getCurrentPageShapes()
        .map((shape) => ({ id: shape.id, type: shape.type, x: shape.x, y: shape.y, props: shape.props })) ?? [];
    try {
      const response = await fetch("/api/agent/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomId, text: text.trim(), board }) });
      if (!response.ok) throw new Error((await response.json()).message || t("chat.requestFailed"));
      setText("");
      await refresh();
    } finally {
      setSending(false);
    }
  };

  const buddy = <PencilBuddy active={chatState(status, sending).working} cheers={cheers} />;
  const settings = settingsOpen && <AgentSettings onClose={() => setSettingsOpen(false)} />;

  if (!open)
    return (
      <>
        {buddy}
        {settings}
        <button className={`agent-chat-bubble ${enabled ? "is-enabled" : ""}`} onClick={() => setOpen(true)} aria-label={t("chat.open")}>
          ✦<span />
        </button>
      </>
    );

  return (
    <>
      {buddy}
      {settings}
      <section aria-label={t("chat.title")} className="agent-chat-panel" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
        <header
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, y: event.clientY, px: position.x, py: position.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (drag.current) setPosition({ x: drag.current.px + event.clientX - drag.current.x, y: drag.current.py + event.clientY - drag.current.y });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          <div className="agent-chat-heading">
            <strong>{t("chat.title")}</strong>
            <small>
              <i className={enabled ? "on" : ""} />
              {chatSubtitle(chatState(status), locale)}
            </small>
          </div>
          <div className="agent-chat-header-actions" onPointerDown={(event) => event.stopPropagation()}>
            <button onClick={() => setSettingsOpen(true)} title={t("chat.settings")} aria-label={t("chat.settings")}>
              ⚙
            </button>
            <button onClick={() => void resetContext()} disabled={busy || sending} title={t("chat.reset")} aria-label={t("chat.reset")}>
              ↻
            </button>
            <button onClick={() => setOpen(false)} title={t("chat.collapse")} aria-label={t("chat.collapse")}>
              —
            </button>
          </div>
        </header>
        <div className="agent-chat-messages">
          {!messages.length && (
            <p>
              {chatHint(chatState(status), locale)}
              {!enabled && (
                <>
                  {" "}
                  <button type="button" className="agent-chat-link" onClick={() => setSettingsOpen(true)}>
                    {t("chat.openSettings")}
                  </button>
                </>
              )}
            </p>
          )}
          {messages.map((message) => (
            <article key={message.id} className={message.role === "user" ? "user" : message.error ? "error" : "assistant"}>
              <span>{message.text}</span>
              <time>{new Date(message.at).toLocaleTimeString(dateLocale(locale), { hour: "2-digit", minute: "2-digit" })}</time>
            </article>
          ))}
          {busy && (
            <article className="assistant typing">
              {t("chat.working")}<span>•••</span>
            </article>
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            value={text}
            disabled={!enabled}
            onChange={(event) => setText(event.target.value)}
            placeholder={enabled ? t("chat.placeholderReady") : configured ? t("chat.placeholderOff") : t("chat.placeholderNone")}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button disabled={!enabled || sending || !text.trim()} aria-label={t("chat.send")}>
            ↑
          </button>
        </form>
      </section>
    </>
  );
}
