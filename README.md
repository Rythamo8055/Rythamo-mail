# Rythamo Mail

A disposable temporary email service. Generate random email addresses, receive emails, and auto-delete after 10 minutes. No signup required.

**Live App:** [rythamo-mail.vercel.app](https://rythamo-mail.vercel.app)

## How It Works

```
User generates random address → anything@rythamo.qzz.io
  ↓
Sender sends email to that address
  ↓
Cloudflare Email Routing catches it (wildcard *.rythamo.qzz.io)
  ↓
Cloudflare Worker receives the email
  ↓
Worker forwards to Next.js API (/api/inbound)
  ↓
Email stored in Turso (SQLite edge DB)
  ↓
User views inbox in UI (auto-refreshes every 5s)
  ↓
Email auto-expires after 10 minutes
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Next.js API Routes (App Router) |
| Database | Turso (SQLite edge database, libSQL) |
| Email Routing | Cloudflare Email Routing |
| Email Worker | Cloudflare Workers |
| Hosting | Vercel (Next.js), Cloudflare (Worker + DNS) |
| Domain | rythamo.qzz.io |

## Project Structure

```
temp-mail/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── inbound/route.ts    # Receives emails from Worker
│   │   │   ├── inbox/[address]/    # Fetches emails for an address
│   │   │   ├── cleanup/route.ts    # Deletes expired emails
│   │   │   └── setup/route.ts      # Initializes database
│   │   ├── layout.tsx
│   │   ├── page.tsx                # Main UI
│   │   └── globals.css
│   ├── lib/
│   │   └── db.ts                   # Turso database client
│   └── middleware.ts               # CORS + security headers
├── worker/
│   ├── index.js                    # Cloudflare Worker (email handler)
│   └── wrangler.toml               # Worker configuration
├── .env.example
├── .gitignore
└── package.json
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/inbound` | Receives email from Cloudflare Worker |
| `GET` | `/api/inbox/[address]` | Returns all emails for an address |
| `POST` | `/api/cleanup` | Manually trigger expired email cleanup |
| `POST` | `/api/setup` | Initialize database schema |

### POST /api/inbound

```json
{
  "from": "sender@example.com",
  "to": "random@rythamo.qzz.io",
  "subject": "Subject line",
  "text": "Plain text body",
  "html": "<p>HTML body</p>"
}
```

### GET /api/inbox/[address]

Response:
```json
{
  "emails": [
    {
      "id": "abc123",
      "from": "sender@example.com",
      "subject": "Subject line",
      "body": "Plain text",
      "html": "<p>HTML</p>",
      "createdAt": "2026-06-22 02:00:00",
      "expiresAt": "2026-06-22T02:10:00.000Z"
    }
  ]
}
```

## Security

- **CORS**: API restricted to allowed origins only
- **Webhook Secret**: Inbound endpoint validates `x-webhook-secret` header
- **Input Validation**: Email addresses validated before storage
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- **No Secrets in Code**: All credentials stored in environment variables

## Setup

### Prerequisites

- Node.js 18+
- Cloudflare account (free)
- Turso account (free)
- Vercel account (free)

### 1. Clone and Install

```bash
git clone https://github.com/Rythamo8055/Rythamo-mail.git
cd Rythamo-mail
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your Turso credentials:
```
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token
WEBHOOK_SECRET=your-secret-key
```

### 3. Deploy to Vercel

```bash
vercel --prod
```

Set environment variables in Vercel dashboard or CLI:
```bash
vercel env add TURSO_DATABASE_URL production
vercel env add TURSO_AUTH_TOKEN production
vercel env add WEBHOOK_SECRET production
```

### 4. Deploy Cloudflare Worker

```bash
cd worker
# Update wrangler.toml with your APP_URL
wrangler deploy
```

### 5. Configure Cloudflare Email Routing

1. Go to Cloudflare Dashboard → Your domain → Email Routing
2. Create routing rule:
   - Matcher: `*@yourdomain.com`
   - Action: Send to Worker
   - Worker: `rythamo-mail-worker`

## Database Schema

```sql
CREATE TABLE emails (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  from_addr TEXT,
  subject TEXT DEFAULT '(no subject)',
  body TEXT DEFAULT '',
  html TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_address ON emails(address);
CREATE INDEX idx_expires ON emails(expires_at);
```

## Unlimited Domains

Yes, you can generate unlimited email addresses because:

1. **Wildcard DNS**: `*.rythamo.qzz.io` points to your server
2. **Cloudflare Catch-All**: Routes ALL emails for the domain
3. **Random Generation**: Addresses are random strings (e.g., `x7k2m@rythamo.qzz.io`)
4. **No Pre-Registration**: Any address works without creating it first

To add more domains, just:
1. Add domain to Cloudflare
2. Enable Email Routing
3. Create catch-all rule → Worker

## License

MIT
