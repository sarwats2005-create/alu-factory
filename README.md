# ALU FACTORY — Aluminum Operations Management ERP

Bilingual (English / Kurdish Sorani, RTL) ERP for an aluminum factory:
point-of-sale with instant invoice generation, an invoices manager with a
24-hour edit window and local PDF folder export, customer & beneficiary
dues tracking, inventory with processing-loss handling, a dual-currency
vault (USD / IQD) with automatic exchange-rate conversion, reports, and
role-based user permissions.

## Stack

- **Next.js 15** (App Router, Turbopack dev) + **React 19** + **TypeScript**
- **Tailwind CSS 4**
- **Prisma** + **PostgreSQL** (Neon serverless)
- **Auth:** JWT session cookies (jose) + bcrypt
- **PDF:** html2canvas + jsPDF (client-side invoice rendering)

## Getting started

```bash
npm install

# Configure the database (Neon or any PostgreSQL)
cp .env.example .env        # then fill in the values

npx prisma migrate deploy   # create schema
npm run db:seed             # owner user + baseline data

npm run dev                 # http://localhost:3400
```

## Environment variables

See [.env.example](.env.example). Required:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Postgres connection string (app queries) |
| `DATABASE_URL_UNPOOLED` | Direct connection for migrations (Neon) |
| `JWT_SECRET` | Random string used to sign session cookies |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with Turbopack on port 3400 |
| `npm run build` | Prisma generate + production build |
| `npm start` | Serve the production build on port 3400 |
| `npm run typecheck` | TypeScript, no emit |
| `npm run db:migrate` | Create/apply a migration |
| `npm run db:seed` | Seed the database |

## Deployment notes

- Any Node host works (Vercel, Railway, Fly.io, a VPS). Set the three
  environment variables above in the host's dashboard — never commit `.env`.
- Run `npx prisma migrate deploy` during (or before) each deploy.
- The app is a single Next.js server; no extra services besides Postgres.

## Security

`.env`, `.neon`, and local DB/backup files are git-ignored. If you ever
suspect a secret leaked, rotate it (Neon console / `JWT_SECRET`) — old
commits keep history, so rotation beats rewriting history.
