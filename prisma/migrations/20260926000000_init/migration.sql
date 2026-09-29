-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'en',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1500,
    "defaultLowStockKg" DECIMAL(65,30) NOT NULL DEFAULT 50,
    "overdueDays" INTEGER NOT NULL DEFAULT 30,
    "customerDueThreshold" DECIMAL(65,30) NOT NULL DEFAULT 500,
    "beneficiaryDueThreshold" DECIMAL(65,30) NOT NULL DEFAULT 500,
    "vaultLowThresholdUsd" DECIMAL(65,30) NOT NULL DEFAULT 100,
    "alertCustomerDue" BOOLEAN NOT NULL DEFAULT true,
    "alertBeneficiaryDue" BOOLEAN NOT NULL DEFAULT true,
    "alertLowStock" BOOLEAN NOT NULL DEFAULT true,
    "alertVaultLow" BOOLEAN NOT NULL DEFAULT true,
    "alertOverdue" BOOLEAN NOT NULL DEFAULT true,
    "emailDaily" BOOLEAN NOT NULL DEFAULT false,
    "emailWeekly" BOOLEAN NOT NULL DEFAULT false,
    "emailReportsTo" TEXT,
    "autoBackup" BOOLEAN NOT NULL DEFAULT true,
    "lastAutoBackupAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRateLog" (
    "id" TEXT NOT NULL,
    "oldRate" DECIMAL(65,30) NOT NULL,
    "newRate" DECIMAL(65,30) NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AluminumType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AluminumType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vault" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "Vault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultTransaction" (
    "id" TEXT NOT NULL,
    "vaultCurrency" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountIn" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amountOut" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(65,30) NOT NULL,
    "exchangeRate" DECIMAL(65,30),
    "txDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saleId" TEXT,
    "purchaseId" TEXT,
    "vaultOpId" TEXT,
    "customerPaymentId" TEXT,
    "beneficiaryPaymentId" TEXT,

    CONSTRAINT "VaultTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultOperation" (
    "id" TEXT NOT NULL,
    "vaultCurrency" TEXT NOT NULL,
    "opType" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "label" TEXT NOT NULL,
    "notes" TEXT,
    "opDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "photo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPayment" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "vaultCurrency" TEXT NOT NULL,
    "exchangeRate" DECIMAL(65,30),
    "reference" TEXT NOT NULL,
    "notes" TEXT,
    "payDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beneficiary" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeneficiaryPayment" (
    "id" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "vaultCurrency" TEXT NOT NULL,
    "exchangeRate" DECIMAL(65,30),
    "reference" TEXT NOT NULL,
    "notes" TEXT,
    "payDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeneficiaryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aluminumType" TEXT NOT NULL,
    "totalPurchased" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalProcessed" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "available" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lowStockKg" DECIMAL(65,30),
    "beneficiaryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LossEvent" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "originalKg" DECIMAL(65,30) NOT NULL,
    "lossKg" DECIMAL(65,30) NOT NULL,
    "lossPct" DECIMAL(65,30) NOT NULL,
    "remainingKg" DECIMAL(65,30) NOT NULL,
    "notes" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LossEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "qtyKg" DECIMAL(65,30) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "aluminumType" TEXT NOT NULL,
    "weightKg" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "vaultCurrency" TEXT NOT NULL,
    "exchangeRate" DECIMAL(65,30),
    "totalPrice" DECIMAL(65,30) NOT NULL,
    "cashPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "dueAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "txDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "itemId" TEXT,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "vaultCurrency" TEXT NOT NULL,
    "exchangeRate" DECIMAL(65,30),
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "cashPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "dueAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cogs" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleLineItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "saleType" TEXT NOT NULL DEFAULT 'RAW',
    "weightKg" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "lineTotal" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "SaleLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "message" TEXT NOT NULL,
    "linkTo" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordRef" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserPermission_userId_idx" ON "UserPermission"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_page_key" ON "UserPermission"("userId", "page");

-- CreateIndex
CREATE INDEX "ExchangeRateLog_createdAt_idx" ON "ExchangeRateLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AluminumType_name_key" ON "AluminumType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Vault_currency_key" ON "Vault"("currency");

-- CreateIndex
CREATE INDEX "VaultTransaction_txDate_idx" ON "VaultTransaction"("txDate");

-- CreateIndex
CREATE INDEX "VaultTransaction_vaultCurrency_idx" ON "VaultTransaction"("vaultCurrency");

-- CreateIndex
CREATE INDEX "VaultTransaction_type_idx" ON "VaultTransaction"("type");

-- CreateIndex
CREATE INDEX "VaultOperation_opDate_idx" ON "VaultOperation"("opDate");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_fullName_key" ON "Customer"("fullName");

-- CreateIndex
CREATE INDEX "Customer_fullName_idx" ON "Customer"("fullName");

-- CreateIndex
CREATE INDEX "CustomerPayment_payDate_idx" ON "CustomerPayment"("payDate");

-- CreateIndex
CREATE INDEX "CustomerPayment_customerId_idx" ON "CustomerPayment"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiary_fullName_key" ON "Beneficiary"("fullName");

-- CreateIndex
CREATE INDEX "Beneficiary_fullName_idx" ON "Beneficiary"("fullName");

-- CreateIndex
CREATE INDEX "BeneficiaryPayment_payDate_idx" ON "BeneficiaryPayment"("payDate");

-- CreateIndex
CREATE INDEX "BeneficiaryPayment_beneficiaryId_idx" ON "BeneficiaryPayment"("beneficiaryId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_sku_key" ON "InventoryItem"("sku");

-- CreateIndex
CREATE INDEX "InventoryItem_name_idx" ON "InventoryItem"("name");

-- CreateIndex
CREATE INDEX "LossEvent_processedAt_idx" ON "LossEvent"("processedAt");

-- CreateIndex
CREATE INDEX "LossEvent_itemId_idx" ON "LossEvent"("itemId");

-- CreateIndex
CREATE INDEX "InventoryMovement_movedAt_idx" ON "InventoryMovement"("movedAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_itemId_idx" ON "InventoryMovement"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_number_key" ON "Purchase"("number");

-- CreateIndex
CREATE INDEX "Purchase_txDate_idx" ON "Purchase"("txDate");

-- CreateIndex
CREATE INDEX "Purchase_beneficiaryId_idx" ON "Purchase"("beneficiaryId");

-- CreateIndex
CREATE INDEX "Purchase_sku_idx" ON "Purchase"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_invoiceNo_key" ON "Sale"("invoiceNo");

-- CreateIndex
CREATE INDEX "Sale_saleDate_idx" ON "Sale"("saleDate");

-- CreateIndex
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");

-- CreateIndex
CREATE INDEX "Sale_invoiceNo_idx" ON "Sale"("invoiceNo");

-- CreateIndex
CREATE INDEX "SaleLineItem_saleId_idx" ON "SaleLineItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleLineItem_itemId_idx" ON "SaleLineItem"("itemId");

-- CreateIndex
CREATE INDEX "Alert_isRead_idx" ON "Alert"("isRead");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "Backup_createdAt_idx" ON "Backup"("createdAt");

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRateLog" ADD CONSTRAINT "ExchangeRateLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultTransaction" ADD CONSTRAINT "VaultTransaction_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultTransaction" ADD CONSTRAINT "VaultTransaction_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultTransaction" ADD CONSTRAINT "VaultTransaction_vaultOpId_fkey" FOREIGN KEY ("vaultOpId") REFERENCES "VaultOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultTransaction" ADD CONSTRAINT "VaultTransaction_customerPaymentId_fkey" FOREIGN KEY ("customerPaymentId") REFERENCES "CustomerPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultTransaction" ADD CONSTRAINT "VaultTransaction_beneficiaryPaymentId_fkey" FOREIGN KEY ("beneficiaryPaymentId") REFERENCES "BeneficiaryPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeneficiaryPayment" ADD CONSTRAINT "BeneficiaryPayment_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LossEvent" ADD CONSTRAINT "LossEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLineItem" ADD CONSTRAINT "SaleLineItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLineItem" ADD CONSTRAINT "SaleLineItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
