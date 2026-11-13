"use client";

import { BUDDY_DEMO_MS, buddyAcceptsCast, buddyDemo, buddyExit, buddyOn } from "../../agent-chat-model.mjs";
import { useEffect, useRef, useState } from "react";
import { useT } from "../../domain/i18n";
import { FLAME_FRAMES, POSES, SIZE, SMOKE_FRAMES, SPRITES, WORK_STEPS } from "./model";
import { apply, frames, smoke, sparkle } from "./effects";
import { go, newSim, release, resetShape, type Sim, type Spell } from "./sim";
import { step } from "./step";

export type { Spell };

export function PencilBuddy({ active, cheers = 0 }: { active: boolean; cheers?: number }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // the first render returns null either way, so reading the URL here cannot cause a hydration mismatch
  const [demo, setDemo] = useState<"" | "on" | "done">(() => (typeof location !== "undefined" && buddyDemo(location.search) ? "on" : ""));
  const [casting, setCasting] = useState(false);
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  const sim = useRef<Sim>(null as unknown as Sim);
  sim.current ||= newSim();
  const actor = useRef<HTMLDivElement>(null);
  const flame = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const on = buddyOn(active, demo === "on");

  // Starts a fresh run; `done` is what the exit animation calls when Graphite is off the screen.
  const spawn = (buddy: Sim, exiting: boolean) => {
    Object.assign(buddy, newSim(), {
      live: true,
      exiting,
      ptr: buddy.ptr,
      done: () => {
        buddy.live = false;
        setVisible(false);
      },
    });
  };

  useEffect(() => {
    // preload every sprite once so swaps never flicker
    const keep = [...POSES, ...frames("flame", FLAME_FRAMES), ...frames("smoke", SMOKE_FRAMES)].map((name) => {
      const im = new Image();
      im.src = `${SPRITES}/${name}.png`;
      return im;
    });
    const replay = () => setDemo("on"); // demo pages can replay via window.dispatchEvent(new Event("pencil-buddy-demo"))
    if (buddyDemo(location.search)) window.addEventListener("pencil-buddy-demo", replay);
    // The board asks for a spell before it drops a generated picture: Graphite flies over and conjures it at (x,y).
    const cast = (event: Event) => {
      const spell = (event as CustomEvent<Spell>).detail,
        buddy = sim.current;
      if (!buddyAcceptsCast({ reduce: matchMedia("(prefers-reduced-motion: reduce)").matches, casting: Boolean(buddy.spell) })) return;
      spell.accepted = true;
      const done = spell.done;
      let finished = false; // runs once: from the sim when the spell lands, or when Graphite unmounts first
      spell.done = () => {
        if (finished) return;
        finished = true;
        setCasting(false);
        done();
      };
      if (!buddy.live) {
        // already gone (a late picture): come back from the top edge just for the spell, then leave again
        spawn(buddy, true);
        buddy.x = spell.x - 160;
        buddy.y = -20;
        buddy.stuntDone = performance.now();
        setLeaving(true);
        setVisible(true);
      }
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
      window.removeEventListener("pencil-buddy-demo", replay);
      window.removeEventListener("pencil-buddy-cast", cast);
      sim.current.spell?.done(); // never strand a picture behind an unmounted spell
    };
  }, []);

  useEffect(() => {
    const buddy = sim.current;
    if (buddy.spell) {
      // never interrupt a spell; it decides what follows
      buddy.exiting = !on;
      setLeaving(!on);
      return;
    }
    if (on) {
      if (buddy.live && !buddy.exiting) return;
      spawn(buddy, false);
      buddy.reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (buddy.reduce) {
        buddy.phase = "rm";
        buddy.stuntDone = performance.now();
      }
      setLeaving(false);
      setStepIndex(0);
      setVisible(true);
    } else if (buddy.live && !buddy.exiting) {
      buddy.exiting = true;
      setLeaving(true);
      release(buddy);
      const exit = buddyExit(buddy);
      if (exit === "now") buddy.done();
      else if (exit === "fade") go(buddy, "fade");
      else if (exit === "leave") {
        buddy.pose = "launch";
        buddy.vy = Math.min(buddy.vy, -100);
        go(buddy, "leave");
      } else {
        buddy.pose = "cheer";
        go(buddy, "cheer");
      }
    }
  }, [on]);

  useEffect(() => {
    // mid-work milestone: an agent patch was applied while Graphite is still working
    const buddy = sim.current;
    if (!cheers || !buddy.live || buddy.exiting || buddy.reduce || buddy.spell || buddy.hidden) return;
    release(buddy);
    buddy.rot = 0;
    resetShape(buddy);
    buddy.pose = "cheer";
    go(buddy, "cheer");
  }, [cheers]);

  useEffect(() => {
    if (!visible || leaving) return;
    const timer = window.setInterval(() => setStepIndex((v) => (v + 1) % WORK_STEPS.length), 2600);
    return () => window.clearInterval(timer);
  }, [visible, leaving]);

  const text = casting ? t("buddy.casting") : leaving ? t("buddy.leaving") : t(WORK_STEPS[stepIndex]);

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
      if (demo === "on" && buddy.stuntDone && !buddy.exiting && now - buddy.stuntDone > BUDDY_DEMO_MS) setDemo("done");
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
  }, [visible, demo]);

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
        {(!leaving || casting) && (
          <i>
            <b />
            <b />
            <b />
          </i>
        )}
      </div>
    </div>
  );
}
