/**
 * Reproduces the report PDF export in a real browser and prints whatever the
 * page throws, plus any file that lands in the download folder.
 *
 * Uses headless Chrome over the DevTools Protocol — no npm dependencies, since
 * Node 22+ ships a WebSocket client. The session cookie is obtained from Node
 * and injected via CDP, because an in-page fetch() never settles in this
 * headless configuration.
 *
 *   node scripts/pdf-debug.mjs
 */

import { spawn } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3400";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9355;

const profile = mkdtempSync(join(tmpdir(), "pdf-debug-"));
const downloads = mkdtempSync(join(tmpdir(), "pdf-dl-"));
console.log("download dir:", downloads);
const KEEP = process.env.KEEP === "1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--window-size=1600,1000",
    "about:blank",
  ],
  { stdio: "ignore" }
);

let ws;
let nextId = 1;
const pending = new Map();
const events = [];

function send(method, params = {}, timeoutMs = 30000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, timeoutMs);
  });
}

/** Synchronous evaluation by default. awaitPromise is opt-in — an in-page
    fetch() never settles in this headless setup, but a FileReader does. */
async function evaluate(expression, awaitPromise = false) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, userGesture: true, awaitPromise });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}

async function navigate(url, settleMs = 3000) {
  await send("Page.navigate", { url });
  await sleep(settleMs);
}

async function findPageTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome did not expose a debugging target.");
}

/** Non-response CDP events we care about. */
function handleEvent(msg) {
  if (msg.method === "Runtime.consoleAPICalled") {
    const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(" ");
    events.push({ kind: msg.params.type, text });
  } else if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    events.push({ kind: "EXCEPTION", text: (d.exception?.description || d.text || "").split("\n")[0] });
  } else if (msg.method === "Log.entryAdded") {
    events.push({ kind: `log:${msg.params.entry.level}`, text: msg.params.entry.text });
  } else if (msg.method === "Network.loadingFailed") {
    events.push({ kind: "net:FAILED", text: `${msg.params.type} ${msg.params.errorText}` });
  } else if (msg.method === "Network.responseReceived" && msg.params.response.url.includes("/api/reports")) {
    const r = msg.params.response;
    send("Network.getResponseBody", { requestId: msg.params.requestId })
      .then((res) => events.push({ kind: `http:${r.status}`, text: `${r.url}\n      BODY: ${String(res.body).slice(0, 700)}` }))
      .catch((e) => events.push({ kind: `http:${r.status}`, text: `${r.url}\n      BODY: <<${e.message}>>` }));
  }
}

try {
  /* ---- session cookie, obtained outside the browser ---- */
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.OWNER_EMAIL || "blbas11@gmail.com", password: process.env.OWNER_PASSWORD || "blbas123" }),
  });
  const setCookie = login.headers.get("set-cookie") || "";
  const session = /alu_session=([^;]+)/.exec(setCookie)?.[1];
  console.log("login:", login.status, session ? "got session cookie" : "NO SESSION COOKIE");
  if (!session) throw new Error(`login failed: ${setCookie || "(no cookie)"}`);

  const wsUrl = await findPageTarget();
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      return msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
    handleEvent(msg);
  };

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads }).catch(() =>
    console.log("  (Page.setDownloadBehavior unavailable)")
  );
  await send("Network.setCookie", {
    name: "alu_session",
    value: session,
    domain: "localhost",
    path: "/",
    httpOnly: true,
  });

  console.log("\n→ opening /reports");
  await navigate(`${BASE}/reports`, 6000);

  console.log("  sheet:", await evaluate(`
    JSON.stringify({
      present: !!document.querySelector(".rs"),
      width: document.querySelector(".rs")?.offsetWidth ?? 0,
      height: document.querySelector(".rs")?.offsetHeight ?? 0,
      tiles: document.querySelectorAll(".rs-tile").length,
      bars: document.querySelectorAll(".rs-bar").length,
      tableRows: document.querySelectorAll(".rs-table tbody tr").length,
    })
  `));
  console.log("  body  :", await evaluate(`document.body.innerText.replace(/\\s+/g," ").slice(0, 700)`));
  console.log("  state :", await evaluate(`
    JSON.stringify({
      skeletons: document.querySelectorAll('[aria-label="Loading"]').length,
      cards: document.querySelectorAll(".card").length,
      errorOverlay: !!document.querySelector("nextjs-portal"),
      exportBtnDisabled: [...document.querySelectorAll("button")].find(b=>/export pdf/i.test(b.textContent))?.disabled,
    })
  `));
  console.log("\n  ── NEXT ERROR OVERLAY ──");
  console.log(await evaluate(`
    (() => {
      const p = document.querySelector("nextjs-portal");
      if (!p || !p.shadowRoot) return "(no shadow root)";
      return p.shadowRoot.textContent.replace(/\\s+/g, " ").slice(0, 1500);
    })()
  `));
  console.log("  ── end overlay ──\n");
  await sleep(8000);
  console.log("  +8s   :", await evaluate(`
    JSON.stringify({
      skeletons: document.querySelectorAll('[aria-label="Loading"]').length,
      sheet: !!document.querySelector(".rs"),
      tiles: document.querySelectorAll(".rs-tile").length,
    })
  `));

  if (process.env.SHOT) {
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    const file = join(process.cwd(), "tmp-reports-preview.png");
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    console.log("  screenshot:", file, statSync(file).size, "bytes");
  }

  console.log("\n  ── button markup ──");
  console.log(await evaluate(`
    (() => {
      const b = [...document.querySelectorAll("button")].find(x => /export pdf/i.test(x.textContent));
      if (!b) return "(not found)";
      const r = b.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const top = document.elementFromPoint(cx, cy);
      return JSON.stringify({
        tag: b.tagName, cls: b.className, disabled: b.disabled,
        rect: {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)},
        topmostAtCenter: top ? top.tagName + "." + (top.className || "").toString().slice(0,60) : null,
        hasCanvas: !!b.querySelector("canvas"),
        html: b.outerHTML.slice(0, 300),
      }, null, 1);
    })()
  `));

  events.length = 0;
  console.log("\n→ instrumenting blob + anchor, then clicking Export PDF");

  // Capture what the export actually produces, independently of Chrome's
  // download plumbing, which mangles the filename in headless mode.
  await evaluate(`
    window.__cap = [];
    window.__lastBlob = null;
    const origCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (blob) {
      window.__cap.push({ kind: "blob", size: blob.size, type: blob.type });
      window.__lastBlob = blob;
      return origCreate(blob);
    };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      window.__cap.push({ kind: "anchor", download: this.download, href: String(this.href).slice(0, 60) });
      return origClick.call(this);
    };
    "ok"
  `);

  const pt = JSON.parse(await evaluate(`
    (() => {
      const b = [...document.querySelectorAll("button")].find(x => /export pdf/i.test(x.textContent));
      if (!b) return "{}";
      if (b.disabled) return JSON.stringify({disabled:true});
      const r = b.getBoundingClientRect();
      return JSON.stringify({x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)});
    })()
  `));
  if (pt.disabled) {
    console.log("  button is disabled");
  } else {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", { type, x: pt.x, y: pt.y, button: "left", clickCount: 1 });
    }
    console.log("  dispatched real click at", pt.x, pt.y);
  }

  // Toasts self-destruct after ~4.2s, so poll fast and record every one we see.
  // Note: SpecularButton does not forward aria-busy, so we cannot use the busy
  // flag as a completion signal — just watch for a toast, then a quiet period.
  const seenToasts = [];
  for (let i = 0; i < 150; i++) {
    await sleep(400);
    const snap = await evaluate(`
      JSON.stringify({
        toasts: [...document.querySelectorAll(".toast")].map(t => t.textContent.trim()),
        busy: !!document.querySelector('[aria-busy="true"]'),
      })
    `);
    let s;
    try { s = JSON.parse(snap); } catch { continue; }
    let fresh = false;
    for (const t of s.toasts) if (!seenToasts.includes(t)) { seenToasts.push(t); fresh = true; }
    if (fresh) break;
  }
  console.log("  toasts seen:", JSON.stringify(seenToasts));
  console.log("  captured   :", await evaluate(`JSON.stringify(window.__cap)`));

  // Pull the real PDF bytes out so the file itself can be verified.
  const b64 = await evaluate(
    `
    new Promise((res) => {
      if (!window.__lastBlob) return res("");
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(",")[1] || "");
      fr.readAsDataURL(window.__lastBlob);
    })
  `,
    true
  );
  if (b64) {
    const out = join(process.cwd(), "tmp-report-export.pdf");
    writeFileSync(out, Buffer.from(b64, "base64"));
    const buf = readFileSync(out);
    console.log(`  wrote ${out}`);
    console.log(`    size   : ${buf.length} bytes`);
    console.log(`    header : ${JSON.stringify(buf.subarray(0, 8).toString("latin1"))}`);
    console.log(`    trailer: ${JSON.stringify(buf.subarray(-8).toString("latin1"))}`);
    const text = buf.toString("latin1");
    console.log(`    /Type/Page count: ${(text.match(/\/Type\s*\/Page[^s]/g) || []).length}`);
  } else {
    console.log("  (no blob captured)");
  }

  console.log("\n--- page console / exceptions (from load) ---");
  if (events.length === 0) console.log("  (none)");
  for (const e of events) console.log(`  [${e.kind}] ${e.text}`);

  console.log("\n--- downloads ---");
  const files = existsSync(downloads) ? readdirSync(downloads).filter((f) => !f.endsWith(".crdownload")) : [];
  if (files.length === 0) console.log("  (nothing written)");
  for (const f of files) {
    const p = join(downloads, f);
    const head = readFileSync(p).subarray(0, 24);
    console.log(`  ${f}  ${statSync(p).size} bytes`);
    console.log(`      head: ${JSON.stringify(head.toString("latin1"))}`);
  }
} catch (err) {
  console.error("\nHARNESS ERROR:", err.message);
  for (const e of events) console.error(`  [${e.kind}] ${e.text}`);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  if (!KEEP) try { rmSync(downloads, { recursive: true, force: true }); } catch {}
}
