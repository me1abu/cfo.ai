# AI Invoice Saudi

AI-assisted, ZATCA-ready invoicing for Saudi businesses. Create tax invoices, generate Phase 1
QR codes, validate against VAT rules, and extract invoice data from uploaded documents.

## Stack

- TanStack Start (React 19, SSR, file-based routes) + TypeScript
- Tailwind 4 + shadcn/ui
- Supabase (Postgres, Auth, Storage) via Drizzle
- Claude (Anthropic SDK) called from server functions only
- @react-pdf/renderer (pinned) with the Cairo font for bilingual PDFs, `qrcode` + `jsQR` for ZATCA QR
- Resend for email
- Vitest for tests, Vercel for hosting

## Development

```sh
npm install
cp .env.example .env   # then fill in the values
npm run dev
```

Scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `format`.

`npm test` writes `test-output/invoice-sample.pdf`. Open it after changing PDF fonts or upgrading
`@react-pdf/renderer` (pinned): Arabic shaping depends on the exact font and library version, and
automated checks can't see broken glyphs.

## Deployment

The build uses Nitro. Set `NITRO_PRESET=vercel` in Vercel's environment for a Vercel deployment;
the default `node-server` preset produces a standalone Node server in `.output/`.
