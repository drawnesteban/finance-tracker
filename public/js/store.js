// Saving to the server. get() is instant from memory; set() updates memory and
// sends the value to the server shortly after, one request per key.
const mem = {};
const timers = {};
const listeners = new Set();
let pending = 0;
let failed = false;

const notify = () => listeners.forEach((fn) => fn({ pending, failed }));

export async function loadAll() {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`The server answered ${res.status}.`);
  Object.assign(mem, await res.json());
  return mem;
}

export const get = (key, fallback) => (key in mem ? mem[key] : fallback);

async function flush(key) {
  delete timers[key];
  try {
    const res = await fetch(`/api/state/${key}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mem[key]) });
    if (!res.ok) throw new Error(res.status);
    failed = false;
  } catch {
    failed = true;
  }
  pending--;
  notify();
}

export function set(key, value) {
  mem[key] = value;
  if (!timers[key]) { pending++; notify(); }
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => flush(key), 400);
}

export const onStatus = (fn) => listeners.add(fn);
export const hasData = () => Object.keys(mem).length > 0;
