import { FEET, GRIP, HANG_DROP, SPRITE_SCALE, DEG_PER_RAD, clamp, randomBetween, along, type Kind, type Pose, type Phase, type Surface } from "./model";

export type Spell = { x: number; y: number; done: () => void; accepted?: boolean };
export type Sim = {
  live: boolean;
  reduce: boolean;
  phase: Phase;
  t: number;
  hold: number;
  pose: Pose;
  shown: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  sx: number;
  sy: number;
  dir: number;
  alpha: number;
  hidden: boolean;
  kind: Kind;
  last: string;
  tx: number;
  ty: number;
  gnd: "tool" | "chat" | null;
  exitX: number;
  stuntDone: number;
  kick: number;
  ptr: { x: number; y: number; t: number };
  done: () => void;
  spell: Spell | null;
  fx: (from: number[], to: number[]) => void;
  puff: number;
};
export const newSim = (): Sim => ({
  live: false,
  reduce: false,
  phase: "idle",
  t: 0,
  hold: 0,
  pose: "idle",
  shown: "",
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  rot: 0,
  sx: 1,
  sy: 1,
  dir: 1,
  alpha: 1,
  hidden: false,
  kind: "hover",
  last: "",
  tx: 0,
  ty: 0,
  gnd: null,
  exitX: 0,
  stuntDone: 0,
  kick: 0,
  ptr: { x: 0, y: 0, t: -1e9 },
  done: () => {},
  spell: null,
  fx: () => {},
  puff: 0,
});

export const rect = (sel: string) => {
  const r = document.querySelector(sel)?.getBoundingClientRect();
  return r && r.width ? r : null;
};
export function surfaces() {
  const p = rect(".agent-chat-panel"),
    b = rect(".agent-chat-bubble"),
    t = rect(".tlui-main-toolbar__tools");
  const chat: Surface | null = p ? { y: p.top, x0: p.left + 24, x1: p.right - 24 } : b ? { y: b.top, x0: b.left + b.width / 2 - 6, x1: b.left + b.width / 2 + 6, small: true } : null;
  const tool: Surface | null = t ? { y: t.top, x0: t.left, x1: t.right } : null;
  return { chat, tool };
}

export const go = (buddy: Sim, phase: Phase, hold = 0) => {
  buddy.phase = phase;
  buddy.t = 0;
  buddy.hold = hold;
};
export const resetShape = (buddy: Sim) => {
  buddy.sx = 1;
  buddy.sy = 1;
};

// Viewport position of a sprite point (sprite px) under the current pose, mirror and rotation.
export function spritePoint(buddy: Sim, px: number, py: number) {
  const [ax, ay] = buddy.pose === "hang" ? GRIP : FEET,
    a = buddy.rot / DEG_PER_RAD,
    lx = (px * SPRITE_SCALE - ax) * buddy.dir * buddy.sx,
    ly = (py * SPRITE_SCALE - ay) * buddy.sy;
  return [buddy.x + lx * Math.cos(a) - ly * Math.sin(a), buddy.y + lx * Math.sin(a) + ly * Math.cos(a)];
}

export function enter(buddy: Sim, kind: Kind) {
  if (kind === "sit") {
    buddy.pose = "sit-1";
    buddy.kick = randomBetween(0.8, 1.6);
    go(buddy, "sit", randomBetween(2.5, 4));
  } else go(buddy, "walk", randomBetween(2.5, 4.5));
  buddy.dir = Math.random() < 0.5 ? 1 : -1;
}

export function pick(buddy: Sim, now: number) {
  const { chat, tool } = surfaces(),
    o: Kind[] = [];
  if (tool) o.push("walk");
  if (chat) {
    o.push("sit");
    if (!chat.small) o.push("chat");
  }
  if (now - buddy.ptr.t < 5000) o.push("grab");
  o.push("hover");
  const c = o.filter((k) => k !== buddy.last),
    pool = c.length ? c : o;
  buddy.kind = pool[Math.floor(Math.random() * pool.length)];
  buddy.last = buddy.kind;
  buddy.gnd = null;
  buddy.tx =
    buddy.kind === "walk" && tool
      ? along(tool)
      : buddy.kind === "chat" && chat
        ? along(chat)
        : buddy.kind === "sit" && chat
          ? chat.small
            ? chat.x0 + 6
            : along(chat)
          : randomBetween(innerWidth * 0.25, innerWidth * 0.75);
  buddy.ty = clamp((chat?.y ?? innerHeight / 2) - 100, 100, innerHeight - 100);
  go(buddy, "fly");
}

export function release(buddy: Sim) {
  if (buddy.phase !== "hang") return;
  buddy.y += HANG_DROP;
  buddy.pose = "hover";
  go(buddy, "hover", 0.5);
}
