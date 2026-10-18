# Baron validation — October 18, 2026

## Passed

- **31 Node tests**, including four seeded four-player simulations that reach a winner. Simulations use legal mid-game country portfolios so they can exercise bankruptcy and victory without needing a negotiation AI. They roll, buy/bid, build, redeem, incur debts, liquidate, and advance clocks while checking cash, ownership, even-building, card-circulation, and bank-supply invariants.
- Focused rules cases: 40-space economy, explicit unique colors, ready/start, GO, purchasing, mandatory auctions, five-second bid extensions, rent schedules, three doubles, Jail doubles and third failure, taxes/Free Parking, even building, hotels, half-price sales, mortgage redemption, two-sided trades with held cards and transfer interest, stale/insolvent trades, AFK forfeits, debt extension, automatic liquidation, creditor/bank bankruptcy, queued auctions, off-turn birthday debt, chained Risk/Bonus effects, shortage auctions, hotel liquidation when the bank has no houses, reconnect grace, host-only lobby removal, and private state filtering.
- **Live hosted service check** with separate guest sessions: create/join, choose colors, ready/start, turn authorization, idempotent roll replay, entry closure, session authentication, simultaneous chat writes, actual WebSocket version broadcasts, and blocked anonymous table access. Repeated after deployment of backend version 2; the final concurrency correction is deployed as version 3.
- Static build and JavaScript/TypeScript syntax checks. Relative asset references resolve in `dist/`; public code contains no secret API keys. The board uses separate token-lane elements, darker secondary text, normal label wrapping, and no ellipsis.
- Database metadata confirms row-level security on both application tables and no direct anonymous/authenticated table privileges. Security advisor has no warning/error findings. Informational “RLS enabled, no policy” entries are intentional: only the private service API may access these tables. The unused timestamp index is reserved for room-maintenance queries.

- Eight simultaneous independent guest sessions submitted three batches of eight chat messages. The initial six-attempt compare-and-swap bound caused one retryable conflict. The bound was increased to twelve; the repeated test accepted all 24 submissions, preserved all 24 messages, and returned no errors. No state update was silently lost.

## Live browser and publication checks — completed

- Published at **https://dexxiv.github.io/baron/** from **dexxiv/baron** using GitHub Pages. GitHub Actions ran all 25 rules tests, built the artifact, and deployed successfully. The current app, interaction module and stylesheet use content-hashed filenames so a fresh publication loads its matching assets.
- Created an eight-player room through the live interface and independent guest API sessions. Verified all twelve color choices, uniqueness/ready requirements, game start, forty board spaces, and all eight plain-circle tokens together at GO.
- Read actual rendered geometry: no city/price labels outside their content regions, no token/label overlaps, all tokens inside their reserved lanes, no horizontal page overflow, and the central controls inside the board. Checked a 1080px board with panels below and a 963px board with the player sidebar beside it. The browser viewport reported 1363×936 CSS pixels. This was not an exhaustive browser/monitor matrix.
- Inspected the home page: darker secondary text and raised sample deeds clear their caption. Inspected the full Rio de Janeiro rent/mortgage dialog and the scrollable rules dialog; Escape closes the dialog and restores focus.
- Sent typed room chat in the UI and received chat from a separate guest. A message containing literal HTML-like text remained plain text.
- Let an active purchase expire into the required auction. The browser player bid $25; the public log recorded the +5-second extension and the winning purchase. Untouched later turns expired without a roll.
- Received a trade with a note, countered in the UI with Kolkata and $5 offered for $115, and accepted from the independent recipient session. Ownership changed to that recipient and cash changed from $1,475/$1,500 to $1,585/$1,390. The original offer became countered and the new offer accepted.
- Reload/navigation restored the same player, token color, ownership, cash, chat, and trade history without another signup or seat.
- The managed local preview limitation remains an environment issue; publication testing used the actual live GitHub Pages site instead. Browser console-history inspection was unavailable under credential protection; functional UI and rendered DOM checks supplied the browser evidence.

## Primary implementation references

- [Hasbro classic rules](https://www.hasbro.com/common/instruct/00009.pdf) for the classic rule framework. That older PDF differs on tax/card amounts; the product's selected 2008–2020 baseline is stated explicitly in the design spec and data file.
- [Supabase Realtime protocol](https://supabase.com/docs/guides/realtime/protocol) and [database broadcasts](https://supabase.com/docs/guides/realtime/broadcast).
- [Supabase API-key migration and function secrets](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).


## Purchase and performance correction

- Fixed the purchase-control timeout: Buy now unlocks on the presentation/authoritative movement boundary without needing another server response. An action gate always restores control availability, including unchanged responses, out-of-order responses and failed requests.
- Kept the board DOM in place during chat, bidding and presence changes. Tokens update individually in reserved lanes. Dice tumble immediately on a roll request, settle to the server result, then tokens step through the authoritative movement path. Newly received events play once even when the response arrived after the server animation window; refresh skips completed history. Reduced-motion preferences suppress the cosmetic transforms.
- Dice and movement time are excluded from the server decision budget. Two focused engine tests and four presentation/race regressions complement the existing rules simulations; all 31 pass.
- Backend version 4 combines rate checking and room loading in one database call. Invalidation syncs within the ten-second presence window are read-only when maintenance has nothing to do. Versioned Realtime notifications coalesce reads and trigger a follow-up when a newer notification arrives during an in-flight request. Response timestamps are taken at send time and account for server processing when calibrating the browser clock.
- Repeated the live two-session smoke test after backend version 4: authenticated lobby/start, action replay, concurrent chat, Realtime and anonymous database denial all passed.
- A neutral public address is pending account-settings access. The frontend title and visible interface contain only Baron branding; no personal name is part of those assets.
