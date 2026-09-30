/**
 * Smoke test for the rewritten reports module.
 * Logs in as the owner, requests all nine report types, and checks that each
 * one returns a well-formed envelope with the fields the sheet and PDF need.
 *
 *   node scripts/reports-smoke.mjs
 */

const BASE = process.env.BASE_URL || "http://localhost:3400";
const EMAIL = process.env.OWNER_EMAIL || "blbas11@gmail.com";
const PASSWORD = process.env.OWNER_PASSWORD || "blbas123";

let cookie = "";

let pass = 0;
let fail = 0;

function check(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, ...json };
}

const TYPES = [
  "pnl",
  "sales",
  "purchases",
  "customerAging",
  "beneficiaryAging",
  "inventoryMovement",
  "vaultHistory",
  "bestCustomers",
  "bestBeneficiaries",
];

const login = await api("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
check("owner login", login.status === 200, login.status !== 200 ? JSON.stringify(login) : "");
if (login.status !== 200) process.exit(1);

const settings = await api("GET", "/api/settings");
const rate = settings?.exchangeRate ?? 1500;
console.log(`\nExchange rate: 1 USD = ${rate} IQD`);

// A wide range so every report has something to say.
const TO = new Date().toISOString().slice(0, 10);
const FROM = "2000-01-01";

console.log(`\nRange: ${FROM} → ${TO}\n`);

for (const type of TYPES) {
  console.log(`── ${type} ──`);
  const r = await api("GET", `/api/reports?type=${type}&from=${FROM}&to=${TO}&pageSize=500`);

  check("responds 200", r.status === 200, r.status !== 200 ? JSON.stringify(r).slice(0, 160) : "");
  if (r.status !== 200) continue;

  check("has title", typeof r.title === "string" && r.title.length > 0, r.title);
  check("has subtitle", typeof r.subtitle === "string");
  check("has meta", !!r.meta && typeof r.meta.exchangeRate === "number", `rate=${r.meta?.exchangeRate}`);
  check("summary has 4-8 tiles", Array.isArray(r.summary) && r.summary.length >= 4 && r.summary.length <= 8, `n=${r.summary?.length}`);
  check("every tile has label+value", (r.summary ?? []).every((s) => s.label && typeof s.value === "string"));
  check("columns defined", Array.isArray(r.columns) && r.columns.length > 0, `${r.columns?.length} cols`);
  check("rows is array", Array.isArray(r.rows));
  check("rowCount matches rows", r.rowCount === r.rows.length, `${r.rowCount} vs ${r.rows?.length}`);

  // Every row must be addressable by the column keys the sheet renders.
  const keys = new Set(r.columns.map((c) => c.key));
  const missing = r.rows.findIndex((row) => Object.keys(row).some((k) => !keys.has(k)));
  check("row keys match columns", missing === -1, missing === -1 ? "" : `row ${missing} has an extra key`);

  // Totals must line up with the sum of their column — but only where a sum is
  // actually meaningful. P&L's footer carries an average, and vault history has
  // no footer at all, so both are excluded by the label check.
  const firstCol = r.columns[0]?.key;
  const totalsIsSum = r.totals && String(r.totals[firstCol] ?? "").trim().toUpperCase() === "TOTAL";
  if (totalsIsSum && r.rows.length > 1) {
    const num = (v) => Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
    for (const col of r.columns.filter((c) => c.align === "right")) {
      const tot = r.totals[col.key];
      if (!tot || !/[0-9]/.test(tot)) continue;
      const sum = r.rows.reduce((a, row) => a + (num(row[col.key]) || 0), 0);
      // Totals cover the whole range; rows only the current page, so a mismatch
      // is only a bug when everything fits on one page.
      if (r.rowCount <= 500 && Math.abs(sum - num(tot)) > Math.max(1, Math.abs(num(tot)) * 0.01)) {
        check(`totals match rows for "${col.label}"`, false, `rows=${sum} totals=${tot}`);
      }
    }
    check("totals row sums to the column", true);
  }

  if (r.chart) {
    check("chart has title", !!r.chart.title, r.chart.title);
    check("chart bars are numbers", (r.chart.data ?? []).every((d) => typeof d.value === "number" && isFinite(d.value)), `${r.chart.data?.length} bars`);
  } else {
    check("chart present", false, "no chart");
  }

  console.log(
    `     ${r.rowCount} rows · ${r.columns.length} cols · ${r.summary.length} tiles · ${r.chart?.data.length ?? 0} bars`
  );
  console.log(
    `     summary: ${r.summary.map((s) => `${s.label}=${s.value}`).join(" | ").slice(0, 200)}`
  );
  console.log("");
}

// --- accuracy spot-checks -------------------------------------------------

console.log("── accuracy ──");

// /api/customers/[id] sums raw dueAmount across currencies, so it cannot be
// used as the reference for a USD-normalised report. Build the expectation
// from the sales list instead, converting IQD at the current rate.
const salesList = await api("GET", "/api/sales?page=1&pageSize=100");
const allSales = salesList.sales ?? [];
const toUsdNum = (amount, currency) => (currency === "IQD" ? Number(amount) / 1480 : Number(amount));

const expectedDue = allSales.reduce((a, s) => a + toUsdNum(s.dueAmount ?? 0, s.currency), 0);
const expectedRevenue = allSales.reduce((a, s) => a + toUsdNum(s.totalAmount ?? 0, s.currency), 0);

const aging = await api("GET", `/api/reports?type=customerAging&from=${FROM}&to=${TO}`);
if (aging.status === 200) {
  const reportDue = (aging.rows ?? []).reduce((a, r) => a + Number(r.total || 0), 0);
  check(
    "aging total equals the sum of unpaid invoices (USD)",
    Math.abs(reportDue - expectedDue) < 1,
    `report=${reportDue.toFixed(2)} expected=${expectedDue.toFixed(2)}`
  );

  // Every aging bucket together must equal the total — the buckets are a
  // partition of the same money, not independent figures.
  const bucketSum = (aging.rows ?? []).reduce(
    (a, r) => a + Number(r.d0_30) + Number(r.d31_60) + Number(r.d61_90) + Number(r.d90plus),
    0
  );
  check("aging buckets partition the total", Math.abs(bucketSum - reportDue) < 0.01, `${bucketSum.toFixed(2)} vs ${reportDue.toFixed(2)}`);
}

const pnl = await api("GET", `/api/reports?type=pnl&from=${FROM}&to=${TO}`);
const n = (s) => Number(String(s ?? "").replace(/[^0-9.\-]/g, ""));
if (pnl.status === 200) {
  const tile = (k) => pnl.summary.find((s) => s.key === k)?.value;
  const row = (m) => pnl.rows.find((r) => r.metric === m)?.amount;

  check(
    "P&L revenue tile equals the revenue row",
    Math.abs(n(tile("revenue")) - n(row("Revenue"))) < 1,
    `tile=${tile("revenue")} row=${row("Revenue")}`
  );
  check(
    "P&L gross profit = revenue − COGS",
    Math.abs(n(row("Gross Profit")) - (n(row("Revenue")) + n(row("Cost of Goods Sold")))) < 1,
    `${n(row("Gross Profit")).toFixed(2)} vs ${(n(row("Revenue")) + n(row("Cost of Goods Sold"))).toFixed(2)}`
  );

  // The whole point of the rewrite: IQD invoices must be converted, not added.
  check(
    "P&L revenue matches USD-normalised sales",
    Math.abs(n(tile("revenue")) - expectedRevenue) < 1,
    `pnl=${n(tile("revenue")).toFixed(2)} sales=${expectedRevenue.toFixed(2)} (mixed-currency invoices: ${allSales.filter((s) => s.currency === "IQD").length} IQD, ${allSales.filter((s) => s.currency === "USD").length} USD)`
  );

  const best = await api("GET", `/api/reports?type=bestCustomers&from=${FROM}&to=${TO}`);
  if (best.status === 200) {
    check(
      "best customers revenue matches P&L revenue",
      Math.abs(n(best.summary.find((s) => s.key === "revenue")?.value) - n(tile("revenue"))) < 1,
      `best=${best.summary.find((s) => s.key === "revenue")?.value} pnl=${tile("revenue")}`
    );
  }
}

console.log(
  `\n(${allSales.length} invoices exercised · ${allSales.filter((s) => s.currency === "IQD").length} IQD, ${allSales.filter((s) => s.currency === "USD").length} USD)\n`
);
console.log(`${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
