#!/usr/bin/env bash
# One-time Cloudflare + Hyperdrive setup for ALU FACTORY ERP.
# Run:  bash scripts/cf-setup.sh
#
# Prerequisites:
#   - wrangler authenticated:  npx wrangler login
#   - .env contains DATABASE_URL (Neon pooled connection string)

set -euo pipefail

echo "== 1/3 Creating Hyperdrive config for Neon =="
# Pull the pooled URL from .env (first postgres:// URI found).
DB_URL=$(grep -o 'postgresql://[^"]*' .env | head -1)
if [ -z "$DB_URL" ]; then echo "ERROR: no postgresql:// URL found in .env"; exit 1; fi

npx wrangler hyperdrive create alu-neon --connection-string="$DB_URL" | tee .hyperdrive-create.out

HD_ID=$(grep -o '"id": "[^"]*"' .hyperdrive-create.out | head -1 | cut -d'"' -f4)
rm -f .hyperdrive-create.out
if [ -z "$HD_ID" ]; then echo "ERROR: could not read Hyperdrive id from output"; exit 1; fi

echo "== 2/3 Writing id $HD_ID into wrangler.jsonc =="
sed -i "s/PASTE_HYPERDRIVE_ID_HERE/$HD_ID/" wrangler.jsonc

echo "== 3/3 Done =="
cat <<EOF

Hyperdrive ready:
  binding : HYPERDRIVE
  id      : $HD_ID

Next steps:
  npm i -D @opennext/cloudflare
  npm run build:worker      # OpenNext build for Workers
  npx wrangler deploy       # ship it

Secrets for the deployed Worker (once, not in wrangler.jsonc):
  npx wrangler secret put DATABASE_URL      # Neon pooled URL
  npx wrangler secret put JWT_SECRET
EOF
