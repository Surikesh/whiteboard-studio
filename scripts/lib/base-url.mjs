// Base URL of the running app for CLI scripts and test:live. Defaults to what `npm start` prints first;
// set WHITEBOARD_STUDIO_URL when it picked another port.
export function labBaseUrl(env = process.env) {
  const url = env.WHITEBOARD_STUDIO_URL || "http://localhost:3000";
  return url.replace(/\/+$/, "");
}
