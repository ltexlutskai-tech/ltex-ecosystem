# Contributing to L-TEX Ecosystem

## Development Setup

1. Clone the repo and install dependencies:
   ```bash
   pnpm install
   ```

2. Copy `.env.example` to `apps/store/.env.local` and fill in the values.

3. Generate Prisma client:
   ```bash
   pnpm --filter @ltex/db exec prisma generate
   ```

4. Start the dev server:
   ```bash
   pnpm dev
   ```

## Code Style

- **Language**: TypeScript strict mode (no `any`)
- **Formatting**: Prettier (check with `pnpm format:check`, fix with `pnpm format`)
- **UI Language**: Ukrainian (site lang="uk")
- **Components**: shadcn/ui + Radix primitives + Tailwind CSS

## Git Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Run tests: `pnpm test`
4. Run typecheck: `pnpm typecheck`
5. Run format check: `pnpm format:check`
6. Commit with a descriptive message
7. Push and create a pull request

## Testing

- **Unit tests**: Vitest — `pnpm test`
- **E2E tests**: Playwright — `pnpm test:e2e` (requires dev server + DB)
- **Type checking**: `pnpm typecheck`

Test files live next to the code they test (e.g., `lib/validations.test.ts`).

## Project Conventions

- **Prices**: EUR for wholesale, UAH for display (rate from exchange_rates table)
- **Minimum order**: 10 kg
- **Slugs**: Ukrainian transliteration (custom, no external library)
- **Search**: PostgreSQL tsvector + trigram fallback (simple config for Ukrainian)
- **Rate limiting**: In-memory sliding window (per-process)
- **Auth**: Supabase Auth for admin, phone-based for mobile
