import { spawn } from "node:child_process";

const port = process.env.PORT ?? process.env.WHITEBOARD_STUDIO_SHARE_PORT ?? "4173";
const origin = `http://127.0.0.1:${port}`;
const children = [];

function run(command, args) {
  const child = spawn(command, args, { stdio: "inherit", env: { ...process.env, PORT: port } });
  children.push(child);
  return child;
}

function stop(signal = "SIGTERM") {
  for (const child of children) if (!child.killed) child.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

const app = run("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", port]);

for (let attempt = 0; attempt < 120; attempt++) {
  try {
    const response = await fetch(origin);
    if (response.ok || response.status < 500) break;
  } catch {
    /* server not accepting connections yet; retry on the next poll */
  }
  if (app.exitCode !== null) process.exit(app.exitCode ?? 1);
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.log(`\nStarting public Cloudflare Tunnel for ${origin} ...\n`);
const tunnel = run("cloudflared", ["tunnel", "--url", origin, "--no-autoupdate"]);

const exitCode = await new Promise((resolve) => {
  app.once("exit", (code) => resolve(code ?? 1));
  tunnel.once("exit", (code) => resolve(code ?? 1));
});
stop();
process.exit(exitCode);
