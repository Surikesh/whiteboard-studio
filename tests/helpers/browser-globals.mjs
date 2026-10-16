// Evaluated before tldraw is imported. tldraw opens a BroadcastChannel at module load, which keeps the node
// test process alive forever.
globalThis.BroadcastChannel = class {
  postMessage() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
};
