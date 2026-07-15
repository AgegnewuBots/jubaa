# AGE DEAL

AGE DEAL is a Telegram Mini App escrow and wallet platform for Polygon USDT.

This codebase is being upgraded toward production mode. It now requires real configuration and PostgreSQL; demo auth, JSON storage, hardcoded wallet seeds, and fake deposit credits are disabled.

## Requirements

- Node.js LTS
- PostgreSQL
- Telegram bot token from BotFather
- Polygon RPC endpoints
- Production BIP39 master seed stored outside source control

## Setup

1. Copy `.env.example` to `.env`.
2. Fill every required value. Do not reuse the example secrets.
3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npm run dev
```

The server applies PostgreSQL migrations on startup.

## Firebase Hosting

This repo includes Firebase Hosting configuration for the Firebase project
`youthful-dogfish-p7854`.

Build the frontend:

```bash
npm run build:hosting
```

Deploy hosting and Firestore rules:

```bash
firebase deploy
```

Firebase Hosting serves the Vite build from `dist` and rewrites all browser
routes to `index.html`, which prevents `Cannot GET /` and refresh errors.

Note: the current `/api/*` backend in `server.ts` still uses PostgreSQL through
`src/lib/db.ts`. Firestore config exists for the frontend, but the server API has
not been migrated to Firestore yet.

## Production Rules

- `DATABASE_URL`, `JWT_SECRET`, `BOT_TOKEN`, `MASTER_SEED`, `POLYGON_RPC_PRIMARY`, and `ADMIN_TELEGRAM_IDS` are mandatory.
- Telegram `initData` is verified server-side.
- Wallet private keys and the master seed are never exposed to the frontend.
- Deposit simulation is disabled. Real deposit crediting must come from the production Polygon listener.
- Withdrawals require the withdrawal password and are queued in PostgreSQL.

## Remaining Production Work

- Polygon deposit listener with confirmed transfer-event indexing.
- Withdrawal processor worker that broadcasts queued withdrawals.
- Full WebAuthn verification using a production verifier.
- Dedicated admin application separated from the user Mini App.
- Telegram deal-room bot automation.
- Complete escrow state machine for P2P, service, product, refunds, and appeals.
