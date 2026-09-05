# FreelanceTax

Tax and expense management for US freelancers, gig workers, and solo creators.
Track income and expenses, upload receipts, surface potential deductions,
estimate quarterly taxes, and export reports.

React 18 + TypeScript + Vite + Tailwind, with Supabase (Postgres + RLS + Auth +
Storage + Edge Functions) as the production backend.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

With no environment variables the app boots in **demo mode**: a fully
functional local backend that persists to `localStorage`. Every screen and flow
works; only things that genuinely require a server (payments, bank links,
server-side OCR) are unavailable, and the UI says so plainly.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run typecheck` | `tsc -b --force`, no emit |
| `npm run build` | Typecheck + production bundle into `dist/` |
| `npm run preview` | Serve the built bundle locally |

There is no test or lint script configured in `package.json`.

---

## Architecture

```
src/
  backend/          Data layer behind ONE interface (FinanceBackend)
    types.ts          the interface both implementations satisfy
    local-backend.ts  demo mode — localStorage, per-user
    supabase-backend.ts  production — Postgres + RLS + Storage
    index.ts          picks the implementation from env presence
    errors.ts         maps DB/auth errors to human copy
  context/          AuthContext, SubscriptionContext, ToastContext
  components/       UI primitives, layout shell, forms, charts
  lib/              tax engine, categorization, CSV, analytics, API clients
  pages/            one file per route
supabase/
  migrations/       ordered SQL — schema, RLS, triggers, storage policies
  functions/        Deno edge functions (all secrets live here)
```

**The backend swap is the central design idea.** `getBackend()` returns
`SupabaseBackend` when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are
both present, and `LocalBackend` otherwise. Pages never branch on which one is
active; they just call the interface.

### Routing

Public: `/`, `/pricing`, `/privacy`, `/terms`, `/disclaimer`, `/login`,
`/signup`, `/forgot-password`, `/reset-password`.

Authenticated (wrapped in `RequireAuth` → `RequireOnboarding` → `AppShell`):
`/dashboard`, `/copilot`, `/income`, `/expenses`, `/receipts`, `/imports`,
`/deductions`, `/tax-estimate`, `/reports`, `/settings`, `/billing`, `/help`.

`/onboarding` requires auth but not completed onboarding. Everything else
falls through to a 404 page with a route back into the app.

---

## Security model

Read this before changing anything in `supabase/`.

1. **Only anon/publishable keys reach the browser.** Any variable prefixed
   `VITE_` is compiled into the public bundle. The service-role key is never
   referenced from `src/`.
2. **Row Level Security is the real boundary.** Every user-facing table has
   `enable row level security` plus `auth.uid() = user_id` policies. Client
   queries additionally filter on `user_id` as defense in depth.
3. **`integration_credentials` has RLS enabled and deliberately no policies.**
   Only the service role (edge functions) can read provider tokens. Tokens are
   AES-GCM encrypted with a key derived from `INTEGRATION_ENC_KEY` before being
   stored — never plaintext.
4. **`linked_accounts` and `transactions` have no INSERT policy on purpose.**
   They are written exclusively by edge functions via the service role. Adding
   a client INSERT policy would let a user fabricate connections and imported
   transactions.
5. **Client-side Pro checks are UX only.** `isEffectivePro()` decides what to
   *show*. Authorization is enforced twice server-side: `userHasProAccess()`
   inside every integration edge function, and the `user_is_pro()` database
   triggers that cap Free-plan expenses and receipts. Those three definitions
   are kept deliberately in sync.
6. **Webhooks verify signatures themselves.** `stripe-webhook` runs with
   `verify_jwt = false` (Stripe cannot present a user JWT) and instead performs
   HMAC-SHA256 verification of the `stripe-signature` header with a 5-minute
   replay window, then records the event id in `stripe_webhook_events` so a
   redelivery is a no-op.
7. **CORS is pinned to `APP_URL`** when that variable is set.

---

## Setting up Supabase

1. Create a project at <https://supabase.com>. Do not run any of this against a
   database with data you care about until you have read the migrations.
2. Apply the migrations, in filename order:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   They are idempotent (`if not exists` / `drop policy if exists`) and create:
   `profiles`, `user_prefs`, `income`, `expenses`, `receipts`,
   `deduction_insights`, `tax_payments`, `tax_estimates`, `subscriptions`,
   `linked_accounts`, `integration_credentials`, `transactions`,
   `category_overrides`, `stripe_webhook_events`, the private `receipts`
   storage bucket and its per-user-folder policies, and the free-plan limit
   triggers.
3. Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.
   Restart the dev server — the demo-mode banner disappears.
4. Auth → URL Configuration: set the Site URL to your `APP_URL` and add
   `{APP_URL}/reset-password` to the redirect allowlist, or password reset
   links will bounce.
5. Deploy the edge functions:
   ```bash
   supabase functions deploy
   ```
   `supabase/config.toml` already sets `verify_jwt` correctly per function.
6. Set the server secrets (see `.env.example` for the full annotated list):
   ```bash
   supabase secrets set APP_URL=... INTEGRATION_ENC_KEY=...
   ```

---

## Setting up Stripe

Nothing about billing works until you supply your own credentials; the app
never invents price ids and reports a clear configuration error otherwise.

1. Create two **recurring Prices** in your Stripe account — one monthly, one
   yearly. The UI advertises $5/month and $40/year
   (`PLAN_FEATURES` in `src/lib/constants.ts`); change that constant if you
   price differently, since Stripe is the source of truth for what is charged.
2. Add a webhook endpoint pointing at
   `https://<project-ref>.functions.supabase.co/stripe-webhook`, subscribed to:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_succeeded`, `invoice.payment_failed`.
3. Set the secrets:
   ```bash
   supabase secrets set \
     STRIPE_SECRET_KEY=... \
     STRIPE_WEBHOOK_SECRET=... \
     STRIPE_PRICE_MONTHLY=price_... \
     STRIPE_PRICE_YEARLY=price_...
   ```
4. Enable the Customer Portal in Stripe (Settings → Billing → Customer portal)
   or `stripe-portal` will fail.

Flow: `stripe-checkout` creates/reuses a Customer (tagged with
`metadata[user_id]`) and returns a hosted Checkout URL. `stripe-webhook` is the
sole writer of the `subscriptions` table. `stripe-cancel` sets
`cancel_at_period_end` so access continues through the paid period.

## Setting up Plaid

```bash
supabase secrets set PLAID_CLIENT_ID=... PLAID_SECRET=... PLAID_ENV=sandbox
supabase secrets set INTEGRATION_ENC_KEY=$(openssl rand -hex 32)
```

`INTEGRATION_ENC_KEY` is mandatory — without it linking is refused rather than
storing a token in the clear. Flow: `plaid-link` mints a Link token →
the browser opens Plaid's hosted widget → `plaid-exchange` swaps the public
token, encrypts and stores the access token, and runs the first
cursor-based sync → `plaid-sync` pulls deltas → `plaid-disconnect` calls
`item/remove` and cleans up. Imported rows land in `transactions` as `pending`
and only become real expenses/income after the user reviews them.

## Setting up Stripe income import (Connect OAuth)

```bash
supabase secrets set STRIPE_CLIENT_ID=ca_...
```

Register `{APP_URL}/imports` as the OAuth redirect URI in your Stripe Connect
platform settings. The `state` parameter is an HMAC-signed, 15-minute token
bound to the user id.

---

## Receipt processing

Uploads always work: the file goes into the private per-user folder of the
`receipts` bucket (10 MB cap, JPG/PNG/WebP/PDF only, enforced by the bucket
*and* the client) and a row is created.

Extraction is best-effort and **honest about its own status**:

| Situation | Result |
| --- | --- |
| `OPENAI_API_KEY` set, image file | Vision extraction → `completed` |
| Model returns nothing usable | `needs_review` with an explanation |
| PDF | `needs_review` — no PDF text extractor exists |
| No key / function not deployed / timeout | `needs_review` with an explanation |

The app never displays an "AI processed" claim when nothing was processed.

---

## Not implemented

- **PayPal income import.** The schema allows `provider = 'paypal'` and
  `src/lib/integration-api.ts` documents the exact shape a future
  implementation should take, but there is no PayPal code and the UI does not
  offer it. The stubs return a clear "not available yet" error.
- **Email notifications.** The `email_reminders` preference is stored and the
  quarterly deadline reminders render *in the app*; nothing sends email. There
  is no mail provider wired up.
- **PDF receipt text extraction.**
- **Multi-state / non-single-filer tax rules.** `src/lib/tax.ts` implements
  simplified federal single-filer estimates only (SE tax, standard deduction,
  approximated QBI) and labels itself as an estimate throughout.

---

## Deployment

`npm run build` emits a static `dist/`. Host it anywhere (Vercel, Netlify,
Cloudflare Pages, S3). Two requirements:

- Set the `VITE_*` variables in the host's build environment — they are baked in
  at build time, so changing them requires a rebuild.
- Configure a **SPA rewrite**: all paths must serve `index.html`, or deep links
  like `/dashboard` will 404.

Set `APP_URL` to the final origin before configuring Stripe, or the checkout
redirects and the Connect OAuth callback will point at the wrong host.
