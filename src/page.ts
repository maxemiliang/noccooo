// The single-page app served at /: a tier list (S..F) of the advent calendar's flavours,
// vanilla HTML/CSS/JS, mobile-first. Cans move by dragging (mouse: press and move; touch:
// press and hold, then move) or by tapping one and picking a tier; keyboard: focus a can,
// press S/A/B/C/D/F, 0 to unplace, arrows to reorder. Every change saves itself.
// Who you are comes from Cloudflare Access (the server reads it, see src/auth.ts), so the
// page never handles a secret. The client JS deliberately avoids backticks, "${" and
// backslashes, so this module's template literal needs no escaping.
export const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#eef3f7">
<title>noccooo tier list</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,400..900;1,62..125,400..900&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #eef3f7; --surface: #ffffff; --lane: #f5f8fb; --line: #d6dee7;
  --ink: #0b1f3a; --ink2: #3a4a63; --muted: #66768d; --focus: #12a8f0; --onink: #ffffff;
  --tS: #ff3b3b; --tA: #ff8a00; --tB: #ffd400; --tC: #22cc66; --tD: #12b0ff; --tF: #9a5cff;
  --ca: #0b1f3a; --cb: #ff5cb8; --cb-text: #d4268c;
  --tile: 60px; --label: 50px;
  --font: "Archivo", ui-sans-serif, system-ui, sans-serif;
  --lift: 0 1px 0 var(--line), 0 14px 32px -20px rgba(11,31,58,.45);
}
@media (min-width: 640px) { :root { --tile: 78px; --label: 76px; } }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; color: var(--ink); font: 400 16px/1.45 var(--font); min-height: 100vh;
  background: linear-gradient(180deg, #ffffff 0, var(--bg) 360px) no-repeat, var(--bg);
  padding-bottom: env(safe-area-inset-bottom);
}
body.mover-open { padding-bottom: 160px; }
body.dragging, body.dragging * { cursor: grabbing !important; user-select: none; -webkit-user-select: none; }
button { font: inherit; color: inherit; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.wrap { max-width: 1040px; margin: 0 auto; padding: 0 16px; }

/* Sporty display type: heavy, slanted, a little condensed. */
h1, h2, .label, .brand, .versus, .pip, .tile .ph, .tg i, .mover .tiers button, .dn, .verdict b {
  font-family: var(--font); font-weight: 900; font-style: italic;
}

/* ---------- header & tabs ---------- */
.top { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding-top: 20px; }
.brand { margin: 0; font-size: clamp(2.7rem, 12.5vw, 4rem); line-height: .8; font-stretch: 118%; letter-spacing: -.045em; }
.brand small {
  display: block; margin-top: 10px; font: 500 .9rem/1.3 var(--font); font-style: normal; letter-spacing: 0;
  font-stretch: 100%; color: var(--muted);
}
.me {
  display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 4px 14px 4px 4px; max-width: 55vw;
  background: var(--surface); border: 1px solid var(--line); border-radius: 999px; cursor: pointer; box-shadow: var(--lift);
}
.me .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
.av {
  flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
  background: var(--ink); color: var(--onink); font-weight: 900; font-style: italic;
}
.av.b { background: var(--cb); }
.av.viewer { background: var(--line); color: var(--ink); }
.tabs {
  position: sticky; top: 0; z-index: 10; margin: 16px -16px 0; padding: 10px 16px;
  background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  display: flex; gap: 4px;
}
.tabs button {
  flex: 1 1 0; min-height: 44px; border: 1px solid transparent; border-radius: 999px; cursor: pointer;
  background: transparent; color: var(--ink2); font-weight: 700;
}
.tabs button[aria-selected="true"] { background: var(--ink); color: var(--onink); }
.tabs button[aria-selected="false"]:hover { border-color: var(--line); background: var(--surface); }
main { padding-top: 12px; padding-bottom: 40px; }
.viewhead { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
h1, h2 { margin: 0; line-height: 1; font-stretch: 85%; letter-spacing: -.02em; }
h1 { font-size: 2.1rem; }
h2 { font-size: 1.4rem; }
.lede { color: var(--ink2); margin: -4px 0 16px; max-width: 60ch; }
.muted { color: var(--muted); }
.save { font-size: .85rem; color: var(--muted); white-space: nowrap; }
.save.err { color: var(--tS); font-weight: 600; }

/* ---------- the board ---------- */
.board { background: var(--surface); border-radius: 18px; overflow: hidden; box-shadow: var(--lift); }
.row { display: grid; grid-template-columns: var(--label) 1fr; border-top: 1px solid var(--line); }
.row:first-child { border-top: 0; }
.t-S { --tc: var(--tS); } .t-A { --tc: var(--tA); } .t-B { --tc: var(--tB); }
.t-C { --tc: var(--tC); } .t-D { --tc: var(--tD); } .t-F { --tc: var(--tF); }
.label {
  border: 0; padding: 0 6px 0 0; background: var(--tc); color: var(--ink); cursor: default;
  display: flex; align-items: center; justify-content: center;
  font-size: clamp(2.1rem, 7.5vw, 3.2rem); line-height: 1;
  clip-path: polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%);
}
body.selecting #view-mine .label { cursor: pointer; }
body.selecting #view-mine .label:hover { filter: saturate(1.2) brightness(1.05); }
.lane {
  display: flex; flex-wrap: wrap; align-content: flex-start; gap: 8px; padding: 8px 8px 8px 4px;
  min-height: calc(var(--tile) * 1.25 + 44px); transition: background-color .12s;
}
.lane.over { background: color-mix(in srgb, var(--tc, var(--focus)) 14%, transparent); }
.tray { margin-top: 22px; }
.trayhead { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
.trayhead .hint { color: var(--muted); font-size: .9rem; }
.pool { padding: 10px; border: 2px dashed var(--line); border-radius: 18px; background: var(--lane); --tc: var(--focus); }
.pool .done { margin: auto; color: var(--muted); }
.legend { color: var(--muted); font-size: .9rem; margin: 14px 0 0; display: flex; align-items: center; gap: 8px; }

/* ---------- a can ---------- */
.tile {
  --s: var(--tile); position: relative; flex: none; width: var(--s); padding: 0; border: 0; background: none;
  display: flex; flex-direction: column; gap: 4px; text-align: center;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation;
}
#view-mine .tile { cursor: grab; }
.tile:focus-visible { outline: none; }
.tile:focus-visible .pic, .tile.selected .pic { outline: 3px solid var(--focus); outline-offset: 2px; }
.tile .pic {
  width: var(--s); height: calc(var(--s) * 1.25); border-radius: 9px 9px 7px 7px; object-fit: cover; display: block;
  background: var(--lane); pointer-events: none; box-shadow: 0 6px 12px -8px rgba(11,31,58,.6);
}
/* A can: brushed rim on top and bottom, a highlight down one side, the door number on the label. */
.tile .ph {
  display: flex; align-items: center; justify-content: center; padding-top: 6%;
  font-size: calc(var(--s) * .48); line-height: 1; color: #fff; text-shadow: 0 2px 0 rgba(0,0,0,.22);
  background:
    linear-gradient(180deg, #f6f8fa 0, #aeb8c3 4%, #eef1f4 8%, #8d97a2 11%, transparent 11.5%),
    linear-gradient(0deg, #9aa3ad 0, #e3e7eb 3.5%, transparent 4.5%),
    linear-gradient(90deg, transparent 12%, rgba(255,255,255,.55) 21%, transparent 32%, transparent 72%, rgba(0,0,0,.14) 92%),
    hsl(var(--h) 82% 49%);
}
.tile .num {
  position: absolute; top: 5px; left: 5px; padding: 1px 6px; border-radius: 6px;
  background: var(--surface); color: var(--ink); font: 800 .7rem/1.35 var(--font); font-style: italic;
}
.tile .nm {
  font-size: .74rem; font-weight: 600; font-stretch: 78%; line-height: 1.12; color: var(--ink2); overflow: hidden;
  hyphens: auto; -webkit-hyphens: auto; overflow-wrap: break-word;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.pip {
  position: absolute; top: -6px; right: -6px; width: 24px; height: 24px; border-radius: 50%;
  display: grid; place-items: center; background: var(--tc); color: var(--ink);
  font-size: .85rem; line-height: 1; border: 2.5px solid var(--surface); box-shadow: 0 2px 6px rgba(11,31,58,.25);
}
.tile.placeholder { opacity: .2; }
.tile.landed .pic { animation: land .34s cubic-bezier(.3, 1.6, .5, 1); }
@keyframes land { from { transform: scale(1.18) rotate(-3deg); } to { transform: none; } }
.drag-ghost {
  position: fixed; z-index: 60; pointer-events: none; margin: 0;
  transform: translate(-50%, -60%) rotate(-7deg) scale(1.12);
  filter: drop-shadow(0 16px 18px rgba(11,31,58,.35));
}

/* ---------- both raters ---------- */
.versus { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 14px; font-size: clamp(2.2rem, 10vw, 3.4rem); line-height: .95; font-stretch: 90%; letter-spacing: -.03em; }
.versus .ca { color: var(--ca); } .versus .cb { color: var(--cb-text); }
.versus .vs { font-size: .45em; color: var(--muted); }
.verdict { margin: 10px 0 18px; color: var(--ink2); max-width: 60ch; }
.verdict b { font-size: 1.7em; line-height: 1; color: var(--ink); margin-right: 2px; }
.lanes { display: flex; flex-direction: column; }
.sublane { box-shadow: inset 5px 0 0 var(--who); margin-left: 4px; }
.sublane.a { --who: var(--ca); } .sublane.b { --who: var(--cb); }
.sublane + .sublane { border-top: 1px dashed var(--line); }
.static { min-height: calc(var(--s2) * 1.25 + 40px); --tile: var(--s2); padding-left: 14px; }
.static .nm { font-size: .66rem; }
#view-both { --s2: 54px; }
@media (min-width: 640px) { #view-both { --s2: 62px; } }
.fights { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.fights li {
  display: grid; grid-template-columns: 44px 1fr; grid-template-rows: auto auto; column-gap: 12px; row-gap: 6px;
  align-items: center; background: var(--surface); border-radius: 14px; padding: 10px 12px 10px 10px; box-shadow: var(--lift);
}
.fights .tile { --s: 44px; grid-row: 1 / 3; }
.fights .what { font-weight: 700; min-width: 0; }
.fights .tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tg { display: inline-flex; align-items: center; gap: 6px; padding: 2px 3px 2px 10px; border-radius: 999px; background: var(--lane); border: 1px solid var(--line); font-size: .85rem; font-weight: 600; }
.tg.a { color: var(--ca); } .tg.b { color: var(--cb-text); }
.tg i { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--tc); color: var(--ink); font-size: .85rem; line-height: 1; }
.section-gap { margin-top: 28px; }

/* ---------- doors ---------- */
/* An advent calendar: 24 cells of one size; 6 x 4 once there's room. */
.doors { display: grid; gap: 10px; grid-template-columns: repeat(3, 1fr); }
@media (min-width: 480px) { .doors { grid-template-columns: repeat(4, 1fr); } }
@media (min-width: 760px) { .doors { grid-template-columns: repeat(6, 1fr); gap: 14px; } }
@media (min-width: 1000px) { .doors { grid-template-columns: repeat(8, 1fr); } }
.doorcell {
  position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: 8px 8px 10px;
  text-align: center; background: var(--surface); border: 0; border-radius: 14px; cursor: pointer; box-shadow: var(--lift);
  transition: transform .12s;
}
.doorcell:not(:disabled):hover { transform: translateY(-2px); }
.doorcell:disabled { cursor: default; }
.doorcell .tile { --s: 100%; width: 100%; pointer-events: none; }
.doorcell .tile .pic { width: 100%; height: auto; aspect-ratio: 4 / 5; }
.doorcell .tile .ph { font-size: 2.8rem; }
.doorcell .nm {
  font-weight: 700; font-size: .88rem; line-height: 1.2; min-height: 2.4em;
  display: flex; align-items: center; justify-content: center; overflow-wrap: anywhere;
}
/* A closed door: the panel where the can will go, its number, and what tapping does. */
.doorcell .door {
  aspect-ratio: 4 / 5; border-radius: 9px; display: grid; place-items: center;
  background: var(--lane); border: 2px dashed var(--line);
}
.doorcell .dn { font-size: 2.6rem; line-height: 1; color: #c3ccd7; }
.doorcell.empty .nm { color: var(--muted); font-weight: 600; }
.doorcell.empty:not(:disabled):hover .door { border-color: var(--focus); }
.doorcell.empty:not(:disabled):hover .dn, .doorcell.empty:not(:disabled):hover .nm { color: var(--focus); }
.doorcell.next .door { border: 2px solid var(--ink); background: var(--surface); }
.doorcell.next .dn, .doorcell.next .nm { color: var(--ink); }
@media (prefers-reduced-motion: reduce) { .doorcell { transition: none; } .doorcell:not(:disabled):hover { transform: none; } }

/* ---------- mover, dialogs, toast ---------- */
.mover {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; background: var(--surface);
  border-radius: 20px 20px 0 0; padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
  box-shadow: 0 -12px 40px -10px rgba(11,31,58,.35);
}
.mover[hidden] { display: none; }
.mover .in { max-width: 1040px; margin: 0 auto; display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; }
.mover .who { display: flex; align-items: center; gap: 10px; min-width: 0; }
.mover .who .tile { --s: 36px; }
.mover .who span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mover .tiers { grid-column: 1 / -1; display: flex; gap: 6px; }
.mover .tiers button {
  flex: 1 1 0; min-height: 50px; border: 0; border-radius: 12px; cursor: pointer;
  background: var(--tc); color: var(--ink); font-size: 1.6rem; line-height: 1;
}
.mover .tiers .out {
  flex: 1.6 1 0; background: var(--lane); color: var(--ink); border: 1px solid var(--line);
  font: 700 .9rem/1 var(--font); font-style: normal;
}
.mover .tiers button.current { box-shadow: inset 0 0 0 3px var(--surface), inset 0 0 0 5px var(--ink); }
.x { width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--line); background: var(--surface); cursor: pointer; font-size: 1.4rem; line-height: 1; }
dialog {
  width: min(440px, calc(100vw - 32px)); padding: 22px; border: 0; border-radius: 22px;
  background: var(--surface); color: var(--ink); box-shadow: 0 30px 80px -20px rgba(11,31,58,.5);
}
dialog::backdrop { background: rgba(11,31,58,.45); backdrop-filter: blur(3px); }
dialog h2 { font-size: 2rem; margin-bottom: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; font-weight: 600; font-size: .92rem; }
.field input, .field select {
  font: inherit; font-size: 1rem; font-weight: 400; color: var(--ink); background: var(--lane);
  border: 1px solid var(--line); border-radius: 12px; min-height: 48px; padding: 8px 12px; width: 100%;
}
.photo {
  display: grid; place-items: center; aspect-ratio: 4 / 3; border-radius: 14px; padding: 16px; text-align: center;
  border: 2px dashed var(--line); background: var(--lane); color: var(--muted); font-weight: 600; overflow: hidden; position: relative;
}
.photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.photo-actions { display: flex; gap: 8px; margin: 10px 0 16px; }
.photo-actions .btn { flex: 1 1 0; position: relative; padding: 0 10px; white-space: nowrap; }
.photo-actions input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.photo-actions .btn:focus-within { outline: 3px solid var(--focus); outline-offset: 2px; }
/* Desktop browsers ignore capture= and would only open the file picker again. */
@media (hover: hover) and (pointer: fine) { .photo-actions .cam { display: none; } }
.actions { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
.actions .grow { flex: 1; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 18px;
  border: 0; border-radius: 999px; cursor: pointer; font-weight: 700; text-decoration: none;
  background: var(--ink); color: var(--onink);
}
.btn.ghost { background: var(--surface); color: var(--ink); border: 1px solid var(--line); }
.btn.danger { color: #d62020; border-color: color-mix(in srgb, var(--tS) 45%, transparent); }
.btn:disabled { opacity: .5; cursor: progress; }
.empty-state { padding: 40px 0; max-width: 46ch; }
.empty-state p { color: var(--ink2); margin: 10px 0 18px; }
#toast {
  position: fixed; left: 50%; top: 14px; z-index: 80; transform: translateX(-50%);
  background: var(--ink); color: var(--onink); padding: 10px 18px; border-radius: 999px; font-weight: 600;
  max-width: calc(100vw - 32px); box-shadow: 0 10px 30px -8px rgba(11,31,58,.5);
}
#toast.err { background: #d62020; }
@media (prefers-reduced-motion: reduce) {
  .tile.landed .pic { animation: none; }
  .lane { transition: none; }
}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <p class="brand">noccooo<small>The 2026 advent calendar, ranked</small></p>
    <button class="me" id="meBtn" hidden></button>
  </header>
  <nav class="tabs" role="tablist">
    <button role="tab" data-view="mine" aria-selected="true">My tiers</button>
    <button role="tab" data-view="both" aria-selected="false">Both of us</button>
    <button role="tab" data-view="doors" aria-selected="false">Doors</button>
  </nav>
  <main>
    <section id="view-mine"></section>
    <section id="view-both" hidden></section>
    <section id="view-doors" hidden></section>
  </main>
</div>

<div class="mover" id="mover" hidden></div>

<dialog id="doorDlg">
  <form id="doorForm">
    <h2 id="doorTitle">Door</h2>
    <div class="photo" id="photoPick">
      <span id="photoHint">No photo yet. Take one of the can, or pick one you already have.</span>
      <img id="photoPrev" alt="">
    </div>
    <div class="photo-actions">
      <label class="btn cam"><input type="file" class="photo-file" accept="image/*" capture="environment">Take photo</label>
      <label class="btn ghost" id="photoChoose"><input type="file" class="photo-file" accept="image/*">Choose photo</label>
    </div>
    <label class="field">Flavour <input id="doorName" required maxlength="200" autocomplete="off" placeholder="What was behind the door?"></label>
    <label class="field">Door <select id="doorDay"></select></label>
    <div class="actions">
      <button type="button" class="btn ghost danger" id="doorDelete">Delete</button>
      <span class="grow"></span>
      <button type="button" class="btn ghost" data-close>Cancel</button>
      <button type="submit" class="btn" id="doorSave">Save</button>
    </div>
  </form>
</dialog>

<dialog id="meDlg">
  <form id="meForm">
    <h2>You</h2>
    <p class="muted" id="meEmail" style="margin:-6px 0 14px"></p>
    <label class="field" id="meNameField">Your name <input id="meName" maxlength="60" autocomplete="nickname"></label>
    <label class="field" id="devField" hidden>Switch user (local dev only) <input id="devEmail" type="email" autocomplete="off" list="devEmails"></label>
    <datalist id="devEmails"></datalist>
    <div class="actions">
      <a class="btn ghost" id="signOut" href="/cdn-cgi/access/logout">Sign out</a>
      <span class="grow"></span>
      <button type="button" class="btn ghost" data-close>Close</button>
      <button type="submit" class="btn">Save</button>
    </div>
  </form>
</dialog>

<div id="toast" role="status" hidden></div>

<script>
'use strict';
var TIERS = ['S', 'A', 'B', 'C', 'D', 'F'];
var $ = function (s, root) { return (root || document).querySelector(s); };
var $$ = function (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); };
var state = { me: null, users: [], flavours: [], tiers: {}, view: 'mine', selected: null, save: { text: '', err: false } };

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function toast(msg, isErr) {
  var el = $('#toast');
  el.textContent = msg;
  el.className = isErr ? 'err' : '';
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(function () { el.hidden = true; }, isErr ? 6000 : 2500);
}

async function req(method, path, opts) {
  opts = opts || {};
  var headers = opts.headers || {};
  var body;
  if (opts.json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(opts.json); }
  else if (opts.body !== undefined) body = opts.body;
  var res = await fetch(path, { method: method, headers: headers, body: body, credentials: 'same-origin' });
  var text = await res.text();
  var data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
  if (!res.ok) {
    var err = new Error((data && data.message) || ('HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- state helpers ---------- */

function me() { return state.me && state.me.user; }
function canEdit() { return !!me(); }
function flavour(id) { return state.flavours.find(function (f) { return f.id === id; }); }
function emptyTiers() { return { S: [], A: [], B: [], C: [], D: [], F: [] }; }
function tiersOf(uid) { return state.tiers[uid] || (state.tiers[uid] = emptyTiers()); }
function tierOf(uid, fid) {
  var t = state.tiers[uid];
  if (!t) return null;
  for (var i = 0; i < TIERS.length; i++) if (t[TIERS[i]].indexOf(fid) >= 0) return TIERS[i];
  return null;
}
function unplaced(uid) {
  var t = tiersOf(uid);
  var placed = {};
  TIERS.forEach(function (k) { t[k].forEach(function (id) { placed[id] = true; }); });
  return state.flavours.filter(function (f) { return !placed[f.id]; });
}
/* The two raters to show side by side: you first when you're one of them. */
function pair() {
  var mine = me();
  var others = state.users.filter(function (u) { return !mine || u.id !== mine.id; });
  return mine ? [mine, others[0] || null] : [state.users[0] || null, state.users[1] || null];
}
function partner() { return canEdit() ? pair()[1] : null; }
function initial(u) { return esc((u.name || u.email || '?').trim().charAt(0).toUpperCase()); }

/* ---------- rendering ---------- */

function tileHtml(f, opts) {
  opts = opts || {};
  var hue = (f.day * 47) % 360;
  var pic = f.hasImage
    ? '<img class="pic" src="' + f.imageUrl + '?v=' + encodeURIComponent(f.updatedAt) + '" alt="" loading="lazy" draggable="false"><span class="num">' + f.day + '</span>'
    : '<span class="pic ph" style="--h:' + hue + '">' + f.day + '</span>';
  var pip = opts.pip
    ? '<span class="pip t-' + opts.pip + '" aria-hidden="true">' + opts.pip + '</span>'
    : '';
  var label = 'Door ' + f.day + ', ' + f.name + (opts.pip ? ', ' + opts.pipName + ' put it in ' + opts.pip : '');
  var tag = opts.tag || 'button';
  return '<' + tag + (tag === 'button' ? ' type="button"' : '') + ' class="tile' + (state.selected === f.id && opts.mine ? ' selected' : '') +
    '" data-id="' + f.id + '" aria-label="' + esc(label) + '" title="' + esc(f.name) + '">' +
    pic + pip + '<span class="nm">' + esc(f.name) + '</span></' + tag + '>';
}

function setSave(text, err) {
  state.save = { text: text, err: !!err };
  var el = $('#saveState');
  if (el) { el.textContent = text; el.className = 'save' + (err ? ' err' : ''); }
}

function renderHeader() {
  var btn = $('#meBtn');
  if (!state.me) { btn.hidden = true; return; }
  var u = me();
  btn.hidden = false;
  btn.innerHTML = u
    ? '<span class="av">' + initial(u) + '</span><span class="nm">' + esc(u.name) + '</span>'
    : '<span class="av viewer">' + esc(state.me.email.charAt(0).toUpperCase()) + '</span><span class="nm">Viewing</span>';
  btn.setAttribute('aria-label', 'You: ' + (u ? u.name : state.me.email));
}

function renderMine() {
  var v = $('#view-mine');
  if (!canEdit()) {
    v.innerHTML = '<div class="empty-state"><h1>You can look, not rank</h1><p>Both rater spots are taken, so ' +
      esc(state.me.email) + ' can see the tier lists but not change them.</p>' +
      '<button class="btn" data-goto="both">See both tier lists</button></div>';
    return;
  }
  if (!state.flavours.length) {
    v.innerHTML = '<div class="empty-state"><h1>No cans yet</h1><p>Add the flavour behind each door first, then rank them here.</p>' +
      '<button class="btn" data-goto="doors">Add flavours</button></div>';
    return;
  }
  var u = me(), p = partner(), t = tiersOf(u.id);
  var tile = function (f) { return tileHtml(f, { mine: true, pip: p ? tierOf(p.id, f.id) : null, pipName: p && p.name }); };
  var html = '<div class="viewhead"><h1>Your tier list</h1><span id="saveState" class="save' + (state.save.err ? ' err' : '') + '">' + esc(state.save.text) + '</span></div>';
  html += '<div class="board">' + TIERS.map(function (k) {
    return '<div class="row t-' + k + '"><button type="button" class="label" data-move="' + k + '" tabindex="-1" aria-label="Move the picked can to ' + k + '">' + k + '</button>' +
      '<div class="lane" data-tier="' + k + '">' + t[k].map(flavour).filter(Boolean).map(tile).join('') + '</div></div>';
  }).join('') + '</div>';
  var rest = unplaced(u.id);
  html += '<div class="tray"><div class="trayhead"><h2>Not placed yet</h2><span class="hint">' +
    (rest.length ? 'Drag a can onto a tier, or tap it and pick one.' : '') + '</span></div>' +
    '<div class="lane pool" data-tier="">' + (rest.length ? rest.map(tile).join('') : '<p class="done">Every can has a tier.</p>') + '</div></div>';
  if (p) {
    html += '<p class="legend"><span class="pip t-A" style="position:static">A</span> The small letter on a can is ' +
      esc(p.name) + '&rsquo;s tier for it.</p>';
  }
  v.innerHTML = html;
}

async function renderBoth() {
  var v = $('#view-both');
  var pr = pair(), a = pr[0], b = pr[1];
  if (!a || !b) {
    v.innerHTML = '<div class="empty-state"><h1>Waiting for a second rater</h1><p>Send the link to the person you&rsquo;re ranking with. ' +
      'They become the second rater the first time they open it.</p></div>';
    return;
  }
  var lane = function (u, k, cls) {
    var ids = tiersOf(u.id)[k];
    return '<div class="sublane ' + cls + '" aria-label="' + esc(u.name) + ', tier ' + k + '">' +
      '<div class="lane static">' + ids.map(flavour).filter(Boolean).map(function (f) { return tileHtml(f, { tag: 'div' }); }).join('') + '</div></div>';
  };
  var html = '<div class="versus"><span class="ca">' + esc(a.name) + '</span><span class="vs">vs</span><span class="cb">' + esc(b.name) + '</span></div>' +
    '<p class="verdict" id="verdict">&nbsp;</p>';
  html += '<div class="board">' + TIERS.map(function (k) {
    return '<div class="row t-' + k + '"><div class="label">' + k + '</div><div class="lanes">' + lane(a, k, 'a') + lane(b, k, 'b') + '</div></div>';
  }).join('') + '</div><div id="fights"></div>';
  v.innerHTML = html;

  try {
    var r = await req('GET', '/api/compare?a=' + a.id + '&b=' + b.id);
    if (state.view !== 'both') return;
    var verdict = $('#verdict');
    if (r.spearman === null) {
      verdict.textContent = 'Place a few of the same cans and you’ll see how much you agree.';
    } else {
      var pct = Math.round((r.spearman + 1) / 2 * 100);
      verdict.innerHTML = '<b>' + pct + '%</b> in agreement. You put ' + r.sameTier + ' of the ' + r.bothPlaced +
        ' cans you&rsquo;ve both placed in the same tier.';
    }
    if (r.biggestDisagreements.length) {
      $('#fights').innerHTML = '<h2 class="section-gap">Where you disagree most</h2><ul class="fights">' +
        r.biggestDisagreements.map(function (e) {
          return '<li>' + tileHtml(e.flavour, { tag: 'div' }).replace('<span class="nm">' + esc(e.flavour.name) + '</span>', '') +
            '<span class="what">' + esc(e.flavour.name) + '</span><span class="tags">' +
            '<span class="tg a t-' + e.tierA + '">' + esc(a.name) + '<i>' + e.tierA + '</i></span>' +
            '<span class="tg b t-' + e.tierB + '">' + esc(b.name) + '<i>' + e.tierB + '</i></span>' +
            '</span></li>';
        }).join('') + '</ul>';
    }
  } catch (e) {
    $('#verdict').textContent = 'Couldn’t compare: ' + e.message;
  }
}

function renderDoors() {
  var v = $('#view-doors');
  var byDay = {};
  state.flavours.forEach(function (f) { byDay[f.day] = f; });
  var next = 0;
  for (var n = 1; n <= 24 && !next; n++) if (!byDay[n]) next = n;
  var html = '<div class="viewhead"><h1>The 24 doors</h1><span class="muted">' + state.flavours.length + ' of 24 opened</span></div>' +
    '<p class="lede">' + (canEdit() ? 'Tap a door to add the flavour behind it, or to change its name or photo.' : 'The flavour behind each door.') + '</p><div class="doors">';
  for (var d = 1; d <= 24; d++) {
    var f = byDay[d];
    var off = canEdit() ? '' : ' disabled';
    if (f) {
      html += '<button type="button" class="doorcell" data-door="' + d + '"' + off + '>' +
        tileHtml(f, { tag: 'span' }).replace('<span class="nm">' + esc(f.name) + '</span>', '') +
        '<span class="nm">' + esc(f.name) + '</span></button>';
    } else {
      var isNext = d === next && canEdit();
      html += '<button type="button" class="doorcell empty' + (isNext ? ' next' : '') + '" data-door="' + d + '"' + off +
        ' aria-label="Door ' + d + (canEdit() ? ', add its flavour' : ', not opened yet') + '">' +
        '<span class="door"><span class="dn">' + d + '</span></span>' +
        '<span class="nm">' + (canEdit() ? (isNext ? 'Open next' : 'Add') : 'Not opened') + '</span></button>';
    }
  }
  v.innerHTML = html + '</div>';
}

function render() {
  renderHeader();
  if (state.view === 'mine') renderMine();
  else if (state.view === 'both') renderBoth();
  else renderDoors();
  renderMover();
}

function show(view) {
  state.view = view;
  $$('.tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.view === view)); });
  ['mine', 'both', 'doors'].forEach(function (k) { $('#view-' + k).hidden = k !== view; });
  if (view !== 'mine') closeMover();
  if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
  render();
}

/* ---------- changing your tier list ---------- */

function moveTo(fid, tier, index) {
  var t = tiersOf(me().id);
  TIERS.forEach(function (k) { var i = t[k].indexOf(fid); if (i >= 0) t[k].splice(i, 1); });
  if (tier) {
    if (index === undefined || index > t[tier].length) t[tier].push(fid);
    else t[tier].splice(Math.max(0, index), 0, fid);
  }
  queueSave();
}

/* Your tier list as the board shows it (after a drag). */
function readBoard() {
  var t = emptyTiers();
  $$('#view-mine .lane[data-tier]').forEach(function (lane) {
    var k = lane.dataset.tier;
    if (k) t[k] = $$('.tile', lane).map(function (el) { return Number(el.dataset.id); });
  });
  state.tiers[me().id] = t;
}

var saving = false, saveAgain = false, saveTimer = null;
function queueSave() {
  setSave('Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 350);
}
async function flushSave() {
  saveTimer = null;
  if (saving) { saveAgain = true; return; }
  saving = true;
  try {
    await req('PUT', '/api/users/' + me().id + '/rankings', { json: { tiers: tiersOf(me().id) } });
    if (!saveAgain) setSave('Saved');
  } catch (e) {
    setSave('Not saved: ' + e.message, true);
  } finally {
    saving = false;
    if (saveAgain) { saveAgain = false; flushSave(); }
  }
}

function landed(fid) {
  var el = $('#view-mine .tile[data-id="' + fid + '"]');
  if (el) { el.classList.add('landed'); return el; }
  return null;
}

/* ---------- tap to pick, then choose a tier ---------- */

function select(fid) {
  state.selected = fid;
  $$('#view-mine .tile').forEach(function (el) { el.classList.toggle('selected', Number(el.dataset.id) === fid); });
  renderMover();
}
function closeMover() {
  state.selected = null;
  $$('#view-mine .tile.selected').forEach(function (el) { el.classList.remove('selected'); });
  renderMover();
}
function renderMover() {
  var box = $('#mover');
  var f = state.selected !== null && state.view === 'mine' ? flavour(state.selected) : null;
  document.body.classList.toggle('mover-open', !!f);
  document.body.classList.toggle('selecting', !!f);
  if (!f) { box.hidden = true; box.innerHTML = ''; return; }
  var cur = tierOf(me().id, f.id);
  box.innerHTML = '<div class="in"><div class="who">' + tileHtml(f, { tag: 'span' }).replace('<span class="nm">' + esc(f.name) + '</span>', '') +
    '<span>Move <b>' + esc(f.name) + '</b> to</span></div>' +
    '<button type="button" class="x" data-close-mover aria-label="Close">&times;</button>' +
    '<div class="tiers">' + TIERS.map(function (k) {
      return '<button type="button" class="t-' + k + (cur === k ? ' current' : '') + '" data-move="' + k + '">' + k + '</button>';
    }).join('') + (cur ? '<button type="button" class="out" data-move="">Unplace</button>' : '') + '</div></div>';
  box.hidden = false;
}

/* ---------- dragging (pointer events: mouse, pen and touch) ---------- */

var drag = null, suppressClick = false;

function laneAt(x, y) {
  var el = document.elementFromPoint(x, y);
  if (!el) return null;
  var lane = el.closest('#view-mine .lane[data-tier]');
  if (lane) return lane;
  var row = el.closest('#view-mine .row');
  if (row) return $('.lane', row);
  var tray = el.closest('#view-mine .tray');
  return tray ? $('.lane', tray) : null;
}

/* Put the dragged can where it would land, so the board shows the result live. */
function placeAt(x, y) {
  var lane = laneAt(x, y);
  $$('#view-mine .lane.over').forEach(function (l) { if (l !== lane) l.classList.remove('over'); });
  if (!lane) return;
  lane.classList.add('over');
  var ref = null;
  var tiles = $$('.tile', lane).filter(function (el) { return el !== drag.tile; });
  for (var i = 0; i < tiles.length; i++) {
    var r = tiles[i].getBoundingClientRect();
    if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) { ref = tiles[i]; break; }
  }
  var done = $('.done', lane);
  if (done) done.remove();
  if (drag.tile.parentNode !== lane || drag.tile.nextSibling !== ref) lane.insertBefore(drag.tile, ref);
}

function startDrag() {
  drag.active = true;
  closeMover();
  var r = drag.tile.getBoundingClientRect();
  var ghost = drag.tile.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.classList.remove('selected');
  ghost.style.width = r.width + 'px';
  ghost.removeAttribute('data-id');
  document.body.appendChild(ghost);
  drag.ghost = ghost;
  drag.tile.classList.add('placeholder');
  document.body.classList.add('dragging');
  if (navigator.vibrate) navigator.vibrate(12);
  moveGhost();
  scrollLoop();
}

function moveGhost() {
  drag.ghost.style.left = drag.x + 'px';
  drag.ghost.style.top = drag.y + 'px';
}

/* Scroll the page while a can is held near the top or bottom edge. */
function scrollLoop() {
  if (!drag || !drag.active) return;
  var edge = 70, h = window.innerHeight, dy = 0;
  if (drag.y < edge + 60) dy = -Math.ceil((edge + 60 - drag.y) / 6);
  else if (drag.y > h - edge) dy = Math.ceil((drag.y - (h - edge)) / 6);
  if (dy) { window.scrollBy(0, dy); placeAt(drag.x, drag.y); }
  requestAnimationFrame(scrollLoop);
}

function endDrag(drop) {
  var d = drag;
  drag = null;
  clearTimeout(d.timer);
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerCancel);
  if (!d.active) return;
  suppressClick = true;
  setTimeout(function () { suppressClick = false; }, 0);
  d.ghost.remove();
  d.tile.classList.remove('placeholder');
  document.body.classList.remove('dragging');
  $$('#view-mine .lane.over').forEach(function (l) { l.classList.remove('over'); });
  if (drop) { readBoard(); queueSave(); }
  renderMine();
  if (drop) landed(d.id);
}

function onPointerDown(ev) {
  var tile = ev.target.closest('#view-mine .tile');
  if (!tile || !canEdit() || drag) return;
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  drag = { id: Number(tile.dataset.id), tile: tile, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, touch: ev.pointerType === 'touch', active: false };
  // Touch: hold still briefly to pick a can up, so a swipe still scrolls the page.
  if (drag.touch) drag.timer = setTimeout(function () { if (drag && !drag.active) startDrag(); }, 230);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
}
function onPointerMove(ev) {
  if (!drag) return;
  drag.x = ev.clientX; drag.y = ev.clientY;
  if (!drag.active) {
    var dist = Math.hypot(drag.x - drag.x0, drag.y - drag.y0);
    if (drag.touch) { if (dist > 10) endDrag(false); return; }
    if (dist < 5) return;
    startDrag();
  }
  moveGhost();
  placeAt(drag.x, drag.y);
}
function onPointerUp() { if (drag) endDrag(true); }
function onPointerCancel() { if (drag) endDrag(drag.active); }

document.addEventListener('pointerdown', onPointerDown);
// Once a can is picked up on touch, the finger drags it instead of scrolling the page.
document.addEventListener('touchmove', function (ev) { if (drag && drag.active) ev.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', function (ev) { if (ev.target.closest('#view-mine .tile')) ev.preventDefault(); });

/* ---------- clicks & keys ---------- */

document.addEventListener('click', function (ev) {
  if (suppressClick) { ev.preventDefault(); return; }
  var t = ev.target;
  var tab = t.closest('.tabs button');
  if (tab) { show(tab.dataset.view); return; }
  var go = t.closest('[data-goto]');
  if (go) { show(go.dataset.goto); return; }
  if (t.closest('[data-close-mover]')) { closeMover(); return; }
  var mv = t.closest('[data-move]');
  if (mv && state.selected !== null) {
    var fid = state.selected;
    moveTo(fid, mv.dataset.move);
    closeMover();
    renderMine();
    landed(fid);
    return;
  }
  var tile = t.closest('#view-mine .tile');
  if (tile) {
    var id = Number(tile.dataset.id);
    if (state.selected === id) closeMover(); else select(id);
    return;
  }
  var door = t.closest('[data-door]');
  if (door) { openDoor(Number(door.dataset.door)); return; }
  if (t.closest('#meBtn')) { openMe(); return; }
  if (t.closest('[data-close]')) { t.closest('dialog').close(); return; }
});

document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Escape' && state.selected !== null && !$('dialog[open]')) { closeMover(); return; }
  var tile = ev.target.closest && ev.target.closest('#view-mine .tile');
  if (!tile || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  var fid = Number(tile.dataset.id);
  var key = ev.key.toUpperCase();
  var t = tiersOf(me().id), cur = tierOf(me().id, fid);
  if (TIERS.indexOf(key) >= 0) moveTo(fid, key);
  else if (key === '0' || ev.key === 'Backspace' || ev.key === 'Delete') moveTo(fid, '');
  else if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && cur) {
    var i = t[cur].indexOf(fid), j = i + (ev.key === 'ArrowLeft' ? -1 : 1);
    if (j < 0 || j >= t[cur].length) return;
    moveTo(fid, cur, j);
  } else return;
  ev.preventDefault();
  closeMover();
  renderMine();
  var el = landed(fid);
  if (el) el.focus();
});

/* ---------- doors dialog ---------- */

var doorEdit = null;

function openDoor(day) {
  if (!canEdit()) return;
  var f = state.flavours.find(function (x) { return x.day === day; }) || null;
  doorEdit = { flavour: f, file: null };
  $('#doorTitle').textContent = 'Door ' + day;
  $('#doorName').value = f ? f.name : '';
  var taken = {};
  state.flavours.forEach(function (x) { if (!f || x.id !== f.id) taken[x.day] = true; });
  var opts = '';
  for (var d = 1; d <= 24; d++) opts += '<option value="' + d + '"' + (taken[d] ? ' disabled' : '') + '>' + d + (taken[d] ? ' (has a flavour)' : '') + '</option>';
  $('#doorDay').innerHTML = opts;
  $('#doorDay').value = String(day);
  $('#doorDelete').hidden = !f;
  $$('.photo-file').forEach(function (input) { input.value = ''; });
  setPreview(f && f.hasImage ? f.imageUrl + '?v=' + encodeURIComponent(f.updatedAt) : null);
  $('#doorDlg').showModal();
  if (!f && matchMedia("(pointer: fine)").matches) $("#doorName").focus();
}

function setPreview(src) {
  $('#photoPrev').hidden = !src;
  $('#photoHint').hidden = !!src;
  $('#photoChoose').lastChild.textContent = src ? 'Choose another' : 'Choose photo';
  if (src) $('#photoPrev').src = src; else $('#photoPrev').removeAttribute('src');
}

/* Phone photos are often several MB; send a ~900px JPEG instead. */
async function shrink(file) {
  try {
    var bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    var s = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
    var c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(function (res) { c.toBlob(function (b) { res(b || file); }, 'image/jpeg', 0.85); });
  } catch (e) {
    return file;
  }
}

/* Both the camera and the library input land here. */
$$('.photo-file').forEach(function (input) {
  input.onchange = function () {
    var file = input.files && input.files[0];
    if (!file) return;
    doorEdit.file = file;
    setPreview(URL.createObjectURL(file));
  };
});

$('#doorForm').onsubmit = async function (ev) {
  ev.preventDefault();
  var name = $('#doorName').value.trim();
  var day = Number($('#doorDay').value);
  if (!name) return;
  var btn = $('#doorSave');
  btn.disabled = true;
  try {
    var f = doorEdit.flavour;
    if (!f) f = (await req('POST', '/api/flavours', { json: { day: day, name: name } })).flavour;
    else if (f.name !== name || f.day !== day) f = (await req('PATCH', '/api/flavours/' + f.id, { json: { day: day, name: name } })).flavour;
    if (doorEdit.file) {
      var blob = await shrink(doorEdit.file);
      await req('POST', '/api/flavours/' + f.id + '/image', { body: blob, headers: { 'content-type': blob.type || 'image/jpeg' } });
    }
    $('#doorDlg').close();
    toast('Saved door ' + day);
    await reload();
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
  }
};

$('#doorDelete').onclick = async function () {
  var f = doorEdit && doorEdit.flavour;
  if (!f || !confirm('Delete door ' + f.day + ' (' + f.name + ')? It leaves both tier lists too.')) return;
  try {
    await req('DELETE', '/api/flavours/' + f.id);
    $('#doorDlg').close();
    toast('Deleted door ' + f.day);
    await reload();
  } catch (e) { toast(e.message, true); }
};

/* ---------- you ---------- */

function openMe() {
  var u = me();
  $('#meEmail').textContent = 'Signed in as ' + state.me.email + (u ? '' : ' (viewer: both rater spots are taken)');
  $('#meNameField').hidden = !u;
  $('#meName').value = u ? u.name : '';
  $('#devField').hidden = !state.me.dev;
  $('#devEmail').value = state.me.email;
  $('#devEmails').innerHTML = (state.me.devEmails || []).map(function (e) { return '<option value="' + esc(e) + '">'; }).join('');
  $('#signOut').hidden = state.me.dev;
  $('#meDlg').showModal();
}

$('#meForm').onsubmit = async function (ev) {
  ev.preventDefault();
  if (state.me.dev) {
    var email = $('#devEmail').value.trim().toLowerCase();
    if (email && email !== state.me.email) {
      document.cookie = 'noccooo_dev_user=' + encodeURIComponent(email) + '; path=/; samesite=lax';
      location.reload();
      return;
    }
  }
  var u = me(), name = $('#meName').value.trim();
  if (u && name && name !== u.name) {
    try {
      state.me.user = (await req('PATCH', '/api/me', { json: { name: name } })).user;
      state.users = state.users.map(function (x) { return x.id === u.id ? state.me.user : x; });
      toast('Saved your name');
      render();
    } catch (e) { toast(e.message, true); return; }
  }
  $('#meDlg').close();
};

/* ---------- loading ---------- */

async function load() {
  var r = await Promise.all([req('GET', '/api/me'), req('GET', '/api/users'), req('GET', '/api/flavours')]);
  var lists = await Promise.all(r[1].users.map(function (u) { return req('GET', '/api/users/' + u.id + '/rankings'); }));
  state.me = r[0];
  state.users = r[1].users;
  state.flavours = r[2].flavours;
  state.tiers = {};
  state.users.forEach(function (u, i) {
    var t = emptyTiers();
    lists[i].rankings.forEach(function (e) { t[e.tier].push(e.flavourId); });
    state.tiers[u.id] = t;
  });
  if (state.selected !== null && !flavour(state.selected)) state.selected = null;
}

async function reload() {
  await load();
  render();
}

// Pick up the other rater's changes when you come back to the tab.
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState !== 'visible' || drag || saving || saveTimer || $('dialog[open]')) return;
  reload().catch(function () { /* keep what's shown */ });
});

window.addEventListener('hashchange', function () {
  var view = location.hash.slice(1);
  if (state.me && view !== state.view && ['mine', 'both', 'doors'].indexOf(view) >= 0) show(view);
});

(async function init() {
  var view = (location.hash || '').slice(1);
  try {
    await load();
    show(['mine', 'both', 'doors'].indexOf(view) >= 0 ? view : (canEdit() ? 'mine' : 'both'));
  } catch (e) {
    $('#view-mine').innerHTML = '<div class="empty-state"><h1>' + (e.status === 401 ? 'Sign in first' : 'Couldn’t load') +
      '</h1><p>' + esc(e.message) + '</p><button class="btn" onclick="location.reload()">Try again</button></div>';
  }
})();
</script>
</body>
</html>
`
