// ALU FACTORY — i18n: English + Kurdish Sorani (کوردی سۆرانی) with RTL
//
// Usage in any client component:
//   import { useLang } from "@/lib/i18n";
//   const { lang, t, isRtl } = useLang();   // t is already bound to the current language
//   <h1>{t("dashTitle")}</h1>
//
// The current language is shared through the `alu-lang-change` DOM event that
// AppShell dispatches whenever the user toggles the language, so every
// component re-renders with the right strings — no prop drilling.
//
// Note: the language code stays "ku" internally (localStorage / event payload),
// but for <html lang="…"> use htmlLang(lang) — Sorani's proper tag is "ckb".

import { useEffect, useState, useCallback } from "react";

export type Lang = "en" | "ku";

type Entry = { en: string; ku: string };

export const LANG_STORAGE_KEY = "alu_lang";
export const LANG_EVENT = "alu-lang-change";

export const dict: Record<string, Entry> = {
  // Common
  appName: { en: "ALU FACTORY", ku: "ئەل یو فاکتۆری" },
  tagline: { en: "Operations Management", ku: "بەڕێوەبردنی کارەکان" },
  signIn: { en: "Sign In", ku: "چوونە ژوورەوە" },
  signOut: { en: "Sign Out", ku: "چوونە دەرەوە" },
  email: { en: "Email", ku: "ئیمەیڵ" },
  password: { en: "Password", ku: "وشەی نهێنی" },
  save: { en: "Save", ku: "پاشەکەوتکردن" },
  cancel: { en: "Cancel", ku: "پاشگەزبوونەوە" },
  delete: { en: "Delete", ku: "سڕینەوە" },
  confirmDelete: { en: "Are you sure? This action cannot be undone.", ku: "دڵنیایت؟ ئەم کردارە ناتوانرێت بگەڕێنرێتەوە." },
  add: { en: "Add", ku: "زیادکردن" },
  edit: { en: "Edit", ku: "دەستکاری" },
  view: { en: "View", ku: "بینین" },
  search: { en: "Search", ku: "گەڕان" },
  searchByName: { en: "Search by name…", ku: "گەڕان بە ناو…" },
  actions: { en: "Actions", ku: "کردارەکان" },
  date: { en: "Date", ku: "بەروار" },
  total: { en: "Total", ku: "کۆی گشتی" },
  status: { en: "Status", ku: "دۆخ" },
  notes: { en: "Notes", ku: "تێبینی" },
  currency: { en: "Currency", ku: "دراو" },
  amount: { en: "Amount", ku: "بڕ" },
  weight: { en: "Weight", ku: "کێش" },
  weightKg: { en: "Weight (kg)", ku: "کێش (kg)" },
  unitPrice: { en: "Unit Price", ku: "نرخی یەکە" },
  type: { en: "Type", ku: "جۆر" },
  reference: { en: "Reference", ku: "ژمارەی ئاماژە" },
  description: { en: "Description", ku: "وەسف" },
  party: { en: "Party", ku: "لایەن" },
  product: { en: "Product", ku: "بەرهەم" },
  products: { en: "Products", ku: "بەرهەمەکان" },
  loading: { en: "Loading…", ku: "بارکردن…" },
  noData: { en: "No data found.", ku: "هیچ داتایەک نەدۆزرایەوە." },
  yes: { en: "Yes", ku: "بەڵێ" },
  no: { en: "No", ku: "نەخێر" },
  perPage: { en: "Per page", ku: "لە هەر لاپەڕەیەک" },
  confirm: { en: "Confirm", ku: "دڵنیاکردنەوە" },
  close: { en: "Close", ku: "داخستن" },
  update: { en: "Update", ku: "نوێکردنەوە" },
  create: { en: "Create", ku: "دروستکردن" },
  more: { en: "More", ku: "زیاتر" },
  markAllRead: { en: "Mark all read", ku: "هەمووی وەک خوێندراوە نیشانە بکە" },

  // Nav
  navDashboard: { en: "Dashboard", ku: "داشبۆرد" },
  navCustomers: { en: "Customers", ku: "کڕیارەکان" },
  navBeneficiaries: { en: "Beneficiaries", ku: "دابینکەرەکان" },
  navInventory: { en: "Inventory", ku: "کۆگا" },
  navPos: { en: "Point of Sale", ku: "خاڵی فرۆشتن" },
  navPosShort: { en: "Sales", ku: "فرۆشتن" },
  navInvoices: { en: "Invoices", ku: "پسوڵەکان" },
  navVault: { en: "Vault", ku: "گەنجینە" },
  navReports: { en: "Reports", ku: "ڕاپۆرتەکان" },
  navSettings: { en: "Settings", ku: "ڕێکخستنەکان" },

  // Auth
  welcomeBack: { en: "Welcome back", ku: "بەخێربێیتەوە" },
  loginSub: { en: "Sign in to manage factory operations", ku: "بچۆ ژوورەوە بۆ بەڕێوەبردنی کارەکانی فاکتۆری" },
  invalidCredentials: { en: "Invalid email or password.", ku: "ئیمەیڵ یان وشەی نهێنی هەڵەیە." },
  sessionExpired: { en: "Session expired. Please sign in again.", ku: "کاتی چوونە ژوورەوەکەت بەسەرچوو. تکایە دووبارە بچۆ ژوورەوە." },
  deactivatedMsg: { en: "Your account has been deactivated.", ku: "هەژمارەکەت ناچالاک کراوە." },

  // Dashboard
  dashTitle: { en: "Dashboard", ku: "داشبۆرد" },
  dashSub: { en: "Business health at a glance", ku: "دۆخی بازرگانی بە یەک چاو" },
  newSale: { en: "New Sale", ku: "فرۆشتنی نوێ" },
  newPurchase: { en: "New Purchase", ku: "کڕینی نوێ" },
  pnlAllTime: { en: "Profit / Loss, all time", ku: "قازانج / زیان، لە سەرەتاوە" },
  salesExceedCost: { en: "Sales exceed cost of goods", ku: "فرۆشتن لە تێچووی کاڵا زیاترە" },
  costExceedSales: { en: "Cost of goods exceed sales", ku: "تێچووی کاڵا لە فرۆشتن زیاترە" },
  vaultCombined: { en: "Vault, combined", ku: "گەنجینە، کۆکراوە" },
  salesThisMonth: { en: "Sales this month", ku: "فرۆشتنی ئەم مانگە" },
  allTime: { en: "All time", ku: "لە سەرەتاوە" },
  bestCustomer: { en: "Best customer", ku: "باشترین کڕیار" },
  bestBeneficiary: { en: "Best beneficiary", ku: "باشترین دابینکەر" },
  inPurchases: { en: "in purchases", ku: "لە کڕینەکان" },
  supplied: { en: "supplied", ku: "دابینکراو" },
  noSalesYet: { en: "No sales yet", ku: "هێشتا فرۆشتنێک نییە" },
  noPurchasesYet: { en: "No purchases yet", ku: "هێشتا کڕینێک نییە" },
  revenueAllTime: { en: "Revenue, all time", ku: "داهات، لە سەرەتاوە" },
  purchasesAllTime: { en: "Purchases, all time", ku: "کڕینەکان، لە سەرەتاوە" },
  customerDues: { en: "Customers owe you", ku: "قەرزی کڕیارەکان" },
  owedByCustomers: { en: "Owed by customers", ku: "قەرزی سەر کڕیارەکان" },
  supplierDues: { en: "You owe suppliers", ku: "قەرزی دابینکەرەکان" },
  owedToSuppliers: { en: "Unpaid purchases minus later payments", ku: "کڕینی نەدراو دوای پارەدانەکان" },
  nothingOutstanding: { en: "Nothing outstanding", ku: "هیچ قەرزێک نییە" },
  monthlyPnl: { en: "Monthly P&L", ku: "قازانج/زیانی مانگانە" },
  salesByMonth: { en: "Sales by Month", ku: "فرۆشتن بەپێی مانگ" },
  last12Months: { en: "Last 12 months", ku: "دوایین ١٢ مانگ" },
  revenueTrend: { en: "Revenue trend", ku: "ڕەوتی داهات" },
  top5Customers: { en: "Top 5 Customers", ku: "٥ باشترین کڕیار" },
  top5Beneficiaries: { en: "Top 5 Beneficiaries", ku: "٥ باشترین دابینکەر" },
  recentTransactions: { en: "Recent Transactions", ku: "مامەڵەکانی دوایی" },
  viewAll: { en: "View all", ku: "هەمووی ببینە" },
  nothingRecordedYet: { en: "Nothing recorded yet. Your purchases and sales appear here as you make them.", ku: "هێشتا هیچ تۆمار نەکراوە. کڕین و فرۆشتنەکانت لێرە دەردەکەون کاتێک ئەنجامیان دەدەیت." },
  nothingChartedYet: { en: "Nothing charted yet", ku: "هێشتا هیچ نەخشێنراوە" },
  chartFillHint: { en: "Record a purchase or a sale and this fills in.", ku: "کڕینێک یان فرۆشتنێک تۆمار بکە و ئەمە پڕ دەبێت." },
  noDataYet: { en: "No data yet.", ku: "هێشتا داتا نییە." },
  alerts: { en: "Alerts", ku: "هۆشدارییەکان" },
  noAlerts: { en: "No alerts — all clear.", ku: "هیچ هۆشدارییەک نییە — هەموو شتێک باشە." },
  sale: { en: "Sale", ku: "فرۆشتن" },
  purchase: { en: "Purchase", ku: "کڕین" },
  paid: { en: "Paid", ku: "پارەدراو" },
  unpaid: { en: "Unpaid", ku: "نەپارەدراو" },

  // Customers
  customersTitle: { en: "Customers", ku: "کڕیارەکان" },
  customersSub: { en: "Track dues, balances, and history per customer", ku: "بەدواداچوونی قەرز، باڵانس و مێژووی هەر کڕیارێک" },
  addCustomer: { en: "Add Customer", ku: "زیادکردنی کڕیار" },
  editCustomer: { en: "Edit Customer", ku: "دەستکاری کڕیار" },
  deleteCustomer: { en: "Delete Customer", ku: "سڕینەوەی کڕیار" },
  customerOwesFactory: { en: "Customer owes factory", ku: "کڕیار قەرزاری فاکتۆرییە" },
  settled: { en: "Settled", ku: "تەواوکراو" },
  balanceState: { en: "Balance State", ku: "دۆخی باڵانس" },
  dueAmount: { en: "Due Amount", ku: "بڕی قەرز" },
  phone: { en: "Phone", ku: "تەلەفۆن" },
  address: { en: "Address", ku: "ناونیشان" },
  fullName: { en: "Full Name", ku: "ناوی تەواو" },
  profilePicture: { en: "Profile Picture", ku: "وێنەی پرۆفایل" },
  allBalances: { en: "All balances", ku: "هەموو باڵانسەکان" },
  cashReceived: { en: "Cash Received", ku: "پارەی وەرگیراو" },
  dueBalance: { en: "Due Balance", ku: "باڵانسی قەرز" },
  netPosition: { en: "Net Position", ku: "دۆخی پوخت" },
  perCustProfit: { en: "Per-Customer Profit", ku: "قازانجی هەر کڕیارێک" },
  txHistory: { en: "Transaction History", ku: "مێژووی مامەڵەکان" },
  exportCsv: { en: "Export CSV", ku: "هەناردەکردنی CSV" },
  printStatement: { en: "Print Statement", ku: "چاپکردنی ڕاپۆرت" },
  receivePayment: { en: "Receive Payment", ku: "وەرگرتنی پارە" },
  payBeneficiary: { en: "Pay Beneficiary", ku: "پارەدان بە دابینکەر" },
  recordPayment: { en: "Record Payment", ku: "تۆمارکردنی پارەدان" },
  creditBalance: { en: "Credit balance", ku: "باڵانسی کرێدت" },
  overpaid: { en: "Overpaid", ku: "زیادە پارەدراو" },
  invoiceNo: { en: "Invoice #", ku: "ژمارەی پسوڵە" },
  vaultUsed: { en: "Vault", ku: "گەنجینە" },
  currentDue: { en: "Current due balance", ku: "باڵانسی قەرزی ئێستا" },
  customerOwesFactoryMsg: { en: "Customer owes factory", ku: "کڕیار قەرزاری فاکتۆرییە" },
  factoryOwesBeneficiaryMsg: { en: "Factory owes beneficiary", ku: "فاکتۆری قەرزاری دابینکەرە" },
  noSalesForCustomer: { en: "No sales recorded for this customer yet.", ku: "هێشتا هیچ فرۆشتنێک بۆ ئەم کڕیارە تۆمار نەکراوە." },
  emptyCustomers: { en: "No customers yet", ku: "هێشتا کڕیارێک نییە" },
  emptyCustomersMsg: { en: "Add your first customer to start recording sales and tracking dues.", ku: "یەکەم کڕیارت زیاد بکە بۆ تۆمارکردنی فرۆشتن و بەدواداچوونی قەرز." },
  customerUpdated: { en: "Customer updated.", ku: "کڕیار نوێکرایەوە." },
  customerAdded: { en: "Customer added.", ku: "کڕیار زیادکرا." },
  customerDeleted: { en: "Customer deleted.", ku: "کڕیار سڕایەوە." },
  deleteCustomerConfirm: { en: "Delete", ku: "سڕینەوە" },
  deleteConfirmPrefix: { en: "Delete", ku: "سڕینەوەی" },
  imageTooBig: { en: "Image must be under 1 MB.", ku: "وێنە دەبێت لە ١ MB کەمتر بێت." },

  // Beneficiaries
  beneficiariesTitle: { en: "Beneficiaries", ku: "دابینکەرەکان" },
  beneficiariesSub: { en: "Raw-material suppliers and what the factory owes them", ku: "دابینکەرانی ماددەی خاو و ئەو بڕەی فاکتۆری قەرزاریانە" },
  addBeneficiary: { en: "Add Beneficiary", ku: "زیادکردنی دابینکەر" },
  editBeneficiary: { en: "Edit Beneficiary", ku: "دەستکاری دابینکەر" },
  deleteBeneficiary: { en: "Delete Beneficiary", ku: "سڕینەوەی دابینکەر" },
  factoryOwesBeneficiary: { en: "Factory owes beneficiary", ku: "فاکتۆری قەرزاری دابینکەرە" },
  beneficiaryOwesFactory: { en: "Beneficiary owes factory", ku: "دابینکەر قەرزاری فاکتۆرییە" },
  totalPurchases: { en: "Total Purchases", ku: "کۆی کڕینەکان" },
  purchasesCount: { en: "purchase(s)", ku: "کڕین" },
  totalPaid: { en: "Total Paid", ku: "کۆی پارەدراو" },
  totalWeight: { en: "Total Weight", ku: "کۆی کێش" },
  purchaseHistory: { en: "Purchase History", ku: "مێژووی کڕین" },
  noPurchasesRecorded: { en: "No purchases recorded yet.", ku: "هێشتا هیچ کڕینێک تۆمار نەکراوە." },
  beneficiaryUpdated: { en: "Beneficiary updated.", ku: "دابینکەر نوێکرایەوە." },
  beneficiaryAdded: { en: "Beneficiary added.", ku: "دابینکەر زیادکرا." },
  beneficiaryDeleted: { en: "Beneficiary deleted.", ku: "دابینکەر سڕایەوە." },
  emptyBeneficiaries: { en: "No beneficiaries yet", ku: "هێشتا دابینکەرێک نییە" },
  emptyBeneficiariesMsg: { en: "Add a beneficiary to record your first raw material purchase.", ku: "دابینکەرێک زیاد بکە بۆ تۆمارکردنی یەکەم کڕینی ماددەی خاو." },
  paymentRecorded: { en: "Payment recorded.", ku: "پارەدان تۆمارکرا." },
  paymentFailed: { en: "Payment failed", ku: "پارەدان سەرکەوتوو نەبوو" },
  beneficiaryNotFound: { en: "Beneficiary not found.", ku: "دابینکەر نەدۆزرایەوە." },
  customerNotFound: { en: "Customer not found.", ku: "کڕیار نەدۆزرایەوە." },

  // Inventory
  inventoryTitle: { en: "Inventory", ku: "کۆگا" },
  processLoss: { en: "Process Loss", ku: "زیانی پرۆسە" },
  restock: { en: "Restock", ku: "پڕکردنەوەی کۆگا" },
  lossPct: { en: "Loss %", ku: "ڕێژەی زیان (%)" },
  byPercent: { en: "By percentage", ku: "بەپێی ڕێژە" },
  byManual: { en: "By exact remaining weight", ku: "بەپێی کێشی ماوە" },
  manualRemaining: { en: "Remaining weight (kg)", ku: "کێشی ماوە (kg)" },
  resultAfterLoss: { en: "Result", ku: "ئەنجام" },
  sku: { en: "SKU", ku: "کۆدی SKU" },
  productName: { en: "Product Name", ku: "ناوی بەرهەم" },
  aluminumType: { en: "Aluminum Type", ku: "جۆری ئەلومینیۆم" },
  inStock: { en: "In Stock", ku: "بەردەستە" },
  lowStock: { en: "Low Stock", ku: "کەمە" },
  outOfStock: { en: "Out of Stock", ku: "تەواوبوو" },
  totalPurchased: { en: "Total Purchased (kg)", ku: "کۆی کڕدراو (kg)" },
  totalProcessed: { en: "Loss Applied (kg)", ku: "زیانی جێبەجێکراو (kg)" },
  availableKg: { en: "Available (kg)", ku: "بەردەست (kg)" },
  itemHistory: { en: "Item History", ku: "مێژووی کاڵا" },
  emptyInventory: { en: "No inventory yet. Purchase raw material from a beneficiary to add stock.", ku: "هێشتا کۆگا نییە. ماددەی خاو لە دابینکەرێک بکڕە بۆ زیادکردنی کۆگا." },

  // POS
  posTitle: { en: "Point of Sale", ku: "خاڵی فرۆشتن" },
  customer: { en: "Customer", ku: "کڕیار" },
  addNewCustomer: { en: "+ Add New Customer", ku: "+ زیادکردنی کڕیاری نوێ" },
  available: { en: "Available", ku: "بەردەست" },
  useMax: { en: "USE MAX", ku: "زۆرترین" },
  addLineItem: { en: "Add Line Item", ku: "زیادکردنی کاڵا" },
  invoiceTotal: { en: "Invoice Total", ku: "کۆی پسوڵە" },
  cashPaid: { en: "Cash Paid", ku: "پارەی نەقد" },
  posDueAmount: { en: "Due — Customer owes factory", ku: "قەرز — کڕیار قەرزاری فاکتۆرییە" },
  confirmSale: { en: "Confirm Sale & Generate Invoice", ku: "دڵنیاکردنەوەی فرۆشتن و دروستکردنی پسوڵە" },
  saleSuccess: { en: "Sale recorded — invoice generated.", ku: "فرۆشتن تۆمارکرا — پسوڵە دروستکرا." },
  lineTotal: { en: "Line Total", ku: "کۆی کاڵا" },
  saleTypeRaw: { en: "Raw by Weight", ku: "خاو بەپێی کێش" },
  saleTypeFinished: { en: "Finished Product", ku: "بەرهەمی ئامادەکراو" },
  emptyPos: { en: "No sales yet. Select a customer and add products to create your first invoice.", ku: "هێشتا فرۆشتنێک نییە. کڕیارێک هەڵبژێرە و بەرهەم زیاد بکە بۆ دروستکردنی یەکەم پسوڵە." },
  editingTx: { en: "EDITING TRANSACTION", ku: "دەستکاری مامەڵە" },
  deleteSaleConfirm: { en: "Delete sale", ku: "سڕینەوەی فرۆشتن" },
  deleteSaleWarning: { en: "Inventory and vault effects will be reversed. This action cannot be undone.", ku: "کاریگەری کۆگا و گەنجینە دەگەڕێنرێنەوە. ئەم کردارە ناتوانرێت بگەڕێنرێتەوە." },
  saleDeleted: { en: "Sale deleted — inventory and vault restored.", ku: "فرۆشتن سڕایەوە — کۆگا و گەنجینە گەڕێنرانەوە." },

  // Vault
  vaultTitle: { en: "Vault", ku: "گەنجینە" },
  usdVault: { en: "USD Vault", ku: "گەنجینەی دۆلار" },
  iqdVault: { en: "IQD Vault", ku: "گەنجینەی دینار" },
  totalIn: { en: "Total In", ku: "کۆی هاتنە ژوورەوە" },
  totalOut: { en: "Total Out", ku: "کۆی چوونە دەرەوە" },
  balanceHistory: { en: "Balance History (30 days)", ku: "مێژووی باڵانس (٣٠ ڕۆژ)" },
  deposit: { en: "Deposit", ku: "دانانی پارە" },
  withdrawal: { en: "Withdrawal", ku: "دەرهێنانی پارە" },
  exchangeRate: { en: "Exchange Rate", ku: "نرخی ئاڵوگۆڕ" },
  editRate: { en: "Edit Rate", ku: "گۆڕینی نرخ" },
  rateSaved: { en: "Exchange rate saved.", ku: "نرخی ئاڵوگۆڕ پاشەکەوتکرا." },
  vaultHistory: { en: "Vault Transaction History", ku: "مێژووی مامەڵەکانی گەنجینە" },
  deficit: { en: "Deficit", ku: "کەمیی باڵانس" },
  balanceAfter: { en: "Balance After", ku: "باڵانسی دواتر" },
  emptyVault: { en: "No transactions recorded yet.", ku: "هێشتا مامەڵەیەک تۆمار نەکراوە." },
  operationFailed: { en: "Operation failed", ku: "کردارەکە سەرکەوتوو نەبوو" },
  depositRecorded: { en: "Deposit recorded.", ku: "دانانی پارە تۆمارکرا." },
  withdrawalRecorded: { en: "Withdrawal recorded.", ku: "دەرهێنانی پارە تۆمارکرا." },
  saveRate: { en: "Save Rate", ku: "پاشەکەوتکردنی نرخ" },
  currentRate: { en: "Current rate", ku: "نرخی ئێستا" },
  rateLoggedNote: {
    en: "Every rate change is logged with a timestamp in Settings → Rate History.",
    ku: "هەموو گۆڕانکارییەکی نرخ لەگەڵ کات تۆمار دەکرێت لە ڕێکخستنەکان → مێژووی نرخ.",
  },
  rateViewOnly: {
    en: "You have view-only access. Only an owner can change the exchange rate.",
    ku: "تۆ تەنها دەتوانیت ببینیت. تەنها خاوەن دەتوانێت نرخی ئاڵوگۆڕ بگۆڕێت.",
  },
  rateSaveFailed: { en: "Failed to save rate", ku: "پاشەکەوتکردنی نرخ سەرکەوتوو نەبوو" },

  // Reports
  reportsTitle: { en: "Reports", ku: "ڕاپۆرتەکان" },
  reportsSub: { en: "Business performance across every module", ku: "ئەدای بازرگانی لە هەموو بەشەکان" },
  pnlReport: { en: "Overall P&L Report", ku: "ڕاپۆرتی گشتی قازانج/زیان" },
  salesReport: { en: "Sales Report", ku: "ڕاپۆرتی فرۆشتن" },
  purchaseReport: { en: "Purchase Report", ku: "ڕاپۆرتی کڕین" },
  custAging: { en: "Customer Due Aging", ku: "تەمەنی قەرزی کڕیاران" },
  benAging: { en: "Beneficiary Due Aging", ku: "تەمەنی قەرزی دابینکەران" },
  invMovement: { en: "Inventory Movement", ku: "جوڵەی کۆگا" },
  vaultHistoryReport: { en: "Vault Balance History", ku: "مێژووی باڵانسی گەنجینە" },
  bestCustomersReport: { en: "Best Customers", ku: "باشترین کڕیارەکان" },
  bestBeneficiariesReport: { en: "Best Beneficiaries", ku: "باشترین دابینکەرەکان" },
  noDataRange: { en: "No data found for the selected date range.", ku: "هیچ داتایەک بۆ ئەم ماوەیە نەدۆزرایەوە." },
  from: { en: "From", ku: "لە" },
  to: { en: "To", ku: "بۆ" },
  print: { en: "Print / PDF", ku: "چاپ / PDF" },
  exportPdf: { en: "Export PDF", ku: "هەناردەکردنی PDF" },
  generatedAt: { en: "Generated", ku: "دروستکراوە" },
  range: { en: "Range", ku: "ماوە" },
  revenue: { en: "Revenue", ku: "داهات" },
  cost: { en: "Cost", ku: "تێچوو" },
  grossProfit: { en: "Gross Profit", ku: "قازانجی گشتی" },
  netProfit: { en: "Net Profit", ku: "قازانجی پوخت" },
  purchaseCount: { en: "purchases", ku: "کڕین" },
  inKg: { en: "In (kg)", ku: "هاتوو (kg)" },
  outKg: { en: "Out (kg)", ku: "چوو (kg)" },
  lossKg: { en: "Loss (kg)", ku: "زیان (kg)" },
  remainingKg: { en: "Remaining (kg)", ku: "ماوە (kg)" },

  // Settings
  settingsTitle: { en: "Settings", ku: "ڕێکخستنەکان" },
  settingsSub: { en: "Exchange rate, thresholds, users, backups, and audit trail", ku: "نرخی ئاڵوگۆڕ، سنوورەکان، بەکارهێنەران، کۆپیی یەدەگ و تۆماری چالاکی" },
  rateHistory: { en: "Rate History", ku: "مێژووی نرخەکان" },
  aluminumTypes: { en: "Aluminum Types", ku: "جۆرەکانی ئەلومینیۆم" },
  thresholds: { en: "Thresholds & Alerts", ku: "سنوورەکان و هۆشدارییەکان" },
  notificationSettings: { en: "Notifications", ku: "ئاگادارکردنەوەکان" },
  emailReports: { en: "Scheduled Email Reports (Owner)", ku: "ڕاپۆرتی ئیمەیڵی خۆکار (خاوەن)" },
  language: { en: "Language", ku: "زمان" },
  languageHelp: { en: "Switch between English and Kurdish Sorani (کوردی). Layout switches to RTL automatically.", ku: "گۆڕین لە نێوان ئینگلیزی و کوردی سۆرانی. ڕووکار بە شێوەی خۆکار دەگۆڕێت بۆ ئاراستەی لە ڕاستەوە بۆ چەپ." },
  backupRestore: { en: "Backup & Restore (Owner)", ku: "کۆپیی یەدەگ و گەڕاندنەوە (خاوەن)" },
  userManagement: { en: "User Management (Owner)", ku: "بەڕێوەبردنی بەکارهێنەران (خاوەن)" },
  auditLog: { en: "Audit Log (Owner)", ku: "تۆماری چالاکی (خاوەن)" },
  createUser: { en: "Create User", ku: "دروستکردنی بەکارهێنەر" },
  role: { en: "Role", ku: "ڕۆڵ" },
  active: { en: "Active", ku: "چالاک" },
  inactive: { en: "Inactive", ku: "ناچالاک" },
  perPageAccess: { en: "Per-page access", ku: "دەستگەیشتن بە لاپەڕەکان" },
  lastLogin: { en: "Last Login", ku: "دواین چوونە ژوورەوە" },
  cannotDeactivateOwner: { en: "Owner account cannot be deactivated.", ku: "هەژماری خاوەن ناچالاک ناکرێت." },
  backupNow: { en: "Backup Now", ku: "دروستکردنی کۆپیی یەدەگ" },
  restore: { en: "Restore", ku: "گەڕاندنەوە" },
  restoreConfirm: { en: "Restoring will REPLACE ALL DATA with the backup. This action cannot be undone.", ku: "هەموو داتاکانی ئێستا بە داتای کۆپیی یەدەگ دەگۆڕدرێن. ئەم کردارە ناتوانرێت بگەڕێنرێتەوە." },
  fullBackup: { en: "Export Full Backup (JSON)", ku: "هەناردەکردنی کۆپیی یەدەگی تەواو (JSON)" },
  backupList: { en: "Backup History", ku: "مێژووی کۆپیی یەدەگەکان" },
  emailForReports: { en: "Email for reports", ku: "ئیمەیڵ بۆ ڕاپۆرتەکان" },
  dailyReport: { en: "Daily report", ku: "ڕاپۆرتی ڕۆژانە" },
  weeklyReport: { en: "Weekly report", ku: "ڕاپۆرتی هەفتانە" },
  exportAudit: { en: "Export Audit Log (CSV)", ku: "هەناردەکردنی تۆماری چالاکی (CSV)" },
  typeAdded: { en: "Type added.", ku: "جۆر زیادکرا." },
  typeRemoved: { en: "Type removed.", ku: "جۆر لابرا." },
  userUpdated: { en: "User updated.", ku: "بەکارهێنەر نوێکرایەوە." },
  userCreated: { en: "User created.", ku: "بەکارهێنەر دروستکرا." },
  backupCreated: { en: "Backup created.", ku: "کۆپیی یەدەگ دروستکرا." },
  backupFailed: { en: "Backup failed.", ku: "دروستکردنی کۆپیی یەدەگ سەرکەوتوو نەبوو." },
  restoreComplete: { en: "Restore complete.", ku: "گەڕاندنەوە تەواو بوو." },
  restoreFailed: { en: "Restore failed", ku: "گەڕاندنەوە سەرکەوتوو نەبوو" },
  thresholdSaved: { en: "Threshold saved.", ku: "سنوور پاشەکەوتکرا." },
  exchangeRateSaved: { en: "Exchange rate saved.", ku: "نرخی ئاڵوگۆڕ پاشەکەوتکرا." },
  defaultLowStockKg: { en: "Default low-stock threshold (kg)", ku: "سنووری بنەڕەتی کەمی کۆگا (kg)" },
  saveFailed: { en: "Save failed", ku: "پاشەکەوتکردن سەرکەوتوو نەبوو" },
  failed: { en: "Failed", ku: "سەرکەوتوو نەبوو" },

  // Errors & validation
  errGeneric: { en: "Transaction could not be completed. Please try again.", ku: "نەتوانرا مامەڵە تەواو بکرێت. تکایە دووبارە هەوڵبدە." },
  errSave: { en: "Transaction could not be saved. Please try again.", ku: "نەتوانرا مامەڵە پاشەکەوت بکرێت. تکایە دووبارە هەوڵبدە." },
  errUpdate: { en: "Transaction could not be updated. Please try again.", ku: "نەتوانرا مامەڵە نوێ بکرێتەوە. تکایە دووبارە هەوڵبدە." },
  errDelete: { en: "Transaction could not be deleted. Please try again.", ku: "نەتوانرا مامەڵە بسڕدرێتەوە. تکایە دووبارە هەوڵبدە." },
  errNetwork: { en: "Connection lost. Check your internet and try again.", ku: "پەیوەندی پچڕا. ئینتەرنێتەکەت بپشکنە و دووبارە هەوڵبدە." },
  requiredField: { en: "This field is required.", ku: "ئەم خانەیە پێویستە." },
  mustBePositive: { en: "Must be greater than 0", ku: "دەبێت لە ٠ گەورەتر بێت" },
  duplicateName: { en: "A record with this name already exists.", ku: "تۆمارێک بەم ناوە پێشتر هەیە." },
  insufficientStock: { en: "Insufficient stock.", ku: "کۆگا بەش ناکات." },
};

/** Coerce anything (localStorage value, event payload) into a valid Lang. */
function normalizeLang(value: unknown): Lang {
  return value === "ku" ? "ku" : "en";
}

/** Translate a key. Safe against missing keys (returns prettified key). */
export function t(key: string, lang: Lang = "en"): string {
  const entry = dict[key];
  if (!entry) {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }
  // `||` (not `??`) so an empty Kurdish string also falls back to English.
  return entry[lang] || entry.en;
}

export function isRtl(lang: Lang): boolean {
  return lang === "ku";
}

/**
 * Value for <html lang="…">. Internally the app uses "ku", but Sorani's proper
 * BCP-47 tag is "ckb" ("ku" is the generic Kurdish macro-language, which
 * browsers/screen readers may treat as Kurmanji).
 */
export function htmlLang(lang: Lang): string {
  return lang === "ku" ? "ckb" : "en";
}

/**
 * React hook: the current language + a bound translator.
 * Listens for AppShell's `alu-lang-change` event so all components
 * re-render when the user toggles the language.
 */
export function useLang(): { lang: Lang; t: (key: string) => string; isRtl: boolean } {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LANG_STORAGE_KEY);
    } catch {
      // Storage blocked (private mode / sandboxed iframe) — stay on English.
    }
    setLang(normalizeLang(saved));

    const onChange = (e: Event) => setLang(normalizeLang((e as CustomEvent<Lang>).detail));
    window.addEventListener(LANG_EVENT, onChange);
    return () => window.removeEventListener(LANG_EVENT, onChange);
  }, []);

  const tt = useCallback((key: string) => t(key, lang), [lang]);
  return { lang, t: tt, isRtl: lang === "ku" };
}
