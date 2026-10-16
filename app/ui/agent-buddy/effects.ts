import { DEG_PER_RAD, FLAME_FRAMES, FLAME_LEN, FLAME_W, FEET, GRIP, JET, POSES, ROLL_C, SPRITE_SCALE, SMOKE_FRAMES, SPRITES, clamp, randomBetween } from "./model";
import { spritePoint, type Sim } from "./sim";

export function apply(buddy: Sim, actor: HTMLElement, pill: HTMLElement, imgs: HTMLElement[], flame: HTMLElement, flames: HTMLElement[], now: number) {
  const hang = buddy.pose === "hang",
    [ax, ay] = hang ? GRIP : FEET,
    [ox, oy] = buddy.pose === "roll" ? ROLL_C : [ax, ay];
  if (buddy.shown !== buddy.pose) {
    imgs.forEach((im, i) => {
      im.style.visibility = POSES[i] === buddy.pose ? "visible" : "hidden";
    });
    actor.style.transformOrigin = `${ox}px ${oy}px`;
    buddy.shown = buddy.pose;
  }
  actor.style.opacity = buddy.hidden ? "0" : String(buddy.alpha);
  actor.style.transform = `translate3d(${buddy.x - ax}px,${buddy.y - ay}px,0) rotate(${buddy.rot}deg) scale(${buddy.dir * buddy.sx},${buddy.sy})`;
  const jet = JET[buddy.pose];
  flame.style.display = jet ? "block" : "none";
  if (jet) {
    // flickering flame glued to the nozzle; frames swap at ~16 fps and the length breathes a little
    const [nx, ny, angle, thrust] = jet,
      frame = Math.floor(now / 62) % FLAME_FRAMES;
    flames.forEach((f, i) => {
      f.style.visibility = i === frame ? "visible" : "hidden";
    });
    flame.style.transform = `translate(${nx * SPRITE_SCALE - FLAME_W / 2}px,${ny * SPRITE_SCALE}px) rotate(${angle}deg) scale(${thrust * 0.75},${thrust * (0.88 + 0.24 * Math.random())})`;
  }
  const top = (hang ? buddy.y : buddy.y - (FEET[1] - GRIP[1])) - 30,
    w = pill.offsetWidth;
  pill.style.opacity = buddy.hidden ? "0" : String(buddy.alpha);
  pill.style.transform = `translate3d(${clamp(buddy.x - w / 2, 8, innerWidth - w - 8)}px,${clamp(top, 8, innerHeight - 40)}px,0)`;
}

// Exhaust smoke: a puff leaves the flame tip, keeps drifting the way the flame points, swells and fades.
export function smoke(root: HTMLElement, buddy: Sim, now: number) {
  const jet = JET[buddy.pose];
  if (!jet || buddy.hidden || now < buddy.puff || root.childElementCount > 48) return;
  const [nx, ny, angle, thrust] = jet,
    a = angle / DEG_PER_RAD,
    len = FLAME_LEN * thrust;
  buddy.puff = now + 75 / thrust;
  const [x0, y0] = spritePoint(buddy, nx, ny),
    [x, y] = spritePoint(buddy, nx - Math.sin(a) * len, ny + Math.cos(a) * len);
  const d = Math.hypot(x - x0, y - y0) || 1,
    ux = (x - x0) / d,
    uy = (y - y0) / d,
    push = randomBetween(22, 40) * thrust,
    side = randomBetween(-12, 12);
  const el = document.createElement("img");
  el.className = "pencil-buddy__puff";
  el.alt = "";
  el.src = `${SPRITES}/smoke-${1 + Math.floor(Math.random() * SMOKE_FRAMES)}.png`;
  root.appendChild(el);
  const size = randomBetween(0.45, 0.7) * thrust,
    spin = randomBetween(-70, 70);
  el.animate(
    [
      { transform: `translate(${x}px,${y}px) translate(-50%,-50%) scale(${size * 0.4})`, opacity: 0 },
      { transform: `translate(${x + ux * push * 0.3}px,${y + uy * push * 0.3}px) translate(-50%,-50%) scale(${size * 0.8}) rotate(${spin * 0.3}deg)`, opacity: 0.8, offset: 0.15 },
      { transform: `translate(${x + ux * push - uy * side}px,${y + uy * push + ux * side - 10}px) translate(-50%,-50%) scale(${size * 1.7}) rotate(${spin}deg)`, opacity: 0 },
    ],
    { duration: randomBetween(650, 900), easing: "cubic-bezier(.2,.6,.4,1)", fill: "both" },
  ).finished.then(() => el.remove());
}

// Sparkles fly from the wand tip to the target, then burst where the picture appears.
export function sparkle(root: HTMLElement, from: number[], to: number[]) {
  const spark = (size: number) => {
    const el = document.createElement("i");
    el.className = "pencil-buddy__spark";
    el.textContent = "✦";
    el.style.fontSize = `${size}px`;
    root.appendChild(el);
    return el;
  };
  const [x0, y0] = from,
    [x1, y1] = to,
    nx = -(y1 - y0),
    ny = x1 - x0,
    n = Math.hypot(nx, ny) || 1;
  for (let i = 0; i < 9; i++) {
    const bend = (i % 2 ? 1 : -1) * randomBetween(10, 34),
      mx = (x0 + x1) / 2 + (nx / n) * bend,
      my = (y0 + y1) / 2 + (ny / n) * bend;
    const el = spark(randomBetween(14, 22));
    el.animate(
      [
        { transform: `translate(${x0}px,${y0}px) scale(.4) rotate(0deg)`, opacity: 0 },
        { transform: `translate(${mx}px,${my}px) scale(1) rotate(120deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${x1}px,${y1}px) scale(.6) rotate(240deg)`, opacity: 0.9 },
      ],
      { duration: 340, delay: i * 30, easing: "ease-in", fill: "both" },
    ).finished.then(() => el.remove());
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + randomBetween(-0.2, 0.2),
      r = randomBetween(60, 130),
      el = spark(randomBetween(12, 22));
    el.animate(
      [
        { transform: `translate(${x1}px,${y1}px) scale(.3)`, opacity: 1 },
        { transform: `translate(${x1 + Math.cos(a) * r}px,${y1 + Math.sin(a) * r}px) scale(1) rotate(180deg)`, opacity: 0 },
      ],
      { duration: 700, delay: 330, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both" },
    ).finished.then(() => el.remove());
  }
  const ring = document.createElement("i");
  ring.className = "pencil-buddy__ring";
  root.appendChild(ring);
  ring
    .animate(
      [
        { transform: `translate(${x1}px,${y1}px) translate(-50%,-50%) scale(.1)`, opacity: 0.9 },
        { transform: `translate(${x1}px,${y1}px) translate(-50%,-50%) scale(1)`, opacity: 0 },
      ],
      { duration: 600, delay: 330, easing: "ease-out", fill: "both" },
    )
    .finished.then(() => ring.remove());
}

export const frames = (name: string, n: number) => Array.from({ length: n }, (_, i) => `${name}-${i + 1}`);
