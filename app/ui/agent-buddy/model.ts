// Graphite: a pencil with a jetpack. One rAF loop drives a small state machine and writes transforms straight to the DOM.
export const POSES = [
  "idle",
  "walk-1",
  "walk-2",
  "walk-3",
  "walk-4",
  "walk-5",
  "walk-6",
  "sit-1",
  "sit-2",
  "fly",
  "hover",
  "hang",
  "cheer",
  "wave",
  "jump",
  "chute-fail",
  "fall",
  "splat",
  "roll",
  "launch",
  "wand-out",
  "wand-up",
  "cast",
  "flick",
] as const;
export type Pose = (typeof POSES)[number];
export type Phase = "idle" | "jump" | "chute" | "fall" | "splat" | "roll" | "tumble" | "void" | "launch" | "hover" | "fly" | "walk" | "sit" | "hang" | "cheer" | "wave" | "rm" | "to-cast" | "cast";
export type Kind = "walk" | "chat" | "sit" | "grab" | "hover";
export type Surface = { y: number; x0: number; x1: number; small?: boolean };
export const WORK_STEPS = ["Agent is working", "Agent is working · drawing", "Agent is working · still on it", "Agent is working · almost done"];

// Sprites are 320×320 in public/pencil/v3; bump the folder when the art changes so no browser mixes in cached frames. Feet, or the seat for sit-*, sit at (160,240); "hang" grips at (160,40).
export const SPRITES = "/pencil/v3",
  SPRITE_SCALE = 0.375,
  SIZE = 320 * SPRITE_SCALE;
export const FEET = [160 * SPRITE_SCALE, 240 * SPRITE_SCALE],
  GRIP = [160 * SPRITE_SCALE, 40 * SPRITE_SCALE];
export const HANG_DROP = (248 - 40) * SPRITE_SCALE; // the boots hang this far below the gripping hand
export const ROLL_C = [159.5 * SPRITE_SCALE, 189.5 * SPRITE_SCALE],
  ROLL_R = 51 * SPRITE_SCALE;
export const WAND = [257 * SPRITE_SCALE, 122 * SPRITE_SCALE]; // star tip of the wand in the "cast" sprite
// Bottom end of the jetpack cylinder (sprite px, measured on the 320px art), flame angle (deg; 0 = straight down, positive swings the flame backwards) and thrust.
export const JET: Partial<Record<Pose, [number, number, number, number]>> = {
  hover: [123, 152, 0, 0.75],
  fly: [136, 158, 40, 1],
  launch: [134, 165, 0, 1.3],
  "wand-out": [131, 160, 0, 0.6],
  "wand-up": [127, 162, 0, 0.6],
  cast: [131, 158, 0, 0.6],
  flick: [133, 158, 0, 0.6],
};
export const FLAME_W = 80 * SPRITE_SCALE,
  FLAME_LEN = 120,
  FLAME_FRAMES = 4,
  SMOKE_FRAMES = 4;
export const GRAVITY = 1400,
  DEG_PER_RAD = 180 / Math.PI;
export const randomBetween = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const along = (s: Surface) => (s.x1 - s.x0 > 80 ? randomBetween(s.x0 + 30, s.x1 - 30) : (s.x0 + s.x1) / 2);
