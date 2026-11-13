// Decision logic of the share-link supervisor, free of I/O so it can be tested with a fake clock.
// `step(state, event)` returns the next state and the actions the supervisor must perform.
//
// Rules:
// - After a (re)start of cloudflared and after the Mac wakes up, probe failures are ignored for `graceMs`.
// - Only `failuresToAct` new consecutive failures after the grace period trigger a restart.
// - Restarts are spaced by `backoffMs` and limited to `budget` per `budgetWindowMs`; when the budget is
//   spent the supervisor reports `gave-up` and keeps probing. A user action never resets the backoff:
//   every launch after the first one (switching off and on, `restart`, a crash) takes the next backoff
//   step and is recorded; only automatic restarts are refused once the budget is spent.
// - A probe failure takes the link out of `ready` at once, even inside the grace period (it only stops
//   counting towards a restart there), so a dead URL is never handed out.
// - The link is announced (`ready`) only once the public URL answers and the local resolver knows it,
//   or `systemDnsWaitMs` after it first answered (the Mac's resolver may cache a negative answer).

export const POLICY = Object.freeze({
  graceMs: 90_000,
  failuresToAct: 3,
  backoffMs: [30_000, 60_000, 120_000],
  budget: 3,
  budgetWindowMs: 15 * 60_000,
  systemDnsWaitMs: 90_000,
});

export function initialState() {
  return {
    status: "off", // off | starting | checking | ready | degraded | restarting | gave-up
    url: null,
    since: null,
    graceUntil: 0,
    failures: 0,
    attempt: 0, // restarts within the current incident; selects the backoff step
    restarts: [], // timestamps of restarts, for the budget
    nextRestartAt: 0,
    pending: null, // waiting for the backoff: "start" (switched on), "restart" (automatic), "manual" (asked for)
    launches: 0, // cloudflared launches in this lab session
    firstOkAt: null,
    localDns: false,
    lastError: null,
  };
}

const running = (s) => s.status !== "off";

function set(state, patch, now) {
  const next = { ...state, ...patch };
  if (patch.status && patch.status !== state.status) next.since = now;
  return next;
}

// Launch cloudflared now. Every launch but the first is a relaunch: it is recorded for the budget and
// moves the backoff one step, whatever caused it.
function launch(state, now) {
  const relaunch = state.launches > 0;
  const restarts = relaunch ? [...inWindow(state.restarts, now), now] : state.restarts;
  const attempt = relaunch ? state.attempt + 1 : state.attempt;
  const backoff = relaunch ? POLICY.backoffMs[Math.min(attempt - 1, POLICY.backoffMs.length - 1)] : 0;
  return {
    state: set(
      state,
      {
        status: "starting",
        url: null,
        graceUntil: now + POLICY.graceMs,
        failures: 0,
        attempt,
        restarts,
        nextRestartAt: Math.max(state.nextRestartAt, now + backoff),
        pending: null,
        launches: state.launches + 1,
        firstOkAt: null,
        localDns: false,
      },
      now,
    ),
    actions: ["kill", "spawn"],
  };
}

function inWindow(restarts, now) {
  return restarts.filter((at) => now - at < POLICY.budgetWindowMs);
}

// A restart is wanted: run it now if backoff and budget allow, otherwise wait or give up.
function requestRestart(state, now, { manual }) {
  const restarts = inWindow(state.restarts, now);
  if (!manual && restarts.length >= POLICY.budget) return { state: set(state, { status: "gave-up", restarts, pending: null }, now), actions: [] };
  if (now < state.nextRestartAt) return { state: set(state, { status: "restarting", restarts, pending: manual ? "manual" : "restart" }, now), actions: [] };
  return launch({ ...state, restarts }, now);
}

export function step(state, event) {
  const { now } = event;
  switch (event.type) {
    case "enable":
      if (running(state)) return { state, actions: [] }; // already on: nothing to reset
      if (now < state.nextRestartAt) return { state: set(state, { status: "restarting", pending: "start", failures: 0, url: null }, now), actions: [] };
      return launch(state, now);
    case "disable":
      if (!running(state)) return { state, actions: [] };
      // Keep the restart history and the backoff: switching off and on again is a user action, too.
      return { state: set(state, { status: "off", url: null, failures: 0, pending: null, firstOkAt: null, localDns: false }, now), actions: ["kill"] };
    case "url":
      if (!running(state)) return { state, actions: [] };
      return { state: { ...state, url: event.url }, actions: [] };
    case "exited":
      // The process is gone: no point in waiting for probe failures.
      if (!running(state) || state.status === "restarting") return { state, actions: [] };
      return requestRestart(set(state, { lastError: event.reason ?? "cloudflared exited", url: null }, now), now, { manual: false });
    case "wake":
      if (!running(state) || state.status === "restarting") return { state, actions: [] };
      return {
        state: set(
          state,
          { graceUntil: Math.max(state.graceUntil, now + POLICY.graceMs), failures: 0, firstOkAt: null, localDns: false, status: state.status === "gave-up" ? "gave-up" : "checking" },
          now,
        ),
        actions: ["probe"],
      };
    case "restart":
      if (!running(state)) return { state, actions: [] };
      // Already queued: the backoff stands, but an automatic restart becomes one the user asked for.
      if (state.status === "restarting") return { state: state.pending === "restart" ? { ...state, pending: "manual" } : state, actions: [] };
      return requestRestart(state, now, { manual: true });
    case "tick":
      if (state.status === "restarting" && state.pending && now >= state.nextRestartAt) {
        return launch(state, now);
      }
      return { state, actions: [] };
    case "probe":
      return probe(state, event);
    default:
      throw new Error(`Unknown event ${event.type}`);
  }
}

function probe(state, { now, ok, localDns, error }) {
  if (!running(state)) return { state, actions: [] };
  if (state.status === "restarting") {
    // The old process still runs while the backoff passes; if it recovers by itself, keep it (unless the
    // user asked for a new link).
    if (ok && localDns && state.url && state.pending === "restart")
      return { state: set(state, { status: "ready", pending: null, failures: 0, attempt: 0, localDns: true, lastError: null }, now), actions: [] };
    return { state, actions: [] };
  }
  if (ok && state.url) {
    const firstOkAt = state.firstOkAt ?? now;
    const linkWorks = localDns || now - firstOkAt >= POLICY.systemDnsWaitMs;
    const patch = { failures: 0, firstOkAt, localDns: !!localDns, lastError: null };
    if (!linkWorks)
      return {
        state: set(state, { ...patch, status: state.status === "ready" ? "ready" : state.status === "gave-up" ? "gave-up" : state.status === "checking" ? "checking" : "starting" }, now),
        actions: [],
      };
    return { state: set(state, { ...patch, status: "ready", attempt: 0 }, now), actions: [] };
  }
  const reason = error ?? (state.url ? "public link does not answer" : "no public URL yet");
  if (now < state.graceUntil) return { state: set(state, { lastError: reason, firstOkAt: null, localDns: false, status: state.status === "ready" ? "checking" : state.status }, now), actions: [] };
  const failures = state.failures + 1;
  const degraded = set(state, { failures, lastError: reason, firstOkAt: null, status: state.status === "gave-up" ? "gave-up" : "degraded" }, now);
  if (failures < POLICY.failuresToAct) return { state: degraded, actions: [] };
  return requestRestart({ ...degraded, failures: 0 }, now, { manual: false });
}

// What the app and the CLI may show: the URL is only handed out while it works.
export function publicView(state) {
  return {
    status: state.status,
    linkReady: state.status === "ready",
    url: state.url,
    since: state.since,
    failures: state.failures,
    graceUntil: state.graceUntil || null,
    nextRestartAt: state.nextRestartAt || null,
    restartsInWindow: state.restarts.length,
    launches: state.launches,
    pending: state.pending,
    localDns: state.localDns,
    lastError: state.lastError,
  };
}
