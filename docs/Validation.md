# Baron validation — October 18, 2026

## Passed

- **25 Node tests**, including four seeded four-player simulations that reach a winner. Simulations use legal mid-game country portfolios so they can exercise bankruptcy and victory without needing a negotiation AI. They roll, buy/bid, build, redeem, incur debts, liquidate, and advance clocks while checking cash, ownership, even-building, card-circulation, and bank-supply invariants.
- Focused rules cases: 40-space economy, explicit unique colors, ready/start, GO, purchasing, mandatory auctions, five-second bid extensions, rent schedules, three doubles, Jail doubles and third failure, taxes/Free Parking, even building, hotels, half-price sales, mortgage redemption, two-sided trades with held cards and transfer interest, stale/insolvent trades, AFK forfeits, debt extension, automatic liquidation, creditor/bank bankruptcy, queued auctions, off-turn birthday debt, chained Risk/Bonus effects, shortage auctions, hotel liquidation when the bank has no houses, reconnect grace, host-only lobby removal, and private state filtering.
- **Live hosted service check** with separate guest sessions: create/join, choose colors, ready/start, turn authorization, idempotent roll replay, entry closure, session authentication, simultaneous chat writes, actual WebSocket version broadcasts, and blocked anonymous table access. Repeated after deployment of backend version 2.
- Static build and JavaScript/TypeScript syntax checks. Relative asset references resolve in `dist/`; public code contains no secret API keys. The board uses separate token-lane elements, darker secondary text, normal label wrapping, and no ellipsis.
- Database metadata confirms row-level security on both application tables and no direct anonymous/authenticated table privileges. Security advisor has no warning/error findings. Informational “RLS enabled, no policy” entries are intentional: only the private service API may access these tables. The unused timestamp index is reserved for room-maintenance queries.

## Pending

- **Browser visual and interaction QA**: not yet verified. The managed preview service exits before startup because its sandbox cannot mount `/proc`. The application was not changed to work around this environment failure. Check the published site at 1024, 1280, 1440, and 1920 desktop widths, including long city/user names, all eight tokens on one square, moving tokens, auction/debt states, modals, keyboard focus, and home-card/caption spacing.
- **GitHub Pages publication**: source and workflow are ready. Repository creation and Pages configuration require browser sign-in; the connected GitHub API lacks those administrative operations.

## Primary implementation references

- [Hasbro classic rules](https://www.hasbro.com/common/instruct/00009.pdf) for the classic rule framework. That older PDF differs on tax/card amounts; the product's selected 2008–2020 baseline is stated explicitly in the design spec and data file.
- [Supabase Realtime protocol](https://supabase.com/docs/guides/realtime/protocol) and [database broadcasts](https://supabase.com/docs/guides/realtime/broadcast).
- [Supabase API-key migration and function secrets](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
