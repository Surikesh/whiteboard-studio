// Base URL of the running app for CLI scripts and test:live. Defaults to what `npm start` prints first;
// set TLDRAW_LAB_URL when it picked another port. LIVE_BASE_URL and TLDRAW_PORT remain as older aliases.
export function labBaseUrl(env = process.env) {
  const url = env.TLDRAW_LAB_URL || env.LIVE_BASE_URL || (env.TLDRAW_PORT ? `http://localhost:${env.TLDRAW_PORT}` : "http://localhost:3000");
  return url.replace(/\/+$/, "");
}
