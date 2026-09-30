/**
 * Screenshots a page from the running app via headless Chrome + CDP.
 *
 *   node scripts/shot.mjs /customers out.png
 */

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3400";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PATH_ARG = process.argv[2] || "/reports";
const OUT = process.argv[3] || "tmp-shot.png";
const PORT = 9377;

const profile = mkdtempSync(join(tmpdir(), "shot-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
   "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--window-size=1600,1200", "about:blank"],
  { stdio: "ignore" }
);

let ws;
let nextId = 1;
const pending = new Map();

function send(method, params = {}, timeoutMs = 40000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }
    }, timeoutMs);
  });
}

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval failed");
  return r.result?.value;
}

try {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.OWNER_EMAIL || "blbas11@gmail.com", password: process.env.OWNER_PASSWORD || "blbas123" }),
  });
  const session = /alu_session=([^;]+)/.exec(login.headers.get("set-cookie") || "")?.[1];
  if (!session) throw new Error("login failed");

  let target;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (target) break;
    } catch {}
    await sleep(250);
  }
  if (!target) throw new Error("no chrome target");

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Network.setCookie", { name: "alu_session", value: session, domain: "localhost", path: "/", httpOnly: true });

  await send("Page.navigate", { url: `${BASE}${PATH_ARG}` });
  await sleep(7000);

  const errors = await evaluate(`document.body.innerText.slice(0, 120)`);
  console.log("page text:", errors.replace(/\s+/g, " "));

  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("wrote", OUT, statSync(OUT).size, "bytes");
} catch (e) {
  console.error("ERROR:", e.message);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}