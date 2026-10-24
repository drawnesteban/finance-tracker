// Finance Tracker server: serves the app, keeps its data as JSON files on disk,
// and publishes recurring bills as a calendar feed. No npm packages; Node 22 or newer.
import http from "node:http";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = +process.env.PORT || 4440;
const DATA_ROOT = path.resolve(process.env.DATA_ROOT || "/data");
const PUBLIC = path.resolve(process.env.PUBLIC_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "public"));
const STATE = path.join(DATA_ROOT, "state");
const BACKUPS = path.join(DATA_ROOT, "backups");
const MAX_JSON = 20 * 1024 * 1024;
const KEY_RE = /^fin\.[a-zA-Z]+$/;
const MIME = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8",
  json: "application/json", svg: "image/svg+xml", png: "image/png", ico: "image/x-icon",
};

// ---------- storage ----------

async function writeAtomic(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}

async function readState() {
  const out = {};
  let names = [];
  try { names = await fsp.readdir(STATE); } catch {}
  for (const n of names) {
    const key = n.slice(0, -5);
    if (!n.endsWith(".json") || !KEY_RE.test(key)) continue;
    try { out[key] = JSON.parse(await fsp.readFile(path.join(STATE, n), "utf8")); } catch {}
  }
  return out;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

// ---------- calendar feed ----------

const ics = (s) => String(s).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
// Lines longer than 75 bytes are folded, as the iCalendar format requires.
function fold(line) {
  const out = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) { out.push(cur); cur = ""; }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const ymd = (y, m, d) => `${y}${String(m + 1).padStart(2, "0")}${String(d).padStart(2, "0")}`;
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

// Days 29 to 31 don't exist in every month; "the last of 28..day" lands on the month's last day instead of skipping it.
const byDay = (d) => (d > 28 ? `BYMONTHDAY=${Array.from({ length: d - 27 }, (_, i) => 28 + i).join(",")};BYSETPOS=-1` : `BYMONTHDAY=${d}`);

function calendar(state) {
  const bills = state["fin.bills"] || [];
  const cats = state["fin.categories"] || [];
  const y = new Date().getFullYear();
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Finance Tracker//Bills//EN", "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Bills", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"];
  for (const b of bills) {
    const d = +b.day;
    if (!d || d < 1 || d > 31 || b.rep === "Weekly") continue;
    const mon = +b.mon || 0;
    let start, rule;
    if (b.rep === "Yearly") {
      start = ymd(y, mon, Math.min(d, daysIn(y, mon)));
      rule = `FREQ=YEARLY;BYMONTH=${mon + 1};BYMONTHDAY=${Math.min(d, daysIn(2023, mon))}`;
    } else if (b.rep === "Every 3 months") {
      start = ymd(y, mon, Math.min(d, daysIn(y, mon)));
      rule = `FREQ=MONTHLY;INTERVAL=3;${byDay(d)}`;
    } else {
      start = ymd(y, 0, d);
      rule = `FREQ=MONTHLY;${byDay(d)}`;
    }
    const cat = cats.find((c) => c.id === b.cat);
    const amount = `$${(+b.amt || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    lines.push("BEGIN:VEVENT", `UID:bill-${b.id}@finance-tracker.local`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${start}`, `RRULE:${rule}`,
      `SUMMARY:${ics(`${b.name} ${amount}`)}`, `DESCRIPTION:${ics(`${cat ? cat.name + " · " : ""}${b.rep}`)}`, "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${ics(`${b.name} is due tomorrow`)}`, "TRIGGER:-PT15H", "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ---------- http ----------

function send(res, code, body, type = "application/json", extra = {}) {
  const data = type === "application/json" && typeof body !== "string" ? JSON.stringify(body) : body;
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", ...extra });
  res.end(data);
}

const httpError = (code, message) => Object.assign(new Error(message), { code });

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_JSON) throw httpError(413, "That's too large.");
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"); } catch { throw httpError(400, "That isn't valid JSON."); }
}

async function serveStatic(res, p) {
  const rel = p === "/" ? "index.html" : decodeURIComponent(p).replace(/^\/+/, "");
  const file = path.resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, { error: "Not found" });
  try {
    const data = await fsp.readFile(file);
    send(res, 200, data, MIME[path.extname(file).slice(1)] || "application/octet-stream", { "Cache-Control": "no-cache" });
  } catch { send(res, 404, { error: "Not found" }); }
}

async function handle(req, res) {
  const { pathname: p } = new URL(req.url, "http://x");
  const m = req.method;

  if (p === "/api/state" && m === "GET") return send(res, 200, await readState());

  const key = p.match(/^\/api\/state\/(fin\.[a-zA-Z]+)$/);
  if (key && m === "PUT") {
    const value = await readJson(req);
    await writeAtomic(path.join(STATE, `${key[1]}.json`), JSON.stringify(value, null, 2));
    return send(res, 200, { ok: true });
  }

  if (p === "/api/backup" && m === "GET") {
    const body = JSON.stringify({ app: "finance-tracker", version: 1, exported: new Date().toISOString(), state: await readState() }, null, 2);
    return send(res, 200, body, "application/json", { "Content-Disposition": `attachment; filename="finance-backup-${stamp().slice(0, 10)}.json"` });
  }

  if (p === "/api/restore" && m === "POST") {
    const backup = await readJson(req);
    if (!backup || backup.app !== "finance-tracker" || typeof backup.state !== "object") throw httpError(400, "That isn't a Finance Tracker backup.");
    const keys = Object.keys(backup.state).filter((k) => KEY_RE.test(k));
    if (!keys.length) throw httpError(400, "That backup is empty.");
    // Keep a copy of what's being replaced.
    await writeAtomic(path.join(BACKUPS, `before-restore-${stamp()}.json`),
      JSON.stringify({ app: "finance-tracker", version: 1, exported: new Date().toISOString(), state: await readState() }, null, 2));
    let names = [];
    try { names = await fsp.readdir(STATE); } catch {}
    for (const n of names) if (n.endsWith(".json")) await fsp.unlink(path.join(STATE, n));
    for (const k of keys) await writeAtomic(path.join(STATE, `${k}.json`), JSON.stringify(backup.state[k], null, 2));
    return send(res, 200, { ok: true, keys: keys.length });
  }

  if ((p === "/calendar.ics" || p === "/bills.ics") && m === "GET") {
    return send(res, 200, calendar(await readState()), "text/calendar; charset=utf-8", { "Content-Disposition": 'inline; filename="bills.ics"' });
  }

  if (m === "GET" && !p.startsWith("/api/")) return serveStatic(res, p);
  send(res, 404, { error: "Not found" });
}

http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    if (!e.code || typeof e.code !== "number") console.error(e);
    send(res, typeof e.code === "number" ? e.code : 500, { error: e.message || "Something went wrong." });
  });
}).listen(PORT, () => console.log(`Finance Tracker on http://localhost:${PORT} (data in ${DATA_ROOT})`));
