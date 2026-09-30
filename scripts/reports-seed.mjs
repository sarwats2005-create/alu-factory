/**
 * Creates throwaway sales so the report module can be exercised against data
 * that actually has revenue in it — including one IQD invoice, which is what
 * the USD-normalisation path exists for.
 *
 * Prints a cleanup recipe on completion. Run `node scripts/reports-seed.mjs`.
 */

const BASE = process.env.BASE_URL || "http://localhost:3400";
const EMAIL = process.env.OWNER_EMAIL || "blbas11@gmail.com";
const PASSWORD = process.env.OWNER_PASSWORD || "blbas123";

let cookie = "";

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, ...json };
}

const login = await api("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
if (login.status !== 200) {
  console.error("login failed", JSON.stringify(login));
  process.exit(1);
}

const customers = await api("GET", "/api/customers?page=1&pageSize=10");
// /api/inventory/options omits the item id, so read the full list instead.
const inventory = await api("GET", "/api/inventory?page=1&pageSize=20");

const cust = customers.rows?.[0];
const item = inventory.rows?.find((i) => Number(i.available) > 80) ?? inventory.rows?.[0];

if (!cust || !item) {
  console.error("need at least one customer and one inventory item first");
  process.exit(1);
}

console.log(`Customer: ${cust.fullName}`);
console.log(`Item: ${item.name} (${item.sku}) — ${item.available} kg available`);

const created = [];

// 1. A plain USD invoice, partly paid.
const usd = await api("POST", "/api/sales", {
  customerId: cust.id,
  currency: "USD",
  vaultCurrency: "USD",
  cashPaid: 300,
  saleDate: new Date().toISOString().slice(0, 10),
  notes: "report smoke test",
  lineItems: [{ itemId: item.id, saleType: "RAW", weightKg: 100, unitPrice: 4.5 }],
});
console.log("USD sale:", usd.status, usd.sale?.invoiceNo ?? JSON.stringify(usd).slice(0, 200));
if (usd.sale?.id) created.push(usd.sale.id);

// 2. An IQD invoice — this is the one that exposes mixed-currency P&L bugs.
const iqd = await api("POST", "/api/sales", {
  customerId: cust.id,
  currency: "IQD",
  vaultCurrency: "IQD",
  cashPaid: 0,
  saleDate: new Date().toISOString().slice(0, 10),
  notes: "report smoke test iqd",
  lineItems: [{ itemId: item.id, saleType: "RAW", weightKg: 80, unitPrice: 6000 }],
});
console.log("IQD sale:", iqd.status, iqd.sale?.invoiceNo ?? JSON.stringify(iqd).slice(0, 200));
if (iqd.sale?.id) created.push(iqd.sale.id);

if (created.length) {
  console.log(`\nCreated sale ids: ${created.join(", ")}`);
  console.log("Delete with:");
  for (const id of created) {
    console.log(`  curl -X DELETE ${BASE}/api/sales/${id} -H "cookie: <session>"`);
  }
} else {
  console.log("\nNo sales created.");
}
