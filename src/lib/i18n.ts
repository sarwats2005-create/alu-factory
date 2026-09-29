// ALU FACTORY — i18n: English + Kurdish Sorani (کوردی سۆرانی) with RTL
//
// Usage in any client component:
//   import { useLang, t } from "@/lib/i18n";
//   const { lang, t, isRtl } = useLang();   // t is already bound to the current language
//   <h1>{t("dashTitle")}</h1>
//
// The current language is shared through the `alu-lang-change` DOM event that
// AppShell dispatches whenever the user toggles the language, so every
// component re-renders with the right strings — no prop drilling.

import { useEffect, useState, useCallback } from "react";

export type Lang = "en" | "ku";

type Entry = { en: string; ku: string };

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
  confirmDelete: { en: "Are you sure? This action cannot be undone.", ku: "دڵنیایت؟ ئەم کردارە ناگەڕێتەوە٫" },
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
  reference: { en: "Reference", ku: "ژمارەی سەرەدا" },
  description: { en: "Description", ku: "وەسف" },
  party: { en: "Party", ku: "لایەن" },
  product: { en: "Product", ku: "بەرهەم" },
  products: { en: "Products", ku: "بەرهەمەکان" },
  loading: { en: "Loading…", ku: "چاوەڕوان بە…" },
  noData: { en: "No data found.", ku: "هیچ داتایەک نەدۆزرایەوە٫" },
  yes: { en: "Yes", ku: "بەڵێ" },
  no: { en: "No", ku: "نەخێر" },
  perPage: { en: "Per page", ku: "لە هەر لاپەڕەیەک" },
  confirm: { en: "Confirm", ku: "دڵنیاکردنەوە" },
  close: { en: "Close", ku: "داخستن" },
  update: { en: "Update", ku: "نوێکردنەوە" },
  create: { en: "Create", ku: "دروستکردن" },
  more: { en: "More", ku: "زیاتر" },
  markAllRead: { en: "Mark all read", ku: "هەمووی بخوێنەرەوە" },

  // Nav
  navDashboard: { en: "Dashboard", ku: "داشبۆرد" },
  navCustomers: { en: "Customers", ku: "کڕیارەکان" },
  navBeneficiaries: { en: "Beneficiaries", ku: "بەنێفیسیارەکان" },
  navInventory: { en: "Inventory", ku: "کۆگا" },
  navPos: { en: "Point of Sale", ku: "خاڵی فرۆشتن" },
  navPosShort: { en: "Sales", ku: "فرۆشتن" },
  navInvoices: { en: "Invoices", ku: "پسوڵەکان" },
  navVault: { en: "Vault", ku: "گەنجینە" },
  navReports: { en: "Reports", ku: "ڕاپۆرتەکان" },
  navSettings: { en: "Settings", ku: "ڕێکخستنەکان" },

  // Auth
  welcomeBack: { en: "Welcome back", ku: "بەخێربێیتەوە" },
  loginSub: { en: "Sign in to manage factory operations", ku: "بۆ بەڕێوەبردنی کارەکانی فاکتۆری چوونە ژوورەوە" },
  invalidCredentials: { en: "Invalid email or password.", ku: "ئیمەیڵ یان وشەی نهێنی هەڵەیە٫" },
  sessionExpired: { en: "Session expired. Please log in again.", ku: "نشست کۆتایی هات٫ تکایە دووبارە بچۆ ژوورەوە٫" },
  deactivatedMsg: { en: "Your account has been deactivated.", ku: "هەژمارەکەت ناچالاک کراوە٫" },

  // Dashboard
  dashTitle: { en: "Dashboard", ku: "داشبۆرد" },
  dashSub: { en: "Business health at a glance", ku: "دۆخی بازرگانی بە یەک چاو" },
  newSale: { en: "New Sale", ku: "فرۆشتنی نوێ" },
  pnlAllTime: { en: "Profit / Loss, all time", ku: "قازانج / زیان، هەموو کاتێک" },
  salesExceedCost: { en: "Sales exceed cost of goods", ku: "فرۆشتن لە تێچووی کاڵا زیاترە" },
  costExceedSales: { en: "Cost of goods exceed sales", ku: "تێچووی کاڵا لە فرۆشتن زیاترە" },
  vaultCombined: { en: "Vault, combined", ku: "گەنجینە، کۆگەرەکە" },
  salesThisMonth: { en: "Sales this month", ku: "فرۆشتی ئەم مانگە" },
  allTime: { en: "All time", ku: "هەموو کاتێک" },
  bestCustomer: { en: "Best customer", ku: "باشترین کڕیار" },
  bestBeneficiary: { en: "Best beneficiary", ku: "باشترین بەنێفیسیار" },
  inPurchases: { en: "in purchases", ku: "لە کڕینەکان" },
  supplied: { en: "supplied", ku: "پێداویستی" },
  noSalesYet: { en: "No sales yet", ku: "هێشتا فرۆشتنێک نییە" },
  noPurchasesYet: { en: "No purchases yet", ku: "هێشتا کڕینێک نییە" },
  revenueAllTime: { en: "Revenue, all time", ku: "داهات، هەموو کاتێک" },
  purchasesAllTime: { en: "Purchases, all time", ku: "کڕینەکان، هەموو کاتێک" },
  customerDues: { en: "Customer dues", ku: "قەرزی کڕیارەکان" },
  owedByCustomers: { en: "Owed by customers", ku: "لە کڕیارەکانەوە قەرزارن" },
  nothingOutstanding: { en: "Nothing outstanding", ku: "هیچ قەرزێک نییە" },
  monthlyPnl: { en: "Monthly P&L", ku: "قازانج/زیانی مانگانە" },
  salesByMonth: { en: "Sales by Month", ku: "فرۆشتن بەپێی مانگ" },
  last12Months: { en: "Last 12 months", ku: "دوایین ١٢ مانگ" },
  revenueTrend: { en: "Revenue trend", ku: "ڕەوتی داهات" },
  top5Customers: { en: "Top 5 Customers", ku: "باشترین ٥ کڕیار" },
  top5Beneficiaries: { en: "Top 5 Beneficiaries", ku: "باشترین ٥ بەنێفیسیار" },
  recentTransactions: { en: "Recent Transactions", ku: "مامەڵەکانی دوایی" },
  viewAll: { en: "View all", ku: "هەمووی ببینە" },
  nothingRecordedYet: { en: "Nothing recorded yet. Your purchases and sales appear here as you make them.", ku: "هێشتا هیچ تۆمار نەکراوە٫ کڕین و فرۆشتنەکانت لێرە دەردەکەون کاتێک ئەنجامیان دەدەیت٫" },
  nothingChartedYet: { en: "Nothing charted yet", ku: "هێشتا هیچ نەخشێنراوە" },
  chartFillHint: { en: "Record a purchase or a sale and this fills in.", ku: "کڕینێک یان فرۆشتنێک تۆمار بکە و ئەمە پڕ دەبێت٫" },
  noDataYet: { en: "No data yet.", ku: "هێشتا داتا نییە٫" },
  alerts: { en: "Alerts", ku: "ئاگادارکردنەوەکان" },
  noAlerts: { en: "No alerts — all clear.", ku: "هیچ ئاگادارکردنەوەیەک نییە — هەموو شتێک باشە٫" },
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
  customerOwesFactory: { en: "Customer owes factory", ku: "کڕیار قەرزارە بە فاکتۆری" },
  settled: { en: "Settled", ku: "تەواوکراو" },
  balanceState: { en: "Balance State", ku: "دۆخی باڵانس" },
  dueAmount: { en: "Due Amount", ku: "بڕی قەرز" },
  phone: { en: "Phone", ku: "تەلەفۆن" },
  address: { en: "Address", ku: "ناونیشان" },
  fullName: { en: "Full Name", ku: "ناوی تەواو" },
  profilePicture: { en: "Profile Picture", ku: "وێنەی کەسایەتی" },
  allBalances: { en: "All balances", ku: "هەموو باڵانسەکان" },
  cashReceived: { en: "Cash Received", ku: "پارەی وەرگیراو" },
  dueBalance: { en: "Due Balance", ku: "باڵانسی قەرز" },
  netPosition: { en: "Net Position", ku: "دۆخی خاڵیس" },
  perCustProfit: { en: "Per-Customer Profit", ku: "قازانجی هەر کڕیارێک" },
  txHistory: { en: "Transaction History", ku: "مێژووی مامەڵەکان" },
  exportCsv: { en: "Export CSV", ku: "هەناردەکردنی CSV" },
  printStatement: { en: "Print Statement", ku: "چاپکردنی ڕاپۆرت" },
  receivePayment: { en: "Receive Payment", ku: "وەرگرتنی پارە" },
  payBeneficiary: { en: "Pay Beneficiary", ku: "پارەدان بە بەنێفیسیار" },
  recordPayment: { en: "Record Payment", ku: "تۆمارکردنی پارەدان" },
  creditBalance: { en: "Credit balance", ku: "باڵانسی قەرزی بۆ ئێمە" },
  overpaid: { en: "Overpaid", ku: "زیادە پارەدراو" },
  invoiceNo: { en: "Invoice #", ku: "ژمارەی پسوڵە" },
  vaultUsed: { en: "Vault", ku: "گەنجینە" },
  currentDue: { en: "Current due balance", ku: "باڵانسی قەرزی ئێستا" },
  customerOwesFactoryMsg: { en: "Customer owes factory", ku: "کڕیار قەرزارە بە فاکتۆری" },
  factoryOwesBeneficiaryMsg: { en: "Factory owes beneficiary", ku: "فاکتۆری قەرزارە بە بەنێفیسیار" },
  noSalesForCustomer: { en: "No sales recorded for this customer yet.", ku: "هێشتا هیچ فرۆشتنێک بۆ ئەم کڕیارە تۆمار نەکراوە٫" },
  emptyCustomers: { en: "No customers yet", ku: "هێشتا کڕیارێک نییە" },
  emptyCustomersMsg: { en: "Add your first customer to start recording sales and tracking dues.", ku: "یەکەم کڕیارت زیاد بکە بۆ تۆمارکردنی فرۆشتن و بەدواداچوونی قەرز٫" },
  customerUpdated: { en: "Customer updated.", ku: "کڕیار نوێکرایەوە٫" },
  customerAdded: { en: "Customer added.", ku: "کڕیار زیادکرا٫" },
  customerDeleted: { en: "Customer deleted.", ku: "کڕیار سڕایەوە٫" },
  deleteCustomerConfirm: { en: "Delete", ku: "سڕینەوە" },
  deleteConfirmPrefix: { en: "Delete", ku: "سڕینەوەی" },
  imageTooBig: { en: "Image must be under 1 MB.", ku: "وێنە دەبێت لە ١ MB کەمتر بێت٫" },

  // Beneficiaries
  beneficiariesTitle: { en: "Beneficiaries", ku: "بەنێفیسیارەکان" },
  beneficiariesSub: { en: "Raw-material suppliers and what the factory owes them", ku: "دابینکەرانی ماددەی خاو و ئەوەی فاکتۆری قەرزارە پێیان" },
  addBeneficiary: { en: "Add Beneficiary", ku: "زیادکردنی بەنێفیسیار" },
  editBeneficiary: { en: "Edit Beneficiary", ku: "دەستکاری بەنێفیسیار" },
  deleteBeneficiary: { en: "Delete Beneficiary", ku: "سڕینەوەی بەنێفیسیار" },
  factoryOwesBeneficiary: { en: "Factory owes beneficiary", ku: "فاکتۆری قەرزارە بە بەنێفیسیار" },
  beneficiaryOwesFactory: { en: "Beneficiary owes factory", ku: "بەنێفیسیار قەرزارە بە فاکتۆری" },
  totalPurchases: { en: "Total Purchases", ku: "کۆی کڕینەکان" },
  purchasesCount: { en: "purchase(s)", ku: "کڕین" },
  totalPaid: { en: "Total Paid", ku: "کۆی پارەدراو" },
  totalWeight: { en: "Total Weight", ku: "کۆی کێش" },
  purchaseHistory: { en: "Purchase History", ku: "مێژووی کڕین" },
  noPurchasesRecorded: { en: "No purchases recorded yet.", ku: "هێشتا هیچ کڕینێک تۆمار نەکراوە٫" },
  beneficiaryUpdated: { en: "Beneficiary updated.", ku: "بەنێفیسیار نوێکرایەوە٫" },
  beneficiaryAdded: { en: "Beneficiary added.", ku: "بەنێفیسیار زیادکرا٫" },
  beneficiaryDeleted: { en: "Beneficiary deleted.", ku: "بەنێفیسیار سڕایەوە٫" },
  emptyBeneficiaries: { en: "No beneficiaries yet", ku: "هێشتا بەنێفیسیارێک نییە" },
  emptyBeneficiariesMsg: { en: "Add a beneficiary to record your first raw material purchase.", ku: "بەنێفیسیارێک زیاد بکە بۆ تۆمارکردنی یەکەم کڕینی ماددەی خاو٫" },
  paymentRecorded: { en: "Payment recorded.", ku: "پارەدان تۆمارکرا٫" },
  paymentFailed: { en: "Payment failed", ku: "پارەدان سەرکەوتوو نەبوو" },
  beneficiaryNotFound: { en: "Beneficiary not found.", ku: "بەنێفیسیار نەدۆزرایەوە٫" },
  customerNotFound: { en: "Customer not found.", ku: "کڕیار نەدۆزرایەوە٫" },

  // Inventory
  inventoryTitle: { en: "Inventory", ku: "کۆگا" },
  processLoss: { en: "Process Loss", ku: "زیانی پرۆسێس" },
  restock: { en: "Restock", ku: "دووبارە کڕینەوە" },
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
  totalPurchased: { en: "Total Purchased (kg)", ku: "کۆی کڕاوە (kg)" },
  totalProcessed: { en: "Loss Applied (kg)", ku: "زیانی جێبەجێکراو (kg)" },
  availableKg: { en: "Available (kg)", ku: "ماوە (kg)" },
  itemHistory: { en: "Item History", ku: "مێژووی کاڵا" },
  emptyInventory: { en: "No inventory yet. Purchase raw material from a beneficiary to add stock.", ku: "هێشتا کۆگا نییە٫ ماددەی خاو لە بەنێفیسیارێک بکڕە بۆ زیادکردنی کۆگا٫" },

  // POS
  posTitle: { en: "Point of Sale", ku: "خاڵی فرۆشتن" },
  customer: { en: "Customer", ku: "کڕیار" },
  addNewCustomer: { en: "+ Add New Customer", ku: "+ زیادکردنی کڕیاری نوێ" },
  available: { en: "Available", ku: "بەردەست" },
  useMax: { en: "USE MAX", ku: "زۆرترین" },
  addLineItem: { en: "Add Line Item", ku: "زیادکردنی بەش" },
  invoiceTotal: { en: "Invoice Total", ku: "کۆی پسوڵە" },
  cashPaid: { en: "Cash Paid", ku: "پارەی نەقد" },
  posDueAmount: { en: "Due — Customer owes factory", ku: "قەرز — کڕیار قەرزارە بە فاکتۆری" },
  confirmSale: { en: "Confirm Sale & Generate Invoice", ku: "دڵنیاکردنەوەی فرۆشتن و دروستکردنی پسوڵە" },
  saleSuccess: { en: "Sale recorded — invoice generated.", ku: "فرۆشتن تۆمارکرا — پسوڵە دروستکرا٫" },
  lineTotal: { en: "Line Total", ku: "کۆی بەش" },
  saleTypeRaw: { en: "Raw by Weight", ku: "خاو بەپێی کێش" },
  saleTypeFinished: { en: "Finished Product", ku: "بەرهەمی ئامادەکراو" },
  emptyPos: { en: "No sales yet. Select a customer and add products to create your first invoice.", ku: "هێشتا فرۆشتنێک نییە٫ کڕیارێک هەڵبژێرە و بەرهەم زیاد بکە بۆ دروستکردنی یەکەم پسوڵە٫" },
  editingTx: { en: "EDITING TRANSACTION", ku: "دەستکاری مامەڵە" },
  deleteSaleConfirm: { en: "Delete sale", ku: "سڕینەوەی فرۆشتن" },
  deleteSaleWarning: { en: "Inventory and vault effects will be reversed. This action cannot be undone.", ku: "کاریگەری کۆگا و گەنجینە دەگەڕێنەوە٫ ئەم کردارە ناگەڕێتەوە٫" },
  saleDeleted: { en: "Sale deleted — inventory and vault restored.", ku: "فرۆشتن سڕایەوە — کۆگا و گەنجینە گەڕێنرانەوە٫" },

  // Vault
  vaultTitle: { en: "Vault", ku: "گەنجینە" },
  usdVault: { en: "USD Vault", ku: "گەنجینەی دۆلار" },
  iqdVault: { en: "IQD Vault", ku: "گەنجینەی دینار" },
  totalIn: { en: "Total In", ku: "کۆی هاتنەژوورەوە" },
  totalOut: { en: "Total Out", ku: "کۆی چوونەدەرەوە" },
  balanceHistory: { en: "Balance History (30 days)", ku: "مێژووی باڵانس (٣٠ ڕۆژ)" },
  deposit: { en: "Deposit", ku: "پارەدان" },
  withdrawal: { en: "Withdrawal", ku: "هەڵگرتن" },
  exchangeRate: { en: "Exchange Rate", ku: "نرخی ئاڵوگۆڕ" },
  editRate: { en: "Edit Rate", ku: "گۆڕینی نرخ" },
  rateSaved: { en: "Exchange rate saved.", ku: "نرخی ئاڵوگۆڕ پاشەکەوتکرا٫" },
  vaultHistory: { en: "Vault Transaction History", ku: "مێژووی مامەڵەکانی گەنجینە" },
  deficit: { en: "Deficit", ku: "کەمیی باڵانس" },
  balanceAfter: { en: "Balance After", ku: "باڵانسی دواتر" },
  emptyVault: { en: "No transactions recorded yet.", ku: "هێشتا مامەڵەیەک تۆمار نەکراوە٫" },
  operationFailed: { en: "Operation failed", ku: "کردارەکە سەرکەوتوو نەبوو" },
  depositRecorded: { en: "Deposit recorded.", ku: "پارەدان تۆمارکرا٫" },
  withdrawalRecorded: { en: "Withdrawal recorded.", ku: "هەڵگرتن تۆمارکرا٫" },
  saveRate: { en: "Save Rate", ku: "پاشەکەوتکردنی نرخ" },

  // Reports
  reportsTitle: { en: "Reports", ku: "ڕاپۆرتەکان" },
  reportsSub: { en: "Business performance across every module", ku: "ئەدای بازرگانی لە هەموو بەشەکان" },
  pnlReport: { en: "Overall P&L Report", ku: "ڕاپۆرتی گشتی قازانج/زیان" },
  salesReport: { en: "Sales Report", ku: "ڕاپۆرتی فرۆشتن" },
  purchaseReport: { en: "Purchase Report", ku: "ڕاپۆرتی کڕین" },
  custAging: { en: "Customer Due Aging", ku: "تەمەنی قەرزی کڕیاران" },
  benAging: { en: "Beneficiary Due Aging", ku: "تەمەنی قەرزی بەنێفیسیار" },
  invMovement: { en: "Inventory Movement", ku: "جوڵەی کۆگا" },
  vaultHistoryReport: { en: "Vault Balance History", ku: "مێژووی باڵانسی گەنجینە" },
  bestCustomersReport: { en: "Best Customers", ku: "باشترین کڕیارەکان" },
  bestBeneficiariesReport: { en: "Best Beneficiaries", ku: "باشترین بەنێفیسیارەکان" },
  noDataRange: { en: "No data found for the selected date range.", ku: "هیچ داتایەک بۆ ئەم ماوەیە نەدۆزراوە٫" },
  from: { en: "From", ku: "لە" },
  to: { en: "To", ku: "بۆ" },
  print: { en: "Print / PDF", ku: "چاپ / PDF" },
  exportPdf: { en: "Export PDF", ku: "هەناردەکردنی PDF" },
  generatedAt: { en: "Generated", ku: "دروستکراوە" },
  range: { en: "Range", ku: "ماوە" },
  revenue: { en: "Revenue", ku: "داهات" },
  cost: { en: "Cost", ku: "تێچوو" },
  grossProfit: { en: "Gross Profit", ku: "قازانجی سەرەتایی" },
  netProfit: { en: "Net Profit", ku: "قازانجی خاڵیس" },
  purchaseCount: { en: "purchases", ku: "کڕین" },
  inKg: { en: "In (kg)", ku: "هاتوو (kg)" },
  outKg: { en: "Out (kg)", ku: "چوو (kg)" },
  lossKg: { en: "Loss (kg)", ku: "زیان (kg)" },
  remainingKg: { en: "Remaining (kg)", ku: "ماوە (kg)" },

  // Settings
  settingsTitle: { en: "Settings", ku: "ڕێکخستنەکان" },
  settingsSub: { en: "Exchange rate, thresholds, users, backups, and audit trail", ku: "نرخی ئاڵوگۆڕ، سنوورەکان، بەکارهێنەران، پاشەکەوتەکان و تۆماری چالاکی" },
  rateHistory: { en: "Rate History", ku: "مێژووی نرخەکان" },
  aluminumTypes: { en: "Aluminum Types", ku: "جۆرەکانی ئەلومینیۆم" },
  thresholds: { en: "Thresholds & Alerts", ku: "سنوورەکان و ئاگادارکردنەوەکان" },
  notificationSettings: { en: "Notifications", ku: "ئاگادارکردنەوەکان" },
  emailReports: { en: "Scheduled Email Reports (Owner)", ku: "ڕاپۆرتی ئیمەیڵی خۆکار (خاوەن)" },
  language: { en: "Language", ku: "زمان" },
  languageHelp: { en: "Switch between English and Kurdish Sorani (کوردی). Layout switches to RTL automatically.", ku: "گۆڕین لە نێوان ئینگلیزی و کوردی سۆرانی٫ ڕووکار بە خۆکاری دەگۆڕێت بۆ ڕاست بۆ چەپ٫" },
  backupRestore: { en: "Backup & Restore (Owner)", ku: "پاشەکەوتکردن و گەڕانەوە (خاوەن)" },
  userManagement: { en: "User Management (Owner)", ku: "بەڕێوەبردنی بەکارهێنەران (خاوەن)" },
  auditLog: { en: "Audit Log (Owner)", ku: "تۆماری چالاکی (خاوەن)" },
  createUser: { en: "Create User", ku: "دروستکردنی بەکارهێنەر" },
  role: { en: "Role", ku: "ڕۆڵ" },
  active: { en: "Active", ku: "چالاک" },
  inactive: { en: "Inactive", ku: "ناچالاک" },
  perPageAccess: { en: "Per-page access", ku: "دەستگەیشتن بە لاپەڕەکان" },
  lastLogin: { en: "Last Login", ku: "دواترین چوونەژوورەوە" },
  cannotDeactivateOwner: { en: "Owner account cannot be deactivated.", ku: "هەژماری خاوەن ناچالاک ناکرێت٫" },
  backupNow: { en: "Backup Now", ku: "پاشەکەوتکردنی ئێستا" },
  restore: { en: "Restore", ku: "گەڕانەوە" },
  restoreConfirm: { en: "Restoring will REPLACE ALL DATA with the backup. This action cannot be undone.", ku: "گەڕانەوە هەموو داتاکە دەگۆڕێت بە پاشەکەوت٫ ئەم کردارە ناگەڕێتەوە٫" },
  fullBackup: { en: "Export Full Backup (JSON)", ku: "هەناردەی تەواوی پاشەکەوت (JSON)" },
  backupList: { en: "Backup History", ku: "مێژووی پاشەکەوتکردن" },
  emailForReports: { en: "Email for reports", ku: "ئیمەیڵ بۆ ڕاپۆرتەکان" },
  dailyReport: { en: "Daily report", ku: "ڕاپۆرتی ڕۆژانە" },
  weeklyReport: { en: "Weekly report", ku: "ڕاپۆرتی هەفتانە" },
  exportAudit: { en: "Export Audit Log (CSV)", ku: "هەناردەکردنی تۆماری چالاکی (CSV)" },
  typeAdded: { en: "Type added.", ku: "جۆر زیادکرا٫" },
  typeRemoved: { en: "Type removed.", ku: "جۆر لابرا٫" },
  userUpdated: { en: "User updated.", ku: "بەکارهێنەر نوێکرایەوە٫" },
  userCreated: { en: "User created.", ku: "بەکارهێنەر دروستکرا٫" },
  backupCreated: { en: "Backup created.", ku: "پاشەکەوتکرا٫" },
  backupFailed: { en: "Backup failed.", ku: "پاشەکەوتکردن سەرکەوتوو نەبوو٫" },
  restoreComplete: { en: "Restore complete.", ku: "گەڕانەوە تەواو بوو٫" },
  restoreFailed: { en: "Restore failed", ku: "گەڕانەوە سەرکەوتوو نەبوو" },
  thresholdSaved: { en: "Threshold saved.", ku: "سنوور پاشەکەوتکرا٫" },
  exchangeRateSaved: { en: "Exchange rate saved.", ku: "نرخی ئاڵوگۆڕ پاشەکەوتکرا٫" },
  defaultLowStockKg: { en: "Default low-stock threshold (kg)", ku: "سنووری بنەڕەتی کەمی کۆگا (kg)" },
  saveFailed: { en: "Save failed", ku: "پاشەکەوتکردن سەرکەوتوو نەبوو" },
  failed: { en: "Failed", ku: "سەرکەوتوو نەبوو" },

  // Errors & validation
  errGeneric: { en: "Transaction could not be completed. Please try again.", ku: "نەتوانرا مامەڵە تەواو بکرێت٫ تکایە دووبارە هەوڵبدە٫" },
  errSave: { en: "Transaction could not be saved. Please try again.", ku: "نەتوانرا مامەڵە پاشەکەوت بکرێت٫ تکایە دووبارە هەوڵبدە٫" },
  errUpdate: { en: "Transaction could not be updated. Please try again.", ku: "نەتوانرا مامەڵە نوێ بکرێتەوە٫ تکایە دووبارە هەوڵبدە٫" },
  errDelete: { en: "Transaction could not be deleted. Please try again.", ku: "نەتوانرا مامەڵە سڕدرێتەوە٫ تکایە دووبارە هەوڵبدە٫" },
  errNetwork: { en: "Connection lost. Check your internet and try again.", ku: "پەیوەندی پچڕا٫ ئینتەرنێتەکەت بپشکنە و دووبارە هەوڵبدە٫" },
  requiredField: { en: "This field is required.", ku: "ئەم خانەیە پێویستە٫" },
  mustBePositive: { en: "Must be greater than 0", ku: "دەبێت لە ٠ گەورەتر بێت" },
  duplicateName: { en: "A record with this name already exists.", ku: "تۆمارێک بەم ناوە پێشتر هەیە٫" },
  insufficientStock: { en: "Insufficient stock.", ku: "کۆگا بەش ناکات٫" },
};

/** Translate a key. Safe against missing keys (returns prettified key). */
export function t(key: string, lang: Lang = "en"): string {
  const entry = dict[key];
  if (!entry) {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }
  return entry[lang] ?? entry.en;
}

export function isRtl(lang: Lang): boolean {
  return lang === "ku";
}

/**
 * React hook: the current language + a bound translator.
 * Listens for AppShell's `alu-lang-change` event so all components
 * re-render when the user toggles the language.
 */
export function useLang(): { lang: Lang; t: (key: string) => string; isRtl: boolean } {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const saved = (localStorage.getItem("alu_lang") as Lang | null) ?? "en";
    setLang(saved);
    const onChange = (e: Event) => setLang((e as CustomEvent<Lang>).detail);
    window.addEventListener("alu-lang-change", onChange);
    return () => window.removeEventListener("alu-lang-change", onChange);
  }, []);

  const tt = useCallback((key: string) => t(key, lang), [lang]);
  return { lang, t: tt, isRtl: lang === "ku" };
}
