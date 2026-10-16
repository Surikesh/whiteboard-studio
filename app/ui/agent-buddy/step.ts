import { DEG_PER_RAD, FEET, GRAVITY, HANG_DROP, ROLL_R, SPRITE_SCALE, WAND, clamp, randomBetween, type Pose } from "./model";
import { enter, go, pick, release, resetShape, spritePoint, surfaces, type Sim } from "./sim";

export function step(buddy: Sim, dt: number, now: number) {
  const { chat, tool } = surfaces(),
    vw = innerWidth,
    vh = innerHeight;
  buddy.t += dt;
  const ground = () => (buddy.gnd === "tool" ? tool : buddy.gnd === "chat" ? chat : null);
  const settle = (k = 8) => {
    buddy.rot += (0 - buddy.rot) * Math.min(1, dt * k);
  };
  switch (buddy.phase) {
    case "rm":
      if (chat) {
        buddy.x = chat.small ? chat.x0 + 6 : chat.x0 + (chat.x1 - chat.x0) * 0.8;
        buddy.y = chat.y;
        buddy.pose = chat.small ? "idle" : "sit-1";
      }
      break;
    case "idle": // opening stunt: stand on the chat edge, then hop
      if (!chat || chat.small) {
        // chat collapsed: drop in from the top edge of the screen instead
        buddy.x = tool ? tool.x0 + (tool.x1 - tool.x0) * 0.7 : vw * 0.6;
        buddy.y = -10;
        buddy.vx = 0;
        buddy.vy = 120;
        buddy.dir = -1;
        buddy.gnd = null;
        buddy.pose = "chute-fail";
        go(buddy, "chute");
        break;
      }
      buddy.x = chat.x0 + (chat.x1 - chat.x0) * 0.8;
      buddy.y = chat.y;
      buddy.pose = "idle";
      buddy.dir = -1;
      if (buddy.t >= 0.5) {
        buddy.vy = -380;
        buddy.vx = 0;
        buddy.gnd = null;
        buddy.pose = "jump";
        go(buddy, "jump");
      }
      break;
    case "jump":
      buddy.vy += GRAVITY * dt;
      buddy.y += buddy.vy * dt;
      if (buddy.vy >= 0) {
        buddy.pose = "chute-fail";
        go(buddy, "chute");
      }
      break;
    case "chute": {
      // tangled parachute that never opens
      buddy.vy += 500 * dt;
      buddy.y += buddy.vy * dt;
      buddy.rot = Math.sin(buddy.t * 16) * 8;
      buddy.x += Math.sin(buddy.t * 9) * 20 * dt;
      if (buddy.t < 0.6) break;
      if (!tool || tool.y < buddy.y + 40) {
        buddy.rot = 0;
        buddy.pose = "hover";
        go(buddy, "hover", 0.4);
        break;
      }
      const tx = tool.x0 + (tool.x1 - tool.x0) * randomBetween(0.55, 0.95),
        dy = tool.y - buddy.y;
      const T = (-buddy.vy + Math.sqrt(buddy.vy * buddy.vy + 2 * GRAVITY * dy)) / GRAVITY;
      buddy.vx = (tx - buddy.x) / T;
      buddy.pose = "fall";
      go(buddy, "fall");
      break;
    }
    case "fall":
      buddy.vy += GRAVITY * dt;
      buddy.x += buddy.vx * dt;
      buddy.y += buddy.vy * dt;
      settle(6);
      if (tool && buddy.vy > 0 && buddy.y >= tool.y) {
        buddy.y = tool.y;
        buddy.rot = 0;
        buddy.vx = 0;
        buddy.vy = 0;
        buddy.gnd = "tool";
        buddy.pose = "splat";
        go(buddy, "splat");
      }
      break;
    case "splat": {
      const e = Math.min(1, buddy.t / 0.3),
        k = 1 - (1 - e) * (1 - e);
      if (tool) buddy.y = tool.y;
      buddy.sx = 1.2 - 0.2 * k;
      buddy.sy = 0.75 + 0.25 * k;
      if (buddy.t >= 0.3) {
        resetShape(buddy);
        buddy.dir = tool && buddy.x - tool.x0 < tool.x1 - buddy.x ? -1 : 1;
        buddy.pose = "roll";
        go(buddy, "roll");
      }
      break;
    }
    case "roll":
    case "tumble": {
      const sp = buddy.phase === "roll" ? Math.min(280, 120 + buddy.t * 200) : Math.abs(buddy.vx);
      buddy.x += buddy.dir * sp * dt;
      buddy.rot += buddy.dir * ((sp * dt) / ROLL_R) * DEG_PER_RAD;
      if (buddy.phase === "roll") {
        if (tool) buddy.y = tool.y;
        if (!tool || buddy.x < tool.x0 - 4 || buddy.x > tool.x1 + 4) {
          buddy.vx = buddy.dir * sp;
          buddy.vy = 0;
          buddy.gnd = null;
          go(buddy, "tumble");
        }
      } else {
        buddy.vy += GRAVITY * dt;
        buddy.y += buddy.vy * dt;
        if (buddy.y > vh + 100) {
          buddy.exitX = clamp(buddy.x, 40, vw - 40);
          buddy.hidden = true;
          buddy.rot = 0;
          go(buddy, "void");
        }
      }
      break;
    }
    case "void":
      if (buddy.t >= 0.7) {
        buddy.hidden = false;
        buddy.x = buddy.exitX;
        buddy.y = vh + 90;
        buddy.vy = -520;
        buddy.vx = 0;
        buddy.pose = "launch";
        go(buddy, "launch");
      }
      break;
    case "launch": {
      // rise from below the viewport to a hover point above the toolbar
      const ty = (tool?.y ?? chat?.y ?? vh / 2) - 120,
        d = buddy.y - ty;
      buddy.vy = -Math.min(520, 5 * d + 30);
      buddy.y += buddy.vy * dt;
      settle();
      if (d < 3) {
        buddy.pose = "hover";
        go(buddy, "hover", 0.6);
      }
      break;
    }
    case "hover":
      buddy.x += buddy.vx * dt;
      buddy.y += buddy.vy * dt;
      buddy.vx *= Math.exp(-4 * dt);
      buddy.vy *= Math.exp(-4 * dt);
      settle();
      buddy.y += Math.cos(buddy.t * 5) * 18 * dt; // gentle bob on the jet
      if (buddy.t >= buddy.hold) {
        buddy.stuntDone ||= now;
        buddy.pose = "hover";
        pick(buddy, now);
      }
      break;
    case "fly": {
      const g = buddy.kind === "walk" ? tool : buddy.kind === "chat" || buddy.kind === "sit" ? chat : null;
      if ((buddy.kind === "walk" || buddy.kind === "chat" || buddy.kind === "sit") && !g) {
        pick(buddy, now);
        break;
      }
      const tg = buddy.kind === "grab" ? [buddy.ptr.x, buddy.ptr.y + HANG_DROP] : buddy.kind === "hover" ? [buddy.tx, buddy.ty] : [buddy.tx, g!.y];
      const dx = tg[0] - buddy.x,
        dy = tg[1] - buddy.y,
        d = Math.hypot(dx, dy);
      if (d < (buddy.kind === "grab" ? 30 : 4)) {
        if (buddy.kind === "grab") {
          buddy.y -= HANG_DROP;
          buddy.pose = "hang";
          go(buddy, "hang", randomBetween(3, 4));
        } else if (buddy.kind === "hover") {
          buddy.pose = "hover";
          go(buddy, "hover", randomBetween(1.2, 2.2));
        } else {
          buddy.x = tg[0];
          buddy.y = tg[1];
          buddy.vx = buddy.vy = 0;
          buddy.gnd = buddy.kind === "walk" ? "tool" : "chat";
          buddy.rot = 0;
          enter(buddy, buddy.kind);
        } // a soft jetpack landing: no dizziness
        break;
      }
      const sp = Math.min(420, d * 6 + 10),
        k = Math.min(1, dt * 6);
      buddy.vx += ((dx / d) * sp - buddy.vx) * k;
      buddy.vy += ((dy / d) * sp - buddy.vy) * k;
      buddy.x += buddy.vx * dt;
      buddy.y += buddy.vy * dt;
      if (Math.abs(buddy.vx) > 25) buddy.dir = Math.sign(buddy.vx);
      const fast = Math.abs(buddy.vx) > 120;
      buddy.pose = fast ? "fly" : "hover"; // the fly sprite already leans forward; only tilt a little with the climb
      buddy.rot += ((fast ? clamp(buddy.vy / 420, -1, 1) * 8 * buddy.dir : clamp(buddy.vx / 420, -1, 1) * 10) - buddy.rot) * Math.min(1, dt * 8);
      break;
    }
    case "walk":
    case "sit": {
      const s = ground();
      if (!s) {
        buddy.gnd = null;
        pick(buddy, now);
        break;
      }
      settle();
      buddy.y = s.y;
      if (buddy.phase === "walk") {
        buddy.x += buddy.dir * 58 * dt;
        if (buddy.x > s.x1 - 16) {
          buddy.x = s.x1 - 16;
          buddy.dir = -1;
        } else if (buddy.x < s.x0 + 16) {
          buddy.x = s.x0 + 16;
          buddy.dir = 1;
        }
        buddy.pose = `walk-${1 + (Math.floor(buddy.t * 10) % 6)}` as Pose;
      } else if (buddy.t >= buddy.kick) {
        // swing the legs now and then
        buddy.pose = buddy.pose === "sit-1" ? "sit-2" : "sit-1";
        buddy.kick = buddy.t + (buddy.pose === "sit-2" ? 0.45 : randomBetween(0.9, 1.8));
      }
      if (buddy.t >= buddy.hold) {
        buddy.stuntDone ||= now;
        buddy.pose = "hover";
        buddy.vx = buddy.vy = 0;
        pick(buddy, now);
      }
      break;
    }
    case "hang": {
      const ax = 60 * (buddy.ptr.x - buddy.x) - 12 * buddy.vx,
        ay = 60 * (buddy.ptr.y - buddy.y) - 12 * buddy.vy;
      buddy.vx += ax * dt;
      buddy.vy += ay * dt;
      buddy.x += buddy.vx * dt;
      buddy.y += buddy.vy * dt;
      buddy.rot = clamp(buddy.vx * 0.06, -20, 20);
      if (buddy.t >= buddy.hold) release(buddy);
      break;
    }
    case "cheer":
    case "wave": {
      const s = ground();
      if (s) buddy.y = s.y;
      settle();
      if (buddy.phase === "cheer" && buddy.t >= 0.7) {
        buddy.pose = "wave";
        go(buddy, "wave");
      } else if (buddy.phase === "wave" && buddy.t >= 0.4) {
        buddy.pose = "launch";
        buddy.vy = -100;
        buddy.gnd = null;
        resetShape(buddy);
        go(buddy, "launch");
      } // back to work: lift off and wander on
      break;
    }
    case "to-cast": {
      // fly beside the spot where the picture will appear
      const sp = buddy.spell!,
        tipX = sp.x - buddy.dir * 120,
        tg = [tipX - buddy.dir * (WAND[0] - FEET[0]), clamp(sp.y - (WAND[1] - FEET[1]), 140, vh - 30)];
      const dx = tg[0] - buddy.x,
        dy = tg[1] - buddy.y,
        d = Math.hypot(dx, dy);
      if (d < 6 || buddy.t > 2.5) {
        buddy.x = tg[0];
        buddy.y = tg[1];
        buddy.vx = buddy.vy = 0;
        buddy.rot = 0;
        buddy.pose = "wand-out";
        go(buddy, "cast");
        break;
      }
      const spd = Math.min(520, d * 6 + 10),
        k = Math.min(1, dt * 6);
      buddy.vx += ((dx / d) * spd - buddy.vx) * k;
      buddy.vy += ((dy / d) * spd - buddy.vy) * k;
      buddy.x += buddy.vx * dt;
      buddy.y += buddy.vy * dt;
      buddy.pose = Math.abs(buddy.vx) > 120 ? "fly" : "hover";
      buddy.rot += (clamp(buddy.vx / 520, -1, 1) * 6 - buddy.rot) * Math.min(1, dt * 8);
      break;
    }
    case "cast": {
      // pull out the wand, raise it, point at the spot: the picture appears there
      const sp = buddy.spell!,
        t = buddy.t,
        prev = t - dt;
      buddy.dir = sp.x >= buddy.x ? 1 : -1;
      settle();
      buddy.pose = t < 0.4 ? "wand-out" : t < 0.85 ? "wand-up" : t < 1.45 ? "cast" : "flick";
      if (prev < 0.9 && t >= 0.9) buddy.fx(spritePoint(buddy, WAND[0] / SPRITE_SCALE, WAND[1] / SPRITE_SCALE), [sp.x, sp.y]);
      if (prev < 1.25 && t >= 1.25) sp.done();
      if (t >= 1.8) {
        buddy.spell = null;
        buddy.pose = "hover";
        go(buddy, "hover", 0.6);
      }
      break;
    }
  }
}
