# Baron

**Play: [dexxiv.github.io/baron](https://dexxiv.github.io/baron/)**

A desktop international property-trading game for 2–8 players. The static website runs on GitHub Pages; a Supabase Free project stores rooms and validates actions. Players enter a username and room code, choose a unique circle-token color, and play without creating an account.

## Run and test

Requires Node 24. There are no third-party runtime or npm dependencies.

```sh
npm test
npm run build
```

Serve `dist/` with a static web server. ES modules need HTTP(S); opening `index.html` directly with a file URL does not work. The configured backend is live. `node tests/live-smoke.mjs` creates a QA room and checks two real guest sessions, lobby/start, turn enforcement, replay protection, concurrent chat, Realtime broadcasts, closed entry, and database privacy. Run it intentionally; it creates a room and uses the free project's request quota. `node tests/live-concurrency.mjs` creates an eight-session room and checks three batches of simultaneous chat submissions; it is also a deliberate live check, not part of CI.

## Publish on GitHub Pages

1. Create the public repository `baron` in the intended GitHub account and push this source to `main`.
2. In **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**.
3. Run **Test and publish Baron**, or push to `main`. Its output supplies the actual Pages URL.

The workflow tests before publishing and builds a self-contained static artifact. It needs no repository secrets and no OpenAI services. Use the URL returned by GitHub after deployment. The project repository is [dexxiv/baron](https://github.com/dexxiv/baron).

The Supabase backend is already deployed in **dex's org**, project **Baron**, ref `cmmehdaqvekuslbdjxye`, region `us-east-1`. The browser's `public/config.mjs` contains only its URL and publishable key. No secret/service key belongs in the repository.

## Game behavior

- 40 spaces, 22 cities in 8 countries, 4 IATA-labelled airports, 2 networks, $1,500 starting cash, and classic dollar economics.
- 12 selectable colors. Tokens are plain circles in separate lanes; movement steps between those lanes, never across labels.
- Full-country benefits, even construction and sales, 32 houses/12 hotels, shortage contests and building auctions, mortgages and interest, doubles, Jail, chained cards, debt liquidation, bankruptcy, and rematches.
- Risk and Bonus: 16 cycling cards each, with traditional 2008–2020 US-dollar effects and original Baron wording. Tax values are $200 and $100; school fees are $50. This intentionally uses the modern pre-2021 baseline, not the older percentage-income-tax/$75-luxury-tax edition.
- Free Parking collects taxes, Jail fines, and bank-directed card fees and repairs, then pays the full pot on landing. Purchases, construction, and mortgages are separate bank payments.
- Two-minute turns, no automatic AFK rolls, animation time excluded, 30-second auctions, every valid bid adds five seconds, one debt extension, automatic legal liquidation, and one reconnect grace per player per game.
- Two-sided trades of deeds, cash, held cards, and a private note; accept, reject, withdraw, or counter. Incoming mortgage interest is paid atomically; the immediate-redemption window is 30 seconds.
- Room chat, public event log, automatic rent collection, refresh recovery, host transfer, entry closure at start, and eliminated-player spectating.

The exact accepted product decisions are in `docs/Baron-Design-Spec.md`. In a building shortage, a purchase request gives other eligible builders five seconds to contest; a contested request opens the standard timed auction. A scarce building still needs a legal target. An uncontested request is bought at its normal construction price.

## Architecture and credentials

- `shared/data.mjs`: complete board and card data; copied into the static build.
- `shared/engine.mjs`: pure game rules and invariants. Random rolls and shuffles use cryptographic rejection sampling on the server.
- `server/index.ts`: Supabase Edge Function `baron`. Authenticates a 256-bit per-room guest credential; only its SHA-256 hash is stored. The browser saves its own credential locally to reconnect.
- `database/schema.sql`: private RLS-protected tables and service-only invoker RPCs. No anonymous or authenticated direct table access is granted. `baron_commit` uses optimistic version comparison: conflicting requests re-read and revalidate. Request IDs prevent replay from duplicating a roll or trade.
- Realtime broadcasts contain only a room version; authenticated HTTP responses supply an explicit public-state allowlist. Card order, credential hashes, and unrelated trade notes are never broadcast. HTTP heartbeat polling also advances timers if a WebSocket drops. If everyone closes the room, maintenance resumes when someone returns.
- `public/`: dependency-free HTML/CSS/ES modules. All chat, names, and trade notes are escaped/plain text. No external analytics or fonts.

The Edge Function sets `verify_jwt=false` because it performs its own guest-session authentication; it is not an unauthenticated action endpoint. Server access uses Supabase-injected `SUPABASE_SECRET_KEYS.default`, with a legacy service-role fallback. Those environment values are never returned or committed.

## Backend deployment for maintainers

Apply `database/schema.sql` once to an empty project. Deploy the following files together as the `baron` function, with `index.ts` as its entrypoint, an explicit `deno.json` import-map path, and `verify_jwt=false`:

| Deployment file | Source |
|---|---|
| `index.ts` | `server/index.ts` |
| `engine.mjs` | `shared/engine.mjs` |
| `data.mjs` | `shared/data.mjs` |
| `deno.json` | `server/deno.json` |

Redeploy the function whenever its engine or data changes; publishing Pages alone does not change the server. Update `public/config.mjs` if moving projects. Keep the project on the Free plan; no paid add-on or upgrade was enabled. Free service quotas and inactivity policies still apply.

## Verification status

See `docs/Validation.md` for the tested cases and remaining browser/publishing checks. The test suite includes randomized multi-player simulations in addition to focused edge cases. Live browser QA passed in an eight-player room, including board-label/token separation, chat, auctions, typed counteroffers exchanging property and cash, and refresh recovery. Both the 963px board with sidebar and the 1080px board with panels below were checked.
