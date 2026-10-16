"use client";

import { buddyOn, buddyAcceptsCast } from "../../agent-chat-model.mjs";
import { useEffect, useRef, useState } from "react";
import { FLAME_FRAMES, POSES, SIZE, SMOKE_FRAMES, SPRITES, WORK_STEPS } from "./model";
import { apply, frames, smoke, sparkle } from "./effects";
import { go, newSim, release, resetShape, type Sim, type Spell } from "./sim";
import { step } from "./step";

export type { Spell };

export function PencilBuddy({ active, cheers = 0 }: { active: boolean; cheers?: number }) {
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [casting, setCasting] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const sim = useRef<Sim>(null as unknown as Sim);
  sim.current ||= newSim();
  const actor = useRef<HTMLDivElement>(null);
  const flame = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const on = buddyOn(active); // the only visibility rule: mounted iff the agent works
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    // preload every sprite once so swaps never flicker
    const keep = [...POSES, ...frames("flame", FLAME_FRAMES), ...frames("smoke", SMOKE_FRAMES)].map((name) => {
      const im = new Image();
      im.src = `${SPRITES}/${name}.png`;
      return im;
    });
    // The board asks for a spell before it drops a generated picture: Graphite flies over and conjures it at (x,y).
    const cast = (event: Event) => {
      const spell = (event as CustomEvent<Spell>).detail,
        buddy = sim.current;
      if (!buddyAcceptsCast(activeRef.current) || !buddy.live || buddy.reduce || buddy.spell) return; // an idle agent never summons Graphite
      spell.accepted = true;
      const done = spell.done;
      let finished = false; // runs once: from the sim when the spell lands, or when work stops and Graphite unmounts
      spell.done = () => {
        if (finished) return;
        finished = true;
        setCasting(false);
        done();
      };
      release(buddy);
      if (buddy.hidden) {
        buddy.hidden = false;
        buddy.x = buddy.exitX;
        buddy.y = innerHeight + 90;
      }
      resetShape(buddy);
      buddy.gnd = null;
      buddy.alpha = 1;
      buddy.dir = spell.x - 120 > buddy.x ? 1 : -1;
      if (spell.x - 260 < 0) buddy.dir = -1;
      else if (spell.x + 260 > innerWidth) buddy.dir = 1;
      buddy.spell = spell;
      setCasting(true);
      go(buddy, "to-cast");
    };
    window.addEventListener("pencil-buddy-cast", cast);
    return () => {
      keep.length = 0;
      window.removeEventListener("pencil-buddy-cast", cast);
    };
  }, []);

  useEffect(() => {
    const buddy = sim.current;
    if (on) {
      if (buddy.live) return;
      Object.assign(buddy, newSim(), { live: true, ptr: buddy.ptr });
      buddy.reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (buddy.reduce) {
        buddy.phase = "rm";
        buddy.stuntDone = performance.now();
      }
      setStepIndex(0);
      setVisible(true);
    } else if (buddy.live) {
      // not working: unmount at once; a spell in flight still hands its picture to the board
      const spell = buddy.spell;
      buddy.live = false;
      buddy.spell = null;
      setVisible(false);
      spell?.done();
    }
  }, [on]);

  useEffect(() => {
    // mid-work milestone: an agent patch was applied while Graphite is still working
    const buddy = sim.current;
    if (!cheers || !buddy.live || buddy.reduce || buddy.spell || buddy.hidden) return;
    release(buddy);
    buddy.rot = 0;
    resetShape(buddy);
    buddy.pose = "cheer";
    go(buddy, "cheer");
  }, [cheers]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(() => setStepIndex((v) => (v + 1) % WORK_STEPS.length), 2600);
    return () => window.clearInterval(timer);
  }, [visible]);

  const text = casting ? "Agent is working · casting a spell…" : WORK_STEPS[stepIndex];

  useEffect(() => {
    if (!visible || !actor.current || !pill.current || !flame.current) return;
    const buddy = sim.current,
      a = actor.current,
      p = pill.current,
      r = root.current!,
      f = flame.current;
    const imgs = Array.from(a.querySelectorAll<HTMLElement>(":scope > img")),
      flames = Array.from(f.children) as HTMLElement[];
    let raf = 0,
      prev = performance.now();
    buddy.fx = (from, to) => sparkle(r, from, to);
    const move = (e: PointerEvent) => {
      buddy.ptr = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      step(buddy, dt, now);
      apply(buddy, a, p, imgs, f, flames, now);
      if (!buddy.reduce) smoke(r, buddy, now);
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <div className="pencil-buddy" aria-live="polite" ref={root}>
      <div className="pencil-buddy__actor" ref={actor}>
        {POSES.map((pose) => (
          <img key={pose} src={`${SPRITES}/${pose}.png`} alt="" width={SIZE} height={SIZE} draggable={false} />
        ))}
        {/* in front of the body so the fire visibly leaves the nozzle instead of peeking out from under the boots */}
        <div className="pencil-buddy__flame" ref={flame}>
          {frames("flame", FLAME_FRAMES).map((name) => (
            <img key={name} src={`${SPRITES}/${name}.png`} alt="" draggable={false} />
          ))}
        </div>
      </div>
      <div className="pencil-buddy__status" ref={pill}>
        <span>{text}</span>
        <i>
          <b />
          <b />
          <b />
        </i>
      </div>
    </div>
  );
}
