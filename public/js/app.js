// Finance Tracker: every screen is drawn from the saved lists below.
import * as store from "./store.js";
import { seed } from "./seed.js";

const $ = (id) => document.getElementById(id);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmt = (n) => (n < 0 ? "−$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-US");
const fmt2 = (n) => (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
const num = (v) => { const x = parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(x) ? x : 0; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const has = (v) => v !== undefined && v !== null && v !== "";
const palette = ["#9B30D9", "#E03E8B", "#2F9E77", "#4C6EF5", "#E8833A", "#D6453D", "#E0A800", "#1098AD"];
// crypto.randomUUID only exists on https or localhost, and this app is also opened over the home network.
const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- data ----------

const KEYS = { accts: "fin.accounts", income: "fin.income", cats: "fin.categories", bills: "fin.bills", goals: "fin.goals" };
const D = {};
function load() {
  for (const [k, key] of Object.entries(KEYS)) D[k] = store.get(key, []);
  D.months = store.get("fin.months", {});
  D.ledger = store.get("fin.ledger", { people: [], entries: [] });
  D.settings = store.get("fin.settings", { taxRules: "current" });
  D.projects = store.get("fin.projects", []);
}
const save = (k) => {
  if (KEYS[k]) store.set(KEYS[k], D[k]);
  else if (k === "people") store.set("fin.ledger", D.ledger);
  else store.set(`fin.${k}`, D[k]);
};

const today = new Date();
const TODAY = { y: today.getFullYear(), m: today.getMonth(), d: today.getDate() };
let y = TODAY.y, m = TODAY.m;
const keyOf = (yy, mm) => `${yy}-${String(mm + 1).padStart(2, "0")}`;
const curKey = () => keyOf(y, m);
const prevKey = () => (m ? keyOf(y, m - 1) : keyOf(y - 1, 11));
const isFuture = (yy = y, mm = m) => yy > TODAY.y || (yy === TODAY.y && mm > TODAY.m);
function rec(key, create) {
  if (!D.months[key] && create) D.months[key] = { saved: false, balances: {}, income: {}, spend: {}, note: "" };
  return D.months[key];
}
// Left over for a month: income received minus spending entered. Money moved to a
// savings goal is kept per month in toGoals, so each goal's total is its starting
// amount plus everything moved into it.
function leftover(key) {
  const r = rec(key);
  const vals = (o) => Object.values(o || {}).filter(has);
  const inc = vals(r?.income), sp = vals(r?.spend);
  const moved = Object.values(r?.toGoals || {}).reduce((t, v) => t + num(v), 0);
  const left = inc.reduce((t, v) => t + num(v), 0) - sp.reduce((t, v) => t + num(v), 0);
  return { known: !!(inc.length || sp.length), income: inc.reduce((t, v) => t + num(v), 0), spend: sp.reduce((t, v) => t + num(v), 0), left, moved, free: left - moved };
}
const goalSaved = (g) => num(g.saved) + Object.values(D.months).reduce((t, r) => t + num(r.toGoals?.[g.id]), 0);
// The "move to savings" form, shown in the check-in and in the Savings goals card.
function allocForm(where) {
  if (!D.goals.length) return `<p class="note">Add a savings goal on Overview to move money into it.</p>`;
  if (isFuture()) return "";
  const L = leftover(curKey());
  return `<div class="alloc" data-alloc="${where}"><select class="select">${D.goals.map((g) => `<option value="${g.id}">${esc(g.name || "Untitled")}</option>`).join("")}</select><input class="input short" inputmode="decimal" placeholder="Amount" value="${L.free > 0 ? L.free.toFixed(2) : ""}"><button class="btn small" type="button" data-alloc-go="${where}">Move to savings</button></div>`;
}

// The newest balance on or before a month: from a check-in, or the opening balance if there isn't one yet.
function latestBalance(a, upto = curKey()) {
  const keys = Object.keys(D.months).filter((k) => k <= upto).sort().reverse();
  for (const k of keys) { const v = D.months[k].balances?.[a.id]; if (has(v)) return { v: num(v), key: k }; }
  return has(a.opening) && a.opening !== 0 ? { v: num(a.opening), key: null } : null;
}
const monthName = (key) => `${MONTHS[+key.slice(5) - 1]} ${key.slice(0, 4)}`;
const lastSaved = () => Object.keys(D.months).filter((k) => D.months[k].saved).sort().pop();

const PER_YEAR = { Weekly: 52, Monthly: 12, "Every 3 months": 4, Yearly: 1 };
const perYear = (b) => num(b.amt) * PER_YEAR[b.rep];
const catOf = (cid) => D.cats.find((c) => c.id === cid) || { id: "", name: "Uncategorized", c: "#a3a3a8" };
const billsOut = () => D.bills.reduce((t, b) => t + perYear(b), 0);
const incomeExpected = () => D.income.reduce((t, i) => t + num(i.monthly) * num(i.months), 0);

// ---------- editable lists ----------

const editing = { accts: false, income: false, cats: false, bills: false, goals: false, people: false };
const blank = {
  accts: () => ({ name: "", type: "Credit", earns: "", limit: 0, rkind: "Cash back", rewards: 0, cpp: 1 }),
  income: () => ({ name: "", kind: "Employee", monthly: 0, months: 0 }),
  cats: () => ({ name: "", plan: 0, meta: "" }),
  bills: () => ({ name: "", cat: D.cats[0]?.id || "", rep: "Monthly", amt: 0, day: 0, mon: 0 }),
  goals: () => ({ name: "", target: 0, saved: 0 }),
};
const notes = {
  accts: ["The balance from your bank app.", "Rename, change the type, add an account, or remove one you closed. Saved months keep their balances."],
  cards: ["What you owe: the statement balance from each card's app. Limit and available are for reference.", "Rename, set the limit, add a card, or remove one you closed. Saved months keep their balances."],
  income: ["Placeholders are the expected amounts. Type what actually arrived.", "Rename, set what you expect per month and for how many months, or remove a source."],
  cats: ["Totals from statements, not each purchase.", "Rename, set the monthly plan, or remove a category. Its bills become Uncategorized."],
  bills: ["Per month spreads weekly, quarterly and yearly bills evenly, so the monthly total is what to set aside.", "Rename, change category, how often it repeats, amount or due day, or remove a bill you cancelled."],
};
const listOf = (l) => (l === "people" ? D.ledger.people : D[l]);
const xBtn = (l, n, name) => `<td class="num"><button class="x-btn" type="button" data-list="${l}" data-del="${n}" aria-label="Remove ${esc(name)}">✕</button></td>`;
const field = (l, n, f, v, cls = "input short", ph = "") => `<input class="${cls}" data-list="${l}" data-n="${n}" data-f="${f}" value="${esc(v)}" placeholder="${ph}"${cls.includes("short") ? ' inputmode="decimal"' : ""}>`;
const select = (l, n, f, opts, cur) => `<select class="select" data-list="${l}" data-n="${n}" data-f="${f}">${opts.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur) ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
const dotName = (i) => `<span class="dotname"><span class="dot" style="background:${i.c}"></span><span class="name">${esc(i.name || "Untitled")}</span></span>`;
// Check-in values for the month on screen.
const cv = (kind, iid, v, ph = "0.00") => `<input class="input" inputmode="decimal" data-cv="${kind}" data-id="${iid}" value="${has(v) ? esc(v) : ""}" placeholder="${ph}"${isFuture() ? " disabled" : ""}>`;

const rows = {
  accts: (a, n, ed) => {
    const types = select("accts", n, "type", ["Checking", "Savings", "Credit"].map((t) => [t, t === "Credit" ? "Credit card" : t]), a.type);
    if (ed && a.type !== "Credit") return `<tr><td>${field("accts", n, "name", a.name, "name-input", "Account name")}</td><td>${types}</td>${xBtn("accts", n, a.name)}</tr>`;
    if (ed) return `<tr><td>${field("accts", n, "name", a.name, "name-input", "Card name")}</td><td>${types}</td><td>${field("accts", n, "earns", a.earns, "name-input", "Earns on")}</td><td class="num">${field("accts", n, "limit", a.limit || "", "input short", "Limit")}</td>${xBtn("accts", n, a.name)}</tr>`;
    const r = rec(curKey()), p = rec(prevKey());
    const last = p?.balances?.[a.id];
    const cur = r?.balances?.[a.id];
    if (a.type === "Credit") return `<tr><td>${dotName(a)}</td><td class="num meta">${num(a.limit) ? fmt(num(a.limit)) : "—"}</td><td class="num meta">${has(last) ? fmt2(num(last)) : "—"}</td><td class="num">${cv("balances", a.id, cur)}</td><td class="num meta" data-avail="${a.id}">${num(a.limit) && has(cur) ? fmt(num(a.limit) - num(cur)) : "—"}</td></tr>`;
    return `<tr><td>${dotName(a)}</td><td class="num meta">${has(last) ? fmt2(num(last)) : "—"}</td><td class="num">${cv("balances", a.id, cur)}</td></tr>`;
  },
  income: (i, n, ed) => ed
    ? `<tr><td>${field("income", n, "name", i.name, "name-input", "Source name")}</td><td class="num">${field("income", n, "monthly", i.monthly)}</td><td class="num">${field("income", n, "months", i.months)}</td>${xBtn("income", n, i.name)}</tr>`
    : `<tr><td>${dotName(i)}</td><td class="num">${cv("income", i.id, rec(curKey())?.income?.[i.id], num(i.monthly).toFixed(2))}</td></tr>`,
  cats: (c, n, ed) => ed
    ? `<tr><td>${field("cats", n, "name", c.name, "name-input", "Category name")}</td><td class="num">${field("cats", n, "plan", c.plan)}</td>${xBtn("cats", n, c.name)}</tr>`
    : `<tr><td>${dotName(c)}</td><td class="num meta">${num(c.plan) ? fmt(num(c.plan)) : "—"}</td><td class="num">${cv("spend", c.id, rec(curKey())?.spend?.[c.id])}</td></tr>`,
  bills: (b, n, ed) => {
    const c = catOf(b.cat);
    if (ed) return `<tr><td>${field("bills", n, "name", b.name, "name-input", "Bill name")}</td><td>${select("bills", n, "cat", D.cats.map((k) => [k.id, k.name || "Untitled"]), b.cat)}</td><td>${select("bills", n, "rep", Object.keys(PER_YEAR).map((r) => [r, r]), b.rep)}</td><td class="num">${field("bills", n, "amt", b.amt)}</td><td><span class="due-in">${b.rep === "Weekly" ? '<span class="meta">—</span>' : field("bills", n, "day", b.day || "", "input short", "day")}${b.rep === "Yearly" || b.rep === "Every 3 months" ? select("bills", n, "mon", MONTHS.map((x, k) => [k, x.slice(0, 3)]), b.mon || 0) : ""}</span></td>${xBtn("bills", n, b.name)}</tr>`;
    return `<tr><td class="name">${esc(b.name || "Untitled")}</td><td><span class="dotname"><span class="dot" style="background:${c.c}"></span>${esc(c.name)}</span></td><td class="meta">${b.rep}</td><td class="meta">${dueText(b)}</td><td class="num">${fmt2(num(b.amt))}</td><td class="num">${fmt(perYear(b) / 12)}</td><td class="num">${fmt(perYear(b))}</td></tr>`;
  },
};
const heads = {
  accts: (ed) => (ed ? `<tr><th>Account</th><th>Type</th><th></th></tr>` : `<tr><th>Account</th><th class="num">Last month</th><th class="num">${MONTHS[m].slice(0, 3)}</th></tr>`),
  cards: (ed) => (ed ? `<tr><th>Card</th><th>Type</th><th>Earns on</th><th class="num">Limit</th><th></th></tr>` : `<tr><th>Card</th><th class="num">Limit</th><th class="num">Last month</th><th class="num">Owed in ${MONTHS[m].slice(0, 3)}</th><th class="num">Available</th></tr>`),
  income: (ed) => (ed ? `<tr><th>Source</th><th class="num">Per month</th><th class="num">Months</th><th></th></tr>` : ""),
  cats: (ed) => (ed ? `<tr><th>Category</th><th class="num">Plan / mo</th><th></th></tr>` : `<tr><th>Category</th><th class="num">Plan</th><th class="num">Actual</th></tr>`),
  bills: (ed) => (ed ? `<tr><th>Bill</th><th>Category</th><th>Repeats</th><th class="num">Amount</th><th>Due day</th><th></th></tr>` : `<tr><th>Bill</th><th>Category</th><th>Repeats</th><th>Due</th><th class="num">Amount</th><th class="num">Per month</th><th class="num">Per year</th></tr>`),
};

// Card rewards. Points convert to cash at cpp cents per point; cash back is already dollars.
// Older data kept a cash value in a.points, so it reads as cash back until changed.
const rKind = (a) => a.rkind || "Cash back";
const rAmt = (a) => num(a.rewards ?? a.points);
const rCash = (a) => (rKind(a) === "Points" ? (rAmt(a) * num(a.cpp ?? 1)) / 100 : rAmt(a));
const rText = (a) => (!rAmt(a) ? "—" : rKind(a) === "Points" ? `${Math.round(rAmt(a)).toLocaleString("en-US")} pts<div class="meta">≈ ${fmt2(rCash(a))}</div>` : `${fmt2(rAmt(a))}<div class="meta">cash back</div>`);

function renderRewards() {
  const C = D.accts.map((a, n) => ({ a, n })).filter((x) => x.a.type === "Credit");
  $("rewards-box").hidden = !C.length;
  $("rewards-checkin").innerHTML = `<tr><th>Card</th><th>Kind</th><th class="num">Balance</th><th class="num">¢ per point</th><th class="num">≈ Cash</th></tr>` + C.map(({ a, n }) => {
    const pts = rKind(a) === "Points";
    return `<tr><td>${dotName(a)}</td><td>${select("accts", n, "rkind", [["Points", "Points"], ["Cash back", "Cash back"]], rKind(a))}</td><td class="num">${field("accts", n, "rewards", rAmt(a) || "", "input short", pts ? "Points" : "$")}</td><td class="num">${pts ? field("accts", n, "cpp", a.cpp ?? 1, "input short", "1") : '<span class="meta">—</span>'}</td><td class="num meta" data-rcash="${a.id}">${rAmt(a) ? fmt2(rCash(a)) : "—"}</td></tr>`;
  }).join("");
  renderRewardTotals();
}
// Also called while typing, so it only touches the ≈ Cash cells and the total.
function renderRewardTotals() {
  const C = D.accts.filter((a) => a.type === "Credit");
  C.forEach((a) => { const el = document.querySelector(`[data-rcash="${a.id}"]`); if (el) el.textContent = rAmt(a) ? fmt2(rCash(a)) : "—"; });
  const pts = C.filter((a) => rKind(a) === "Points").reduce((t, a) => t + rAmt(a), 0);
  $("rewards-total").innerHTML = C.length ? `<tr><td colspan="2">Total</td><td class="num">${pts ? `${Math.round(pts).toLocaleString("en-US")} pts` : ""}</td><td></td><td class="num">${fmt2(C.reduce((t, a) => t + rCash(a), 0))}</td></tr>` : "";
}

// Bank accounts and credit cards share one list (D.accts) but get their own tables.
function renderAccts() {
  const ed = editing.accts, r = rec(curKey());
  const rowsOf = (cards) => D.accts.map((a, n) => ((a.type === "Credit") === cards ? rows.accts(a, n, ed) : "")).join("");
  const banks = rowsOf(false), cards = rowsOf(true);
  const empty = (w) => `<tr><td class="empty-line" colspan="5">No ${w} yet. Use Edit to add one.</td></tr>`;
  $("accts-checkin").innerHTML = heads.accts(ed) + (banks || (ed ? "" : empty("accounts")));
  $("cards-checkin").innerHTML = heads.cards(ed) + (cards || (ed ? "" : empty("cards")));
  renderCardTotals();
  renderRewards();
  document.querySelectorAll('[data-add="accts"]').forEach((b) => (b.hidden = !ed));
  document.querySelectorAll('[data-edit="accts"]').forEach((b) => (b.textContent = ed ? "Done" : "Edit"));
  document.querySelector('[data-note="accts"]').textContent = notes.accts[ed ? 1 : 0];
  document.querySelector('[data-note="cards"]').textContent = notes.cards[ed ? 1 : 0];
}

// Also called while typing a balance, so it only touches the totals and the Available cells.
function renderCardTotals() {
  const r = rec(curKey()), C = D.accts.filter((a) => a.type === "Credit");
  const limit = C.reduce((t, a) => t + num(a.limit), 0);
  const owed = C.reduce((t, a) => t + num(r?.balances?.[a.id]), 0);
  const anyOwed = C.some((a) => has(r?.balances?.[a.id]));
  C.forEach((a) => { const el = document.querySelector(`[data-avail="${a.id}"]`), v = r?.balances?.[a.id]; if (el) el.textContent = num(a.limit) && has(v) ? fmt(num(a.limit) - num(v)) : "—"; });
  $("cards-checkin-total").innerHTML = !editing.accts && C.length ? `<tr><td>Total</td><td class="num">${fmt(limit)}</td><td></td><td class="num">${anyOwed ? fmt2(owed) : "—"}</td><td class="num">${anyOwed ? fmt(limit - owed) : "—"}</td></tr>` : "";
}

function renderList(l) {
  if (l === "accts") return renderAccts();
  const ed = editing[l];
  $(l + "-checkin").innerHTML = heads[l](ed) + D[l].map((i, n) => rows[l](i, n, ed)).join("") + (!D[l].length && !ed ? `<tr><td class="empty-line">Nothing here yet. Use Edit to add one.</td></tr>` : "");
  document.querySelector(`[data-add="${l}"]`).hidden = !ed;
  document.querySelector(`[data-edit="${l}"]`).textContent = ed ? "Done" : "Edit";
  document.querySelector(`[data-note="${l}"]`).textContent = notes[l][ed ? 1 : 0];
}

// ---------- overview ----------

function renderOverview(skipGoals) {
  const A = D.accts;
  $("welcome").hidden = !!(A.length || D.income.length || D.bills.length);
  const bal = A.map((a) => ({ a, b: latestBalance(a) }));
  const known = bal.filter((x) => x.b);
  const cashAccts = known.filter((x) => x.a.type !== "Credit");
  const cards = A.filter((a) => a.type === "Credit");
  const cash = cashAccts.reduce((t, x) => t + x.b.v, 0);
  const owed = known.filter((x) => x.a.type === "Credit").reduce((t, x) => t + x.b.v, 0);
  const limit = cards.reduce((t, a) => t + num(a.limit), 0);
  const income = incomeExpected(), out = billsOut(), margin = (income - out) / 12;
  const anyCheckin = known.some((x) => x.b.key);
  const small = (t) => `<small style="font-size:14px;font-weight:500;color:var(--muted)">${t}</small>`;
  $("stats").innerHTML = `
    <div class="stat"><div class="stat-label">Cash</div><div class="stat-value">${cashAccts.length ? fmt(cash) : "—"}</div><div class="stat-note">${cashAccts.map((x) => esc(x.a.name)).join(", ") || "no balances yet"}${cashAccts.some((x) => !x.b.key) ? " · last known, before check-ins" : ""}</div></div>
    <div class="stat"><div class="stat-label">Owed on cards</div><div class="stat-value${owed > 0 ? " neg" : ""}">${anyCheckin ? fmt(owed) : "—"}</div><div class="stat-note">${cards.length} card${cards.length === 1 ? "" : "s"} · ${fmt(limit)} total limit${anyCheckin && limit ? ` · ${Math.round((owed / limit) * 100)}% used` : ""}</div></div>
    <div class="stat"><div class="stat-label">Net cash</div><div class="stat-value">${anyCheckin ? fmt(cash - owed) : "—"}</div><div class="stat-note">cash minus card debt · available credit isn't counted</div></div>
    <div class="stat"><div class="stat-label">Planned margin</div><div class="stat-value ${margin >= 0 ? "good" : "neg"}">${fmt(margin)}${small("/mo")}</div><div class="stat-note">${fmt(income)} in − ${fmt(out)} out, per year</div></div>`;

  const r = rec(curKey());
  $("spend-overview").innerHTML = D.cats.filter((c) => num(c.plan) || has(r?.spend?.[c.id])).map((c) => {
    const act = num(r?.spend?.[c.id]), plan = num(c.plan);
    const pct = plan ? Math.round((act / plan) * 100) : act ? 100 : 0, over = plan ? act > plan : act > 0;
    return `<li class="row"><span class="swatch" style="background:${c.c}"></span><div><div class="name">${esc(c.name || "Untitled")}</div><div class="meta">${esc(c.meta)}</div></div><div class="progress"><span style="width:${Math.min(pct, 100)}%;background:${over ? "var(--danger)" : c.c}"></span></div><span class="pct${over ? " over" : ""}">${plan ? pct + "%" : ""}</span><span class="amt">${has(r?.spend?.[c.id]) ? fmt(act) : "—"} <small>/ ${fmt(plan)}</small></span></li>`;
  }).join("") + (r && Object.keys(r.spend || {}).length ? "" : `<li class="empty-line">No spending entered for ${MONTHS[m]} yet. The bars fill in from the check-in.</li>`);

  // Check-in status for the month on screen.
  const steps = [
    ["Balance for each account", A.length && A.every((a) => has(r?.balances?.[a.id])), A.filter((a) => has(r?.balances?.[a.id])).length + "/" + A.length],
    ["Income received this month", r && Object.values(r.income || {}).some(has)],
    ["Spending per category, from statements", r && Object.values(r.spend || {}).some(has)],
    [`Save ${MONTHS[m]}`, r?.saved],
  ];
  $("checkin-steps").innerHTML = steps.map(([t, done, extra]) => `<li class="todo${done ? " done" : ""}"><span class="box"></span><span>${t}${extra && !done ? ` <span class="meta">${extra}</span>` : ""}</span></li>`).join("");
  const nm = MONTHS[(TODAY.m + 1) % 12];
  $("checkin-when").textContent = isFuture() ? "This month hasn't happened yet." : r?.saved ? `${MONTHS[m]} is saved. Next: the first weekly review of ${nm}.` : `Do it at the first weekly review of the month.`;

  const yearKeys = Object.keys(D.months).filter((k) => k.startsWith(String(y)));
  const received = (iid) => yearKeys.reduce((t, k) => t + num(D.months[k].income?.[iid]), 0);
  $("income-overview").innerHTML = D.income.map((i) => `<li class="row" style="grid-template-columns:4px 1fr auto"><span class="swatch" style="background:${i.c}"></span><div><div class="name">${esc(i.name || "Untitled")}</div><div class="meta">${num(i.months) ? `${fmt(num(i.monthly))} × ${num(i.months)} month${num(i.months) > 1 ? "s" : ""}` : "not counted until it arrives"} · received ${fmt(received(i.id))}</div></div><span class="amt">${fmt(num(i.monthly) * num(i.months))}</span></li>`).join("") || `<li class="empty-line">No income sources yet.</li>`;
  const recTotal = D.income.reduce((t, i) => t + received(i.id), 0);
  $("income-total").innerHTML = `Expected: <b>${fmt(income)}</b>. Received so far in ${y}: <b>${fmt(recTotal)}</b>.`;

  $("ledger-overview").innerHTML = D.ledger.people.map((p) => { const b = personBalance(p.id); return `<li class="row" style="grid-template-columns:34px 1fr auto"><span class="avatar" style="background:${p.c}">${esc((p.name || "?")[0].toUpperCase())}</span><div><div class="name">${esc(p.name || "Untitled")}</div><div class="meta">${plural(D.ledger.entries.filter((e) => e.person === p.id).length, "entry", "entries")}</div></div><span class="amt ${b >= 0 ? "balance-pos" : "balance-neg"}">${fmt2(b)}</span></li>`; }).join("") || `<li class="empty-line">Nobody yet.</li>`;

  if (!skipGoals) renderGoals();

  $("nav-accts").innerHTML = A.map((a) => `<li><span class="dot" style="background:${a.c}"></span>${esc(a.name || "Untitled")}</li>`).join("");
  const latestKey = known.map((x) => x.b.key).filter(Boolean).sort().pop();
  $("accts-asof").textContent = latestKey ? `balances as of ${monthName(latestKey)}` : "no check-in yet";
  const banks = bal.filter((x) => x.a.type !== "Credit"), cardBal = bal.filter((x) => x.a.type === "Credit");
  $("accts-overview").innerHTML = banks.map(({ a, b }) => `<tr><td>${dotName(a)}</td><td><span class="chip">${a.type}</span></td><td class="num">${b ? fmt2(b.v) : "—"}</td></tr>`).join("") || `<tr><td class="empty-line" colspan="3">No bank accounts yet.</td></tr>`;
  $("accts-total").innerHTML = banks.length ? `<tr><td colspan="2">Total</td><td class="num">${cashAccts.length ? fmt2(cash) : "—"}</td></tr>` : "";
  const used = (o, l) => (l ? `${Math.round((o / l) * 100)}%` : "—");
  $("cards-overview").innerHTML = cardBal.map(({ a, b }) => { const l = num(a.limit), o = b ? b.v : null; return `<tr><td>${dotName(a)}</td><td class="meta">${esc(a.earns) || "—"}</td><td class="num">${l ? fmt(l) : "—"}</td><td class="num">${o !== null ? fmt2(o) : "—"}</td><td class="num">${l ? fmt(l - (o || 0)) : "—"}</td><td class="num meta">${o !== null ? used(o, l) : "—"}</td><td class="num${rAmt(a) ? "" : " meta"}">${rText(a)}</td></tr>`; }).join("") || `<tr><td class="empty-line" colspan="7">No credit cards yet.</td></tr>`;
  $("cards-total").innerHTML = cards.length ? `<tr><td colspan="2">Total</td><td class="num">${fmt(limit)}</td><td class="num">${anyCheckin ? fmt2(owed) : "—"}</td><td class="num">${fmt(limit - owed)}</td><td class="num">${anyCheckin ? used(owed, limit) : "—"}</td><td class="num">≈ ${fmt2(cards.reduce((t, a) => t + rCash(a), 0))}</td></tr>` : "";
  $("cards-util").textContent = cards.length && limit ? `${fmt(limit)} total credit · ${used(owed, limit)} used` : "";
}

function renderGoals() {
  const ed = editing.goals;
  $("goals").innerHTML = ed
    ? (D.goals.length ? `<div class="goal-edit goal-head"><span>Goal</span><span>Target</span><span>Saved before</span><span></span></div>` : "") + D.goals.map((g, n) => `<div class="goal-edit">${field("goals", n, "name", g.name, "name-input", "Goal")}${field("goals", n, "target", g.target || "", "input short", "Target")}${field("goals", n, "saved", g.saved || "", "input short", "0")}<button class="x-btn" type="button" data-list="goals" data-del="${n}" aria-label="Remove ${esc(g.name)}">✕</button></div>`).join("")
    : D.goals.map((g) => { const t = num(g.target), s = goalSaved(g), p = t ? Math.min(100, Math.round((s / t) * 100)) : 0; return `<div class="goal" data-goal-open title="Click to edit"><div class="goal-top"><span class="name">${esc(g.name || "Untitled")}</span><span class="amt">${fmt(s)} <small class="meta">/ ${fmt(t)}</small></span></div><div class="progress"><span style="width:${p}%;background:var(--ok)"></span></div></div>`; }).join("") || `<div class="empty">No money goals yet.<br>Write them on your goals sheet first, then add them here with Edit.</div>`;
  const L = leftover(curKey());
  $("goals-pool").innerHTML = ed ? `<p class="note">Target and what was already saved before using this app. Money moved from a check-in adds on top.</p>` : L.known && D.goals.length && !isFuture()
    ? `<div class="pool"><span class="meta">Left over in ${MONTHS[m]}, not yet moved</span><b class="${L.free < 0 ? "neg" : ""}">${fmt2(L.free)}</b></div>${allocForm("overview")}`
    : D.goals.length && !isFuture() ? `<p class="note">Fill in income and spending in the ${MONTHS[m]} check-in to see what's left over to move here.</p>` : "";
  document.querySelector('[data-add="goals"]').hidden = !ed;
  document.querySelector('[data-edit="goals"]').textContent = ed ? "Done" : "Edit";
}

// ---------- check-in ----------

function renderLeftover() {
  const L = leftover(curKey()), r = rec(curKey());
  const planIn = incomeExpected() / 12, planOut = D.cats.reduce((t, c) => t + num(c.plan), 0);
  const act = (v) => (L.known ? fmt2(v) : "—");
  $("leftover-month").textContent = MONTHS[m];
  const moves = Object.entries(r?.toGoals || {}).filter(([, v]) => num(v));
  $("leftover").innerHTML = `<table>
      <tr><th></th><th class="num">Plan, average month</th><th class="num">Actual</th></tr>
      <tr><td>Income received</td><td class="num meta">${fmt(planIn)}</td><td class="num">${act(L.income)}</td></tr>
      <tr><td>Spending</td><td class="num meta">−${fmt(planOut)}</td><td class="num">${L.known ? "−" + fmt2(L.spend) : "—"}</td></tr>
      <tr class="total-row"><td>Left over</td><td class="num">${fmt(planIn - planOut)}</td><td class="num ${L.left < 0 ? "neg" : "good"}">${act(L.left)}</td></tr>
      ${moves.map(([gid, v]) => { const g = D.goals.find((x) => x.id === gid); return `<tr><td class="meta">Moved to ${esc(g?.name || "a removed goal")}</td><td></td><td class="num">−${fmt2(num(v))} <button class="x-btn" type="button" data-unalloc="${gid}" aria-label="Undo">✕</button></td></tr>`; }).join("")}
      ${moves.length ? `<tr class="total-row"><td>Not yet moved</td><td></td><td class="num ${L.free < 0 ? "neg" : ""}">${fmt2(L.free)}</td></tr>` : ""}
    </table>
    ${L.known ? allocForm("checkin") : `<p class="note">Fill in steps 3 and 4 and this works out what's left. Card payments aren't counted separately: spending per category already covers what you charged.</p>`}`;
}

function renderCheckin() {
  ["accts", "income", "cats"].forEach(renderList);
  renderLeftover();
  const r = rec(curKey());
  $("month-note").value = r?.note || "";
  $("month-note").disabled = isFuture();
  const btn = $("save-month");
  btn.disabled = isFuture();
  btn.textContent = isFuture() ? "Can't check in a future month" : r?.saved ? `${MONTHS[m]} saved ✓` : `Save ${MONTHS[m]}`;
}

// ---------- plan ----------

function renderPlan() {
  renderList("bills");
  const income = incomeExpected(), out = billsOut(), margin = (income - out) / 12;
  const monthly = D.bills.filter((b) => b.rep === "Monthly").reduce((t, b) => t + num(b.amt), 0);
  const small = (t) => `<small style="font-size:14px;font-weight:500;color:var(--muted)">${t}</small>`;
  $("plan-stats").innerHTML = `
    <div class="stat"><div class="stat-label">Bills per month</div><div class="stat-value">${fmt(out / 12)}</div><div class="stat-note">${fmt(monthly)} monthly bills + the others spread out</div></div>
    <div class="stat"><div class="stat-label">Bills per year</div><div class="stat-value">${fmt(out)}</div><div class="stat-note">${D.bills.length} recurring bills</div></div>
    <div class="stat"><div class="stat-label">Expected income</div><div class="stat-value">${fmt(income)}</div><div class="stat-note">${fmt(income / 12)} per month on average</div></div>
    <div class="stat"><div class="stat-label">Left after bills</div><div class="stat-value ${margin >= 0 ? "good" : "neg"}">${fmt(margin)}${small("/mo")}</div><div class="stat-note">${fmt(income - out)} per year</div></div>`;
  $("bills-total").innerHTML = editing.bills ? "" : `<tr><td colspan="5">Total</td><td class="num">${fmt(out / 12)}</td><td class="num">${fmt(out)}</td></tr>`;
  const billed = (cid) => D.bills.filter((b) => b.cat === cid).reduce((t, b) => t + perYear(b), 0) / 12;
  const orphan = D.bills.filter((b) => !D.cats.some((c) => c.id === b.cat)).reduce((t, b) => t + perYear(b), 0) / 12;
  $("catplan").innerHTML = `<tr><th>Category</th><th class="num">Bills</th><th class="num">Plan</th></tr>` + D.cats.map((c) => {
    const bl = billed(c.id), plan = num(c.plan);
    return `<tr><td>${dotName(c)}</td><td class="num">${bl ? fmt(bl) : "—"}</td><td class="num${plan < Math.round(bl) ? " under" : ""}">${plan ? fmt(plan) : "—"}</td></tr>`;
  }).join("") + (orphan ? `<tr><td><span class="dotname"><span class="dot" style="background:#a3a3a8"></span>Uncategorized</span></td><td class="num">${fmt(orphan)}</td><td class="num meta">—</td></tr>` : "");
}

// ---------- calendar ----------

const ord = (d) => d + (d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th");
function dueText(b) {
  const d = num(b.day);
  if (b.rep === "Weekly") return "weekly";
  if (!d) return "—";
  if (b.rep === "Yearly") return `${MONTHS[num(b.mon)].slice(0, 3)} ${d}`;
  if (b.rep === "Every 3 months") return `${ord(d)}, from ${MONTHS[num(b.mon)].slice(0, 3)}`;
  return ord(d);
}
function dueIn(b, yy, mm) {
  const d = num(b.day);
  if (!d || b.rep === "Weekly") return 0;
  if (b.rep === "Yearly" && mm !== num(b.mon)) return 0;
  if (b.rep === "Every 3 months" && ((mm - num(b.mon)) % 3 + 3) % 3) return 0;
  return Math.min(d, new Date(yy, mm + 1, 0).getDate());
}
let selDay = TODAY.d;
function renderCalendar() {
  const days = new Date(y, m + 1, 0).getDate();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const byDay = {};
  D.bills.forEach((b) => { const d = dueIn(b, y, m); if (d) (byDay[d] = byDay[d] || []).push(b); });
  if (selDay > days) selDay = days;
  const isToday = (d) => y === TODAY.y && m === TODAY.m && d === TODAY.d;
  const all = Object.values(byDay).flat();
  $("cal-title").innerHTML = `${MONTHS[m]} <span>${y}</span>`;
  $("cal-head").textContent = `${MONTHS[m]} ${y}`;
  $("cal-total").textContent = `${all.length} bill${all.length === 1 ? "" : "s"} due · ${fmt(all.reduce((t, b) => t + num(b.amt), 0))}`;
  let mini = "MTWTFSS".split("").map((c) => `<span class="mini-dow">${c}</span>`).join("") + "<span></span>".repeat(lead);
  for (let d = 1; d <= days; d++) mini += `<button type="button" class="mini-day${isToday(d) ? " today" : ""}${d === selDay ? " sel" : ""}" data-day="${d}"><span>${d}</span><i>${(byDay[d] || []).slice(0, 3).map((b) => `<b style="background:${catOf(b.cat).c}"></b>`).join("")}</i></button>`;
  $("mini").innerHTML = mini;
  const item = (b, pre = "") => `<div class="agenda-item"><b style="background:${catOf(b.cat).c}"></b><span>${esc(b.name)}<small>${pre}${esc(catOf(b.cat).name)} · ${b.rep.toLowerCase()}</small></span><span class="amt" style="flex:none">${fmt2(num(b.amt))}</span></div>`;
  const sel = byDay[selDay] || [];
  const next = [];
  for (let d = selDay + 1; d <= days; d++) (byDay[d] || []).forEach((b) => next.push([d, b]));
  $("agenda").innerHTML = `<section><h4>${MONTHS[m].slice(0, 3)} ${selDay} <span>${sel.length ? fmt(sel.reduce((t, b) => t + num(b.amt), 0)) : ""}</span></h4>${sel.length ? sel.map((b) => item(b)).join("") : '<p class="muted">Nothing due.</p>'}</section>
    <section><h4>Later this month</h4>${next.length ? next.map(([d, b]) => item(b, `${MONTHS[m].slice(0, 3)} ${d} · `)).join("") : '<p class="muted">Nothing else due.</p>'}</section>`;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(`<div class="cal-day out"></div>`);
  for (let d = 1; d <= days; d++) {
    const dow = (lead + d - 1) % 7;
    cells.push(`<div class="cal-day${dow > 4 ? " wknd" : ""}${isToday(d) ? " today" : ""}${d === selDay ? " sel" : ""}" data-day="${d}"><div class="cal-num"><span>${d}</span></div>${(byDay[d] || []).map((b) => `<div class="bill-chip" style="--c:${catOf(b.cat).c}" title="${esc(b.name)} ${fmt2(num(b.amt))}">${esc(b.name)}<em>${fmt(num(b.amt))}</em></div>`).join("")}</div>`);
  }
  while (cells.length % 7) cells.push(`<div class="cal-day out"></div>`);
  let grid = "";
  for (let i = 0; i < cells.length; i += 7) grid += `<div class="cal-week">${cells.slice(i, i + 7).join("")}</div>`;
  $("cal-grid").innerHTML = grid;
  const url = `${location.protocol}//${location.host}/calendar.ics`;
  $("feed-url").textContent = url;
  $("feed-open").href = url.replace(/^https?:/, "webcal:");
}

// ---------- taxes ----------
// Puerto Rico rules, checked October 2026. Withholding per employer annualizes the
// monthly pay and subtracts the personal exemption, the way the payroll tables do.

const TAX_RULES = {
  current: { label: "Current law", exempt: 3500, br: [[9000, 0], [25000, 0.07], [41500, 0.14], [61500, 0.25], [Infinity, 0.33]] },
  ps912: { label: "PS 912 proposal", exempt: 3500, br: [[12500, 0], [25000, 0.06], [50000, 0.12], [100000, 0.24], [150000, 0.29], [Infinity, 0.33]] },
};
const SS = 0.062, MED = 0.0145, SERV = 0.1;
const rules = () => TAX_RULES[D.settings.taxRules] || TAX_RULES.current;
function prTax(x) {
  let t = 0, lo = 0;
  for (const [hi, r] of rules().br) { if (x > lo) t += (Math.min(x, hi) - lo) * r; lo = hi; }
  return t;
}
const bracketOf = (x) => { let lo = 0; for (const [hi, r] of rules().br) { if (x <= hi) return `${Math.round(r * 100)}% band (${fmt(lo)}–${hi === Infinity ? "up" : fmt(hi)})`; lo = hi; } };
const pct = (r) => `${+(r * 100).toFixed(2)}%`;

function renderTaxes() {
  const R = rules(), E = R.exempt;
  document.querySelectorAll("#tax-rules button").forEach((b) => b.classList.toggle("on", TAX_RULES[b.dataset.rules] === R));
  $("rules-note").textContent = R === TAX_RULES.ps912 ? "Not law yet. This shows what would change if it passes." : "";
  const src = D.income.map((i) => {
    const monthly = num(i.monthly), months = num(i.months), pay = monthly * months;
    const w = { ...i, monthly, months, pay, prw: 0, ss: 0, med: 0, ann: 0 };
    if (i.kind === "Services") w.prw = pay * SERV;
    else { w.ann = monthly * 12; w.prw = (prTax(Math.max(0, w.ann - E)) / 12) * months; w.ss = pay * SS; w.med = pay * MED; }
    w.net = pay - w.prw - w.ss - w.med;
    return w;
  });
  const total = src.reduce((t, w) => t + w.pay, 0);
  const withheld = src.reduce((t, w) => t + w.prw, 0);
  const owed = prTax(Math.max(0, total - E));
  const servPay = src.filter((w) => w.kind === "Services").reduce((t, w) => t + w.pay, 0);
  const seTax = servPay * 0.9235 * 0.153;
  const bal = owed - withheld;
  $("tax-stats").innerHTML = `
    <div class="stat"><div class="stat-label">Income ${y}</div><div class="stat-value">${fmt(total)}</div><div class="stat-note">expected, from your income sources</div></div>
    <div class="stat"><div class="stat-label">PR income tax for the year</div><div class="stat-value">${fmt(owed)}</div><div class="stat-note">${total ? ((owed / total) * 100).toFixed(1) : 0}% of income · ${R.label}</div></div>
    <div class="stat"><div class="stat-label">Withheld by payers</div><div class="stat-value">${fmt(withheld)}</div><div class="stat-note">PR income tax only</div></div>
    <div class="stat"><div class="stat-label">${bal >= 0 ? "You'd owe in April" : "Refund"}</div><div class="stat-value ${bal > 0.5 ? "neg" : "good"}">${fmt(Math.abs(bal))}</div><div class="stat-note">before credits${seTax ? ` · plus ${fmt(seTax)} self-employment tax` : ""}</div></div>`;
  $("tax-table").innerHTML = `<tr><th>Source</th><th>Type</th><th class="num">Paid in ${y}</th><th class="num">PR tax withheld</th><th class="num">Social Security</th><th class="num">Medicare</th><th class="num">Take-home</th></tr>` +
    src.map((w, n) => { const sv = w.kind === "Services"; return `<tr><td>${dotName(w)}</td><td>${select("income", n, "kind", [["Employee", "Employee"], ["Services", "Services"]], w.kind || "Employee")}</td><td class="num">${fmt(w.pay)}</td><td class="num">${fmt2(w.prw)}</td><td class="num${sv ? " meta" : ""}">${sv ? "—" : fmt2(w.ss)}</td><td class="num${sv ? " meta" : ""}">${sv ? "—" : fmt2(w.med)}</td><td class="num">${fmt(w.net)}</td></tr>`; }).join("");
  const sum = (f) => src.reduce((t, w) => t + w[f], 0);
  $("tax-foot").innerHTML = `<tr><td colspan="2">Total</td><td class="num">${fmt(total)}</td><td class="num">${fmt2(withheld)}</td><td class="num">${fmt2(sum("ss"))}</td><td class="num">${fmt2(sum("med"))}</td><td class="num">${fmt(sum("net"))}</td></tr>`;
  $("tax-explain").innerHTML = src.filter((w) => w.pay).map((w) => {
    if (w.kind === "Services") return `<li><b>${esc(w.name)}</b>: paid for services, so the payer withholds a flat 10%.<span class="eq">${fmt(w.pay)} × 10% = <b>${fmt2(w.prw)}</b> · no Social Security or Medicare withheld; self-employment tax 15.3% × 92.35% = ${fmt2(w.pay * 0.9235 * 0.153)}, paid by you</span></li>`;
    const tx = Math.max(0, w.ann - E), yr = prTax(tx);
    return `<li><b>${esc(w.name)}</b>: ${fmt(w.monthly)} a month for ${w.months} month${w.months > 1 ? "s" : ""}. The payroll system treats each paycheck as if you earned it all year at that rate.
      <span class="eq">${fmt(w.monthly)} × 12 = ${fmt(w.ann)} − ${fmt(E)} exemption = ${fmt(tx)} → ${bracketOf(tx)} → ${fmt(yr)} a year ÷ 12 = ${fmt2(yr / 12)} a month × ${w.months} = <b>${fmt2(w.prw)} PR tax</b></span>
      <span class="eq">Social Security ${pct(SS)} × ${fmt(w.pay)} = ${fmt2(w.ss)} · Medicare ${pct(MED)} × ${fmt(w.pay)} = ${fmt2(w.med)}</span></li>`;
  }).join("") || "<li>No expected income yet. Add it under Monthly check-in › Income › Edit.</li>";
  const taxable = Math.max(0, total - E);
  const empN = src.filter((w) => w.kind !== "Services" && w.pay).length;
  $("tax-year").innerHTML = `
    <li><b>Add up all income</b><span class="eq">${src.filter((w) => w.pay).map((w) => fmt(w.pay)).join(" + ") || "$0"} = ${fmt(total)}</span></li>
    <li><b>Subtract the personal exemption once</b><span class="eq">${fmt(total)} − ${fmt(E)} = ${fmt(taxable)} taxable</span></li>
    <li><b>Apply the brackets</b><span class="eq">${R.br.filter((_, k) => k === 0 || taxable > R.br[k - 1][0]).map(([hi, r], k) => `${pct(r)} × ${fmt(Math.min(taxable, hi) - (k ? R.br[k - 1][0] : 0))}`).join(" + ")} = ${fmt(owed)}</span></li>
    <li><b>Compare with what was withheld</b><span class="eq">${fmt(owed)} − ${fmt(withheld)} withheld = ${bal >= 0 ? `${fmt(bal)} to pay` : `${fmt(-bal)} back`}</span></li>
    ${empN > 1 ? `<li><b>Why the gap:</b> each of your ${empN} employers subtracts the exemption and applies the 0% band as if it were your only job. Together your income goes past the 0% band, but no single paycheck does.</li>` : ""}`;
  $("tax-forms").innerHTML = src.filter((w) => w.pay).map((w) => w.kind === "Services"
    ? `<div class="form"><h3>${esc(w.name)}</h3><div class="meta">Declaración Informativa 480.6SP</div><dl><dt>Payments for services</dt><dd>${fmt2(w.pay)}</dd><dt>10% withheld</dt><dd>${fmt2(w.prw)}</dd></dl></div>`
    : `<div class="form"><h3>${esc(w.name)}</h3><div class="meta">Formulario 499R-2/W-2PR</div><dl><dt>Wages</dt><dd>${fmt2(w.pay)}</dd><dt>PR income tax withheld</dt><dd>${fmt2(w.prw)}</dd><dt>Social Security wages</dt><dd>${fmt2(w.pay)}</dd><dt>Social Security tax withheld</dt><dd>${fmt2(w.ss)}</dd><dt>Medicare wages</dt><dd>${fmt2(w.pay)}</dd><dt>Medicare tax withheld</dt><dd>${fmt2(w.med)}</dd></dl></div>`).join("");
}

// ---------- ledger ----------

let selPerson = null;
const shortDate = (iso) => { const [yy, mm, dd] = String(iso).split("-").map(Number); return yy && mm ? `${MONTHS[mm - 1].slice(0, 3)} ${dd}, ${yy}` : iso; };
const personBalance = (pid) => D.ledger.entries.filter((e) => e.person === pid).reduce((t, e) => t + (e.dir === "repaid" ? -1 : 1) * num(e.amt), 0);
function renderLedger() {
  const P = D.ledger.people;
  if (!P.some((p) => p.id === selPerson)) selPerson = P[0]?.id || null;
  const ed = editing.people;
  $("people").innerHTML = P.map((p, n) => ed
    ? `<li class="goal-edit" style="grid-template-columns:1fr auto">${field("people", n, "name", p.name, "name-input", "Name")}<button class="x-btn" type="button" data-list="people" data-del="${n}" aria-label="Remove ${esc(p.name)}">✕</button></li>`
    : `<li class="row person${p.id === selPerson ? " on" : ""}" style="grid-template-columns:34px 1fr auto" data-person="${p.id}"><span class="avatar" style="background:${p.c}">${esc((p.name || "?")[0].toUpperCase())}</span><div><div class="name">${esc(p.name || "Untitled")}</div><div class="meta">${plural(D.ledger.entries.filter((e) => e.person === p.id).length, "entry", "entries")}</div></div><span class="amt ${personBalance(p.id) >= 0 ? "balance-pos" : "balance-neg"}">${fmt2(personBalance(p.id))}</span></li>`).join("") || `<li class="empty-line">Add the first person.</li>`;
  document.querySelector('[data-edit="people"]').textContent = ed ? "Done" : "Edit";
  const p = P.find((x) => x.id === selPerson);
  $("entry-form").hidden = !p;
  $("ledger-title").textContent = p ? p.name || "Untitled" : "Ledger";
  const b = p ? personBalance(p.id) : 0;
  $("ledger-balance").innerHTML = p ? `<span class="${b >= 0 ? "balance-pos" : "balance-neg"}">${b >= 0 ? "Owes you" : "You owe"} ${fmt2(Math.abs(b))}</span>` : "";
  const E = D.ledger.entries.filter((e) => e.person === selPerson).sort((a, c) => (a.date < c.date ? 1 : -1));
  let running = b;
  $("entries").innerHTML = p
    ? `<tr><th>Date</th><th>What</th><th>Direction</th><th class="num">Amount</th><th class="num">Balance</th><th></th></tr>` + E.map((e) => {
      const row = `<tr><td class="meta" style="white-space:nowrap">${esc(shortDate(e.date))}</td><td>${esc(e.what)}</td><td><span class="chip">${e.dir === "repaid" ? "Paid back" : "I lent"}</span></td><td class="num">${fmt2(num(e.amt))}</td><td class="num ${running >= 0 ? "balance-pos" : "balance-neg"}">${fmt2(running)}</td><td class="num"><button class="x-btn" type="button" data-entry="${e.id}" aria-label="Delete entry">✕</button></td></tr>`;
      running -= (e.dir === "repaid" ? -1 : 1) * num(e.amt);
      return row;
    }).join("") + (E.length ? "" : `<tr><td class="empty-line" colspan="6">No entries yet.</td></tr>`)
    : `<tr><td class="empty-line">Pick or add a person.</td></tr>`;
  const f = $("entry-form");
  if (!f.date.value) f.date.value = `${TODAY.y}-${String(TODAY.m + 1).padStart(2, "0")}-${String(TODAY.d).padStart(2, "0")}`;
}

// ---------- project costs ----------
// Cash costs, time (hours × what an hour of yours is worth) and money back per project.
// "Paid back" is the first date the money back covers the cash spent.

const COST_TYPES = ["Work hours", "Materials", "Research", "Tools & software", "Travel", "Fees & services", "Other"];
const typeColor = (t) => `var(--series-${Math.max(0, COST_TYPES.indexOf(t)) + 1})`;
const STATUSES = ["Idea", "Active", "Done", "Paused"];
let selProject = null, entryKind = "cost", projEditing = false;
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayIso = isoDay(today);

function projStats(p) {
  const E = p.entries || [];
  const rate = num(p.rate);
  const costs = E.filter((e) => e.kind === "cost");
  const cash = costs.filter((e) => e.type !== "Work hours").reduce((t, e) => t + num(e.amt), 0);
  const hours = costs.filter((e) => e.type === "Work hours").reduce((t, e) => t + num(e.hours), 0);
  const time = hours * rate;
  const income = E.filter((e) => e.kind === "income").reduce((t, e) => t + num(e.amt), 0);
  // Walk the entries in date order to find when the money back caught up.
  let c = 0, ct = 0, inc = 0, paidCash = null, paidAll = null;
  const points = [];
  for (const e of [...E].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    if (e.kind === "income") inc += num(e.amt);
    else if (e.type === "Work hours") ct += num(e.hours) * rate;
    else { c += num(e.amt); ct += num(e.amt); }
    const last = points[points.length - 1];
    if (last && last.date === e.date) Object.assign(last, { cash: c, all: ct, inc });
    else points.push({ date: e.date, cash: c, all: ct, inc });
    // A later cost can push it back under water, so only the last crossing counts.
    if (inc < c) paidCash = null; else if (!paidCash && c > 0) paidCash = e.date;
    if (inc < ct) paidAll = null; else if (!paidAll && ct > 0) paidAll = e.date;
  }
  return { rate, cash, hours, time, income, net: income - cash, trueNet: income - cash - time, perHour: hours ? (income - cash) / hours : null, paidCash, paidAll, points };
}

function projChart(p, st) {
  const el = $("proj-chart");
  if (!st.points.length) { el.innerHTML = `<div class="empty">No entries yet. Add costs and money back below, and this fills in.</div>`; return; }
  const pts = [{ date: p.start || st.points[0].date, cash: 0, all: 0, inc: 0 }, ...st.points.filter((x) => !p.start || x.date >= p.start)];
  if (pts[pts.length - 1].date < todayIso && p.status !== "Done") pts.push({ ...pts[pts.length - 1], date: todayIso, extended: true });
  const W = 640, H = 240, L = 52, R = 112, T = 12, B = 26;
  const t = (d) => new Date(d + "T12:00:00").getTime();
  const x0 = t(pts[0].date), x1 = Math.max(t(pts[pts.length - 1].date), x0 + 864e5);
  // Round the scale to a tidy step (1, 2, 2.5 or 5 × a power of ten) so the axis reads $250, $500…
  const top = Math.max(1, ...pts.map((q) => Math.max(q.all, q.inc)));
  const mag = 10 ** Math.floor(Math.log10(top / 4));
  const tick = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k * 4 >= top);
  const yMax = tick * Math.ceil(top / tick);
  const X = (d) => L + ((t(d) - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - v / yMax) * (H - T - B);
  const step = (f) => pts.map((q, i) => (i ? `H${X(q.date).toFixed(1)}V${Y(q[f]).toFixed(1)}` : `M${X(q.date).toFixed(1)},${Y(q[f]).toFixed(1)}`)).join("");
  const ticks = Array.from({ length: Math.round(yMax / tick) + 1 }, (_, i) => i * tick);
  const nice = (v) => (v >= 1000 ? `$${+(v / 1000).toFixed(v >= 10000 ? 0 : 2)}k` : `$${Math.round(v)}`);
  const months = [];
  for (let d = new Date(x0); d.getTime() <= x1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    if (first.getTime() >= x0) months.push(first);
  }
  const showTime = st.time > 0;
  const series = [
    { f: "inc", name: "Money back", c: "var(--series-1)", dash: false },
    { f: "cash", name: "Cash spent", c: "var(--series-2)", dash: false },
    ...(showTime ? [{ f: "all", name: "Cash + your time", c: "var(--series-2)", dash: true }] : []),
  ];
  // End labels, nudged apart so they don't overlap.
  const ends = series.map((s) => ({ ...s, y: Y(pts[pts.length - 1][s.f]), v: pts[pts.length - 1][s.f] })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
  const pay = st.paidCash ? { x: X(st.paidCash), y: Y(pts.find((q) => q.date >= st.paidCash)?.inc ?? 0) } : null;
  el.innerHTML = `<div class="legend">${series.map((s) => `<span><i class="${s.dash ? "dash" : ""}" style="background:${s.c};border-color:${s.c}"></i>${s.name}</span>`).join("")}</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative cost and money back for ${esc(p.name)}">
      ${ticks.map((v) => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="axis-text" x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${nice(v)}</text>`).join("")}
      ${months.map((d) => `<text class="axis-text" x="${X(isoDay(d))}" y="${H - 6}" text-anchor="middle">${MONTHS[d.getMonth()].slice(0, 3)}</text>`).join("")}
      ${series.map((s) => `<path class="series${s.dash ? " dash" : ""}" d="${step(s.f)}" stroke="${s.c}"/>`).join("")}
      ${pay ? `<circle cx="${pay.x}" cy="${pay.y}" r="6" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2"/><text class="label" x="${pay.x}" y="${pay.y - 12}" text-anchor="middle">Paid back ${shortDate(st.paidCash).replace(/, \d+$/, "")}</text>` : ""}
      ${ends.map((s) => `<text class="label" x="${W - R + 8}" y="${s.y + 4}">${s.name.replace("Cash + your time", "+ time")} ${fmt(s.v)}</text>`).join("")}
      <line class="cross" id="pcross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
      <rect class="hit" id="phit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
    </svg><div class="ptip" id="ptip" hidden></div>`;
  const svg = el.querySelector("svg"), cross = $("pcross"), tip = $("ptip");
  $("phit").addEventListener("mousemove", (ev) => {
    const r = svg.getBoundingClientRect(), sx = ((ev.clientX - r.left) / r.width) * W;
    let q = pts[0];
    for (const c of pts) if (X(c.date) <= sx + 0.5) q = c;
    const cx = X(q.date);
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.innerHTML = `<b>${q.extended ? "Today" : shortDate(q.date)}</b>${series.map((s) => `<div><span><i style="background:${s.c}"></i>${s.name}</span><span>${fmt2(q[s.f])}</span></div>`).join("")}<div><span>Net (cash)</span><span>${fmt2(q.inc - q.cash)}</span></div>`;
    const px = (cx / W) * r.width;
    tip.style.left = `${Math.min(px + 12, r.width - 190)}px`;
    tip.style.top = `${30}px`;
  });
  $("phit").addEventListener("mouseleave", () => { cross.setAttribute("visibility", "hidden"); tip.hidden = true; });
}

function renderProjects() {
  const P = D.projects;
  if (!P.some((p) => p.id === selProject)) selProject = P[0]?.id || null;
  const p = P.find((x) => x.id === selProject);
  $("proj-list").innerHTML = P.map((q) => {
    const st = projStats(q);
    return `<li class="row person${q.id === selProject ? " on" : ""}" style="grid-template-columns:4px 1fr auto" data-project="${q.id}"><span class="swatch" style="background:${q.c}"></span><div><div class="name">${esc(q.name || "Untitled")}</div><div class="meta">${esc(q.status || "Active")} · ${st.hours ? `${+st.hours.toFixed(1)}h · ` : ""}${fmt(st.cash)} spent</div></div><span class="amt ${st.net >= 0 ? "balance-pos" : "balance-neg"}">${fmt(st.net)}</span></li>`;
  }).join("") || `<li class="empty-line">No projects yet. Add one to start tracking what it costs.</li>`;

  const all = P.map((q) => ({ q, st: projStats(q) }));
  $("proj-all").innerHTML = `<tr><th>Project</th><th>Status</th><th class="num">Cash spent</th><th class="num">Hours</th><th class="num">Money back</th><th class="num">Net (cash)</th><th class="num">Earned per hour</th><th>Paid back</th></tr>` +
    all.map(({ q, st }) => `<tr><td>${dotName(q)}</td><td class="meta">${esc(q.status || "Active")}</td><td class="num">${fmt(st.cash)}</td><td class="num">${+st.hours.toFixed(1)}</td><td class="num">${fmt(st.income)}</td><td class="num ${st.net >= 0 ? "balance-pos" : "balance-neg"}">${fmt(st.net)}</td><td class="num">${st.perHour === null ? "—" : fmt2(st.perHour)}</td><td>${st.paidCash ? `<span class="status paid">${shortDate(st.paidCash)}</span>` : st.cash ? `<span class="status owed">${fmt(st.cash - st.income)} to go</span>` : '<span class="meta">—</span>'}</td></tr>`).join("") +
    (P.length ? "" : `<tr><td class="empty-line" colspan="8">Nothing to compare yet.</td></tr>`);

  const off = !p;
  ["proj-edit"].forEach((id) => ($(id).disabled = off));
  $("proj-form").hidden = off;
  if (!p) {
    $("proj-stats").innerHTML = ""; $("proj-chart").innerHTML = `<div class="empty">Add a project to see what it costs and when it pays you back.</div>`;
    $("proj-breakdown").innerHTML = ""; $("proj-entries").innerHTML = ""; $("proj-payback").textContent = ""; $("proj-settings").hidden = true;
    return;
  }
  const st = projStats(p);
  const small = (t) => `<small style="font-size:14px;font-weight:500;color:var(--muted)">${t}</small>`;
  $("proj-chart-title").textContent = p.name || "Untitled";
  $("proj-stats").innerHTML = `
    <div class="stat"><div class="stat-label">Total cost</div><div class="stat-value">${fmt(st.cash + st.time)}</div><div class="stat-note">${fmt(st.cash)} cash + ${fmt(st.time)} of your time (${+st.hours.toFixed(1)}h × ${fmt(st.rate)})</div></div>
    <div class="stat"><div class="stat-label">Money back</div><div class="stat-value">${fmt(st.income)}</div><div class="stat-note">${num(p.quote) ? `expected ${fmt(num(p.quote))} · ${Math.round((st.income / num(p.quote)) * 100)}% in` : "set an expected amount in Project settings"}</div></div>
    <div class="stat"><div class="stat-label">Net</div><div class="stat-value ${st.net >= 0 ? "good" : "neg"}">${fmt(st.net)}</div><div class="stat-note">money back − cash spent · counting your time: ${fmt(st.trueNet)}</div></div>
    <div class="stat"><div class="stat-label">Earned per hour</div><div class="stat-value ${st.perHour === null ? "" : st.perHour >= st.rate ? "good" : "neg"}">${st.perHour === null ? "—" : fmt2(st.perHour)}${st.perHour === null ? "" : small("/h")}</div><div class="stat-note">${st.perHour === null ? "log work hours to see this" : `(money back − cash) ÷ hours · your rate is ${fmt(st.rate)}/h`}</div></div>`;

  projChart(p, st);
  const budget = num(p.budget);
  $("proj-payback").innerHTML = [
    st.paidCash ? `Paid back its cash on <b>${shortDate(st.paidCash)}</b>${st.net > 0 ? `, and has made ${fmt(st.net)} beyond it` : ""}.` : st.cash ? `Needs <b>${fmt(st.cash - st.income)}</b> more money back to cover its cash.` : "",
    st.time ? (st.paidAll ? `Covered your time too on ${shortDate(st.paidAll)}.` : `Covering your time as well needs ${fmt(st.cash + st.time - st.income)} more.`) : "",
    budget ? `Cash budget: ${fmt(st.cash)} of ${fmt(budget)} used${st.cash > budget ? ` (<span class="balance-neg">${fmt(st.cash - budget)} over</span>)` : ""}.` : "",
  ].filter(Boolean).join(" ");

  // Cost breakdown by type, time valued at the project's rate.
  const byType = COST_TYPES.map((ty) => {
    const es = (p.entries || []).filter((e) => e.kind === "cost" && e.type === ty);
    const v = ty === "Work hours" ? es.reduce((t, e) => t + num(e.hours), 0) * st.rate : es.reduce((t, e) => t + num(e.amt), 0);
    return { ty, v, hours: ty === "Work hours" ? es.reduce((t, e) => t + num(e.hours), 0) : 0 };
  }).filter((r) => r.v > 0);
  const tot = byType.reduce((t, r) => t + r.v, 0);
  $("proj-breakdown").innerHTML = tot
    ? `<div class="stackbar" role="img" aria-label="Cost split by type">${byType.map((r) => `<span style="width:${(r.v / tot) * 100}%;background:${typeColor(r.ty)}" title="${r.ty} ${fmt(r.v)}"></span>`).join("")}</div>` +
      byType.map((r) => `<div class="brow"><b style="background:${typeColor(r.ty)}"></b><span>${r.ty}${r.hours ? ` <span class="meta">${+r.hours.toFixed(1)}h</span>` : ""}</span><span class="amt">${fmt(r.v)}</span><span class="meta">${Math.round((r.v / tot) * 100)}%</span></div>`).join("") +
      `<p class="note">Work hours are valued at ${fmt(st.rate)}/h, what an hour of yours is worth (set in Project settings). It isn't money you paid, so Net leaves it out.</p>`
    : `<div class="empty-line">No costs yet.</div>`;

  // Settings row.
  $("proj-settings").hidden = !projEditing;
  $("proj-edit").textContent = projEditing ? "Done" : "Project settings";
  const n = P.indexOf(p);
  if (projEditing && $("proj-settings").dataset.for !== p.id) {
    $("proj-settings").dataset.for = p.id;
    $("proj-settings").className = "proj-settings";
    $("proj-settings").innerHTML = `
      <label>Name${field("projects", n, "name", p.name, "input", "Project name")}</label>
      <label>Status${select("projects", n, "status", STATUSES.map((s) => [s, s]), p.status || "Active")}</label>
      <label>Your hour is worth${field("projects", n, "rate", p.rate || "", "input", "$ per hour")}</label>
      <label>Cash budget${field("projects", n, "budget", p.budget || "", "input", "optional")}</label>
      <label>Expected money back${field("projects", n, "quote", p.quote || "", "input", "optional")}</label>
      <button class="btn ghost small danger" type="button" id="proj-del" style="color:var(--danger)">Delete project</button>`;
  }

  // Entry form.
  const f = $("proj-form");
  document.querySelectorAll("#entry-kind button").forEach((b) => b.classList.toggle("on", b.dataset.kind === entryKind));
  f.type.hidden = entryKind === "income";
  if (!f.type.options.length) f.type.innerHTML = COST_TYPES.map((t) => `<option>${t}</option>`).join("");
  f.what.placeholder = entryKind === "income" ? "From (client, sale, grant…)" : "What";
  f.amt.placeholder = entryKind === "cost" && f.type.value === "Work hours" ? "Hours" : "Amount";
  f.classList.toggle("income-mode", entryKind === "income");
  if (!f.date.value) f.date.value = todayIso;

  const E = [...(p.entries || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  $("proj-entries").innerHTML = `<tr><th>Date</th><th>Type</th><th>What</th><th class="num">Hours</th><th class="num">Amount</th><th></th></tr>` + E.map((e) => {
    const inc = e.kind === "income";
    const val = inc ? num(e.amt) : e.type === "Work hours" ? num(e.hours) * st.rate : num(e.amt);
    return `<tr><td class="meta" style="white-space:nowrap">${esc(shortDate(e.date))}</td><td>${inc ? `<span class="dotname"><span class="dot" style="background:var(--series-1)"></span>Money back</span>` : `<span class="dotname"><span class="dot" style="background:${typeColor(e.type)}"></span>${esc(e.type)}</span>`}</td><td>${esc(e.what)}</td><td class="num meta">${e.type === "Work hours" && !inc ? +num(e.hours).toFixed(2) : ""}</td><td class="num ${inc ? "balance-pos" : ""}">${inc ? "+" : ""}${fmt2(val)}${e.type === "Work hours" && !inc ? ' <small class="meta">time</small>' : ""}</td><td class="num"><button class="x-btn" type="button" data-pentry="${e.id}" aria-label="Delete entry">✕</button></td></tr>`;
  }).join("") + (E.length ? "" : `<tr><td class="empty-line" colspan="6">No entries yet.</td></tr>`);
}

document.addEventListener("click", (e) => {
  const pr = e.target.closest("[data-project]");
  if (pr) { selProject = pr.dataset.project; $("proj-settings").dataset.for = ""; renderProjects(); return; }
  const pe = e.target.closest("[data-pentry]");
  if (pe) {
    const p = D.projects.find((x) => x.id === selProject);
    p.entries = p.entries.filter((x) => x.id !== pe.dataset.pentry);
    save("projects"); renderProjects(); return;
  }
  const k = e.target.closest("#entry-kind [data-kind]");
  if (k) { entryKind = k.dataset.kind; renderProjects(); return; }
  if (e.target.id === "proj-del") {
    const p = D.projects.find((x) => x.id === selProject);
    if (p && confirm(`Delete ${p.name || "this project"} and all its entries?`)) {
      D.projects = D.projects.filter((x) => x !== p); projEditing = false; save("projects"); renderProjects();
    }
  }
});
$("proj-add").addEventListener("click", () => {
  const p = { id: newId("pr"), name: "", status: "Active", start: todayIso, rate: 25, budget: 0, quote: 0, c: palette[D.projects.length % palette.length], entries: [] };
  D.projects.push(p); selProject = p.id; projEditing = true; $("proj-settings").dataset.for = "";
  save("projects"); renderProjects();
  $("proj-settings").querySelector('[data-f="name"]')?.focus();
});
$("proj-edit").addEventListener("click", () => { projEditing = !projEditing; $("proj-settings").dataset.for = ""; renderProjects(); });
$("proj-form").addEventListener("change", (e) => { if (e.target.name === "type") renderProjects(); });
$("proj-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target, p = D.projects.find((x) => x.id === selProject);
  const v = Math.abs(num(f.amt.value));
  if (!p || !v) return;
  const hoursEntry = entryKind === "cost" && f.type.value === "Work hours";
  p.entries = p.entries || [];
  p.entries.push({ id: newId("pe"), kind: entryKind, type: entryKind === "income" ? "" : f.type.value, date: f.date.value, what: f.what.value.trim(), ...(hoursEntry ? { hours: v } : { amt: v }) });
  if (!p.start || f.date.value < p.start) p.start = f.date.value;
  f.what.value = ""; f.amt.value = "";
  save("projects"); renderProjects();
});

// ---------- routing and shell ----------

const titles = { overview: "Overview", checkin: "Monthly check-in", plan: "Plan", calendar: "Calendar", taxes: "Taxes", projects: "Project costs", ledger: "Ledger" };
let tab = "overview";
function renderShell() {
  $("m-label").textContent = `${MONTHS[m]} ${y}`;
  document.querySelectorAll(".m-name").forEach((e) => (e.textContent = MONTHS[m]));
  document.querySelectorAll(".y-name").forEach((e) => (e.textContent = y));
  $("m-next").disabled = y > TODAY.y + 1 || (y === TODAY.y + 1 && m >= TODAY.m);
  $("m-today").hidden = y === TODAY.y && m === TODAY.m;
  const last = lastSaved();
  $("eyebrow").textContent = `${today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · last check-in: ${last ? monthName(last) : "none yet"}`;
  const r = rec(curKey());
  $("month-status").textContent = isFuture() ? "Future month: plan and calendar only" : r?.saved ? `${MONTHS[m]} checked in` : r ? `${MONTHS[m]} check-in started, not saved` : "";
}
function renderAll() {
  renderShell(); renderOverview(); renderCheckin(); renderPlan(); renderCalendar(); renderTaxes(); renderLedger(); renderProjects();
}
function show(t) {
  if (!titles[t]) t = "overview";
  tab = t;
  document.querySelectorAll("#nav .nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
  document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "v-" + t));
  $("page-title").textContent = titles[t];
  $("start-checkin").hidden = t === "checkin";
  $("sidebar").classList.remove("open");
  if (location.hash !== "#" + t) history.replaceState(null, "", "#" + t);
}

// ---------- events ----------

document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-tab],[data-go]");
  if (go) { show(go.dataset.tab || go.dataset.go); return; }
  if (e.target.closest("[data-goal-open]")) { editing.goals = true; renderGoals(); return; }
  const go2 = e.target.closest("[data-alloc-go]");
  if (go2) {
    const box = document.querySelector(`[data-alloc="${go2.dataset.allocGo}"]`);
    const gid = box.querySelector("select").value, v = num(box.querySelector("input").value);
    if (!v) return;
    const r = rec(curKey(), true);
    r.toGoals = r.toGoals || {};
    r.toGoals[gid] = num(r.toGoals[gid]) + v;
    save("months"); renderOverview(); renderLeftover(); return;
  }
  const un = e.target.closest("[data-unalloc]");
  if (un) { delete rec(curKey()).toGoals[un.dataset.unalloc]; save("months"); renderOverview(); renderLeftover(); return; }
  const day = e.target.closest("[data-day]");
  if (day) { selDay = +day.dataset.day; renderCalendar(); return; }
  const person = e.target.closest("[data-person]");
  if (person) { selPerson = person.dataset.person; renderLedger(); return; }
  const entry = e.target.closest("[data-entry]");
  if (entry) {
    D.ledger.entries = D.ledger.entries.filter((x) => x.id !== entry.dataset.entry);
    save("people"); renderLedger(); renderOverview(); return;
  }
  const t = e.target.closest("[data-edit],[data-add],[data-del]");
  if (!t) return;
  if (t.dataset.edit) { editing[t.dataset.edit] = !editing[t.dataset.edit]; renderAll(); return; }
  if (t.dataset.add) {
    const l = t.dataset.add;
    if (l === "people") {
      editing.people = true;
      D.ledger.people.push({ id: newId("p"), name: "", c: palette[D.ledger.people.length % palette.length] });
    } else {
      editing[l] = true;
      D[l].push({ id: newId(l[0]), ...blank[l](), ...(t.dataset.type ? { type: t.dataset.type } : {}), c: palette[D[l].length % palette.length] });
    }
    save(l); renderAll();
    const inputs = document.querySelectorAll(`[data-list="${l}"][data-f="name"]`);
    inputs[inputs.length - 1]?.focus();
    return;
  }
  const l = t.dataset.list, n = +t.dataset.del, item = listOf(l)[n];
  const label = item?.name || "this item";
  if (l === "people" && D.ledger.entries.some((x) => x.person === item.id) && !confirm(`Remove ${label} and their ledger entries?`)) return;
  listOf(l).splice(n, 1);
  if (l === "people") D.ledger.entries = D.ledger.entries.filter((x) => x.person !== item.id);
  save(l); renderAll();
});

const TEXT_FIELDS = ["name", "type", "cat", "rep", "kind", "earns", "status", "rkind"];
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.cv) {
    const r = rec(curKey(), true);
    r[el.dataset.cv][el.dataset.id] = el.value.trim() === "" ? "" : num(el.value);
    save("months"); renderShell(); renderOverview(); if (el.dataset.cv === "balances") renderCardTotals(); else renderLeftover(); return;
  }
  const { list, n, f } = el.dataset;
  if (!list || n === undefined) return;
  if (f === "day") el.value = el.value.replace(/\D/g, "").slice(0, 2);
  listOf(list)[n][f] = TEXT_FIELDS.includes(f) ? el.value : f === "mon" ? +el.value : num(el.value);
  save(list);
  // Re-draw everything except the table being typed in, so the cursor stays put.
  const typing = el.tagName !== "SELECT";
  renderShell(); renderOverview(list === "goals" && typing); renderCalendar(); renderTaxes();
  if (list !== "people" || !typing) renderLedger();
  if (list !== "bills" || !typing) renderPlan();
  if (list === "projects") renderProjects();
  if (list === "accts" && typing) renderRewardTotals();
  if (el.tagName === "SELECT" && ["accts", "income", "cats"].includes(list)) renderCheckin();
  if (list === "cats" || list === "income") { if (tab !== "checkin") renderCheckin(); }
});

$("month-note").addEventListener("input", (e) => { rec(curKey(), true).note = e.target.value; save("months"); });
$("save-month").addEventListener("click", () => {
  const r = rec(curKey(), true);
  r.saved = true; r.savedAt = new Date().toISOString();
  save("months"); renderAll();
});
const move = (dm) => { m += dm; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } renderAll(); };
$("m-prev").addEventListener("click", () => move(-1));
$("m-next").addEventListener("click", () => move(1));
$("m-today").addEventListener("click", () => { y = TODAY.y; m = TODAY.m; renderAll(); });
$("tax-rules").addEventListener("click", (e) => {
  const r = e.target.dataset.rules; if (!r) return;
  D.settings.taxRules = r; save("settings"); renderTaxes();
});
$("entry-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const amt = num(f.amt.value);
  if (!selPerson || !amt) return;
  D.ledger.entries.push({ id: newId("e"), person: selPerson, date: f.date.value, what: f.what.value.trim(), dir: f.dir.value, amt: Math.abs(amt) });
  f.what.value = ""; f.amt.value = "";
  save("people"); renderLedger(); renderOverview();
});
$("feed-copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("feed-url").textContent); $("feed-copy").textContent = "Copied"; }
  catch { getSelection().selectAllChildren($("feed-url")); }
});
$("brand").addEventListener("click", () => $("settings").showModal());
$("menu-btn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("restore-file").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const msg = $("restore-msg");
  try {
    const res = await fetch("/api/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text() });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error);
    msg.textContent = "Restored. Reloading…";
    setTimeout(() => location.reload(), 600);
  } catch (err) { msg.textContent = `Couldn't restore: ${err.message}`; msg.style.color = "var(--danger)"; }
});
store.onStatus(({ pending, failed }) => {
  const s = $("save-state");
  s.className = "save-state" + (failed ? " err" : "");
  s.textContent = failed ? "· Not saved. Is the server running?" : pending ? "· Saving…" : "· Saved";
});
window.addEventListener("hashchange", () => show(location.hash.slice(1)));

// ---------- start ----------

try {
  await store.loadAll();
  if (!store.hasData()) for (const [k, v] of Object.entries(seed())) store.set(k, v);
  load();
  renderAll();
  show(location.hash.slice(1) || "overview");
} catch (err) {
  document.querySelector(".main").innerHTML = `<div class="empty"><h2>Can't reach the server</h2><p>${esc(err.message)}</p><p>Start it with <code>docker compose up -d</code> and reload.</p></div>`;
}
