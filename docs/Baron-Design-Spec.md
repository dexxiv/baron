# Baron — working game and design specification

Updated October 18, 2026. Rules, board assignments, timing interpretations, and visual direction were approved by the user. Airport labels use IATA codes followed by Airport. The desktop review is complete. The game and backend have been implemented; GitHub Pages publication and browser layout QA are pending.

## Product

Baron is a desktop-first, international property-trading board game for 2–8 people. A visitor enters a username, creates a lobby or joins with a room code, and plays without a visible account-registration flow. The website will be hosted on GitHub Pages, with the user's free Supabase project supporting shared rooms, validated game actions, chat, and reconnection.

The board and economy follow a single classic US dollar reference edition: 40 spaces, 22 colored properties in eight groups, four transport properties, two utility equivalents, two dice, $1,500 starting cash, and the corresponding classic purchase, rent, building, mortgage, and card-effect tables. Chance is renamed Risk; Community Chest is renamed Bonus. Airports replace railroads. Card destinations and transport/utility rent instructions map to the matching Baron spaces.

The selected baseline is the 2008–2020 US dollar economy with traditional pre-2021 card effects: fixed $200 Income Tax, $100 Luxury Tax, and $50 school fees. The older optional percentage tax and $75 Luxury Tax are not mixed into this baseline. Card wording is original Baron text; effects and destination positions are preserved.

## Approved rules

- Use the classic rules discussed in the conversation, with the Free Parking exception below.
- Preserve starting order, movement, doubles, three-doubles imprisonment, Jail choices, full-color-group ownership benefits, even construction and even building sales, the finite supply of 32 houses and 12 hotels, building shortages, and building auctions.
- Preserve building resale at half cost, mortgage restrictions and interest, restrictions on transferring developed properties, and bankruptcy transfers and auctions. The last solvent player wins.
- Preserve shuffled decks that cycle, and held escape cards that can be traded and are returned to their original deck upon use.
- Declining an unowned property triggers an auction; the declining player may bid.
- Rent collection is automatic, following the previously recommended digital adaptation accepted by the user.
- Full room chat and typed notes accompanying trade offers are included.
- A trade can exchange eligible deeds, held cards, and cash on both sides. Its complete exchange is validated and applied together. Classic restrictions on developed properties still apply.

## Free Parking pot

The user explicitly requested that taxes and fines be collected when someone lands on Free Parking. The pot accumulates qualifying payments; landing on the space pays its whole current balance to the player and resets it to zero. No money is created to seed or refill the pot.

Approved payment classification:

- Into the pot: income/luxury taxes, Jail fines, and bank-directed card penalties or fees, including repairs.
- To the bank: property purchases, auction purchases, construction, mortgage redemption, and mortgage interest.
- Directly between players: rent, trade payments, and card instructions requiring payments to another player.

The user approved including card fees and penalties in the pot on October 18, 2026.

## AFK and timers

User requirements:

- Each normal turn has a two-minute decision clock. Player activity does not reset it.
- Animations do not consume decision time.
- Expiry forfeits the turn. A player who has made no game action does not get an automatic roll.
- If a roll is already underway at expiry, finish resolving that roll, then end the turn. Do not grant another roll from doubles after expiry.
- If optional buying remains unresolved at expiry, decline the purchase and conduct the required auction before advancing play.
- The initial auction clock is 30 seconds. Each valid bid adds five seconds to the remaining auction time.
- Auctions pause the current turn's decision clock.
- Outstanding debt grants a single extra 30 seconds, followed by automatic liquidation if unresolved. Management actions do not repeatedly renew that extension.
- Each player gets one disconnect grace period per game. Later disconnections do not create new pauses; returning to the same game remains allowed.

Approved timing details:

- Use a 30-second disconnect grace period, once per player. Pause the relevant decision clock while that grace is used.
- For debt incurred by the active player, add 30 seconds to their remaining turn time. For an off-turn player who owes money, provide a separate 30-second debt window while the active turn waits.
- Automatic liquidation legally sells buildings, then mortgages enough eligible deeds to cover the debt. Stop when the payment can be made. If all legally available liquidation still cannot cover it, apply classic bankruptcy.
- Resolve mandatory payment/auction consequences before moving to the next player's turn. A forfeited turn never cancels a debt already incurred or a completed bid.
- Trading does not automatically extend a turn. An expired or changed offer cannot be accepted against stale cash or ownership.

## Approved international board

Each color group belongs to one country. The progression is a game-oriented blend of affluence and economic scale, with the familiar classic price ladder. These countries, cities, and purchase prices were approved on October 18, 2026.

| Group | Country | Cities in board order | Prices | Building cost per house/hotel step |
|---|---|---|---|---|
| Brown | Kenya | Mombasa; Nairobi | $60; $60 | $50 |
| Light blue | India | Kolkata; Mumbai; New Delhi | $100; $100; $120 | $50 |
| Pink | Brazil | Salvador; Rio de Janeiro; São Paulo | $140; $140; $160 | $100 |
| Orange | China | Guangzhou; Shanghai; Beijing | $180; $180; $200 | $100 |
| Red | Italy | Naples; Venice; Rome | $220; $220; $240 | $150 |
| Yellow | France | Lyon; Nice; Paris | $260; $260; $280 | $150 |
| Green | Japan | Osaka; Kyoto; Tokyo | $300; $300; $320 | $200 |
| Dark blue | Switzerland | Geneva; Zurich | $350; $400 | $200 |

Approved airport labels: LHR Airport, DXB Airport, SIN Airport, and HND Airport. Each costs $200 and uses the original railroad ownership/rent schedule.

Approved utility equivalents: Energy Grid and Data Network. Each costs $150 and uses the original utility ownership/dice-rent rules.

### All 40 spaces, clockwise from GO

Numbers below indicate reading order, beginning with GO as space 1. Names, not original square positions, are changing.

| Space | Baron space | Kind | Purchase price |
|---|---|---|---|
| 1 | GO | Corner | — |
| 2 | Mombasa | Brown / Kenya | $60 |
| 3 | Bonus | Card | — |
| 4 | Nairobi | Brown / Kenya | $60 |
| 5 | Income Tax | Tax | — |
| 6 | LHR Airport | Airport | $200 |
| 7 | Kolkata | Light blue / India | $100 |
| 8 | Risk | Card | — |
| 9 | Mumbai | Light blue / India | $100 |
| 10 | New Delhi | Light blue / India | $120 |
| 11 | Jail / Just Visiting | Corner | — |
| 12 | Salvador | Pink / Brazil | $140 |
| 13 | Energy Grid | Utility equivalent | $150 |
| 14 | Rio de Janeiro | Pink / Brazil | $140 |
| 15 | São Paulo | Pink / Brazil | $160 |
| 16 | DXB Airport | Airport | $200 |
| 17 | Guangzhou | Orange / China | $180 |
| 18 | Bonus | Card | — |
| 19 | Shanghai | Orange / China | $180 |
| 20 | Beijing | Orange / China | $200 |
| 21 | Free Parking | Corner / pot payout | — |
| 22 | Naples | Red / Italy | $220 |
| 23 | Risk | Card | — |
| 24 | Venice | Red / Italy | $220 |
| 25 | Rome | Red / Italy | $240 |
| 26 | SIN Airport | Airport | $200 |
| 27 | Lyon | Yellow / France | $260 |
| 28 | Nice | Yellow / France | $260 |
| 29 | Data Network | Utility equivalent | $150 |
| 30 | Paris | Yellow / France | $280 |
| 31 | Go to Jail | Corner | — |
| 32 | Osaka | Green / Japan | $300 |
| 33 | Kyoto | Green / Japan | $300 |
| 34 | Bonus | Card | — |
| 35 | Tokyo | Green / Japan | $320 |
| 36 | HND Airport | Airport | $200 |
| 37 | Risk | Card | — |
| 38 | Geneva | Dark blue / Switzerland | $350 |
| 39 | Luxury Tax | Tax | — |
| 40 | Zurich | Dark blue / Switzerland | $400 |

## Approved visual direction

- Desktop is the primary and only requested layout target. Do not spend implementation time on phone-specific optimization.
- Warm cream, deep green, and restrained gold; travel-atlas/tabletop styling.
- Flat square board with familiar color bands and legible city names.
- Board on the left; players, timer, context actions, and relevant details on the right.
- Clearly distinguish the active player, current dice result, pending action, and ownership.
- Every property opens its full economic details and allowed actions.
- Latest approved refinements: keep the existing Terracotta, Evergreen, Plum, and Brass token colors and add eight for a total of 12 unique selectable colors. Every player must choose a color before becoming ready; no duplicate selections in a room.
- Tokens are plain circles, without icons or letters. Each space has a separate 28-pixel token lane with room for all eight players. Movement hops between these reserved lanes so circles never cross names, prices, or other numbers.
- The board has a minimum desktop width of 960 pixels. Side panels move below it on narrower desktops; the board does not shrink into cramped labels. Names wrap normally without ellipses or clipping.
- All secondary gray text is darker. Home example-property cards are raised about 34 pixels, with a separate clear caption area.
- The live Free Supabase project Baron was created in dex’s org, ref cmmehdaqvekuslbdjxye, in us-east-1. No paid plan or add-on was enabled.

## Proposed screen and interaction detail

1. Home: Baron branding, username entry, Create lobby, Join with code, short rules access.
2. Lobby: room code, copyable invite, 2–8 player seats, token/color selection, ready indicators, room chat, host start.
3. Game: square board, visible Free Parking pot, roster and cash, prominent turn clock, contextual roll/buy/end controls, grouped personal portfolio.
4. Auction: current lot, current price, leading bidder, countdown, bid entry and quick increments, public bid updates.
5. Trade: two-column asset selection, cash entry on both sides, selected held cards/deeds, a typed note, accept/reject/counteroffer, clear warnings for mortgage interest and invalid selections.
6. Communication: full room chat alongside a separate public game-event log. Chat and notes are displayed as plain text.
7. Debt: amount owed, recipient, remaining extension, available management actions, and visible automatic-liquidation behavior.
8. Results: winner, finishing order, rematch. Eliminated players may continue watching.

## Lobby and session behavior

- Reconnect to the existing player after refresh.
- Transfer lobby leadership when the host leaves.
- Close entry for new players after the game begins; returning players can reclaim their existing seat.
- Use the user's free Supabase account; no paid plan or add-on is authorized.
- The service, rather than any player's browser, validates rolls, balances, turn rights, timers, auctions, and trades.
- Review the existing Supabase projects and obtain the correct project identity before making changes. Do not alter unrelated projects or tables.

## Review and implementation stages

Completed: the country/city board, pot-payment classification, timing behavior, and airport-label format are approved.

Completed: the desktop mockups and the latest contrast, token, spacing, and home-card refinements were approved.

Implemented: rules engine, desktop interface, Supabase persistence, authenticated guest actions, and Realtime notifications. Rules tests and live multi-session service checks pass. Remaining: publish to GitHub Pages and perform browser visual/interaction QA. The managed local preview is unavailable because its sandbox cannot mount /proc; do not treat visual QA as completed.

Review should continue at the agreed stages; do not silently replace this concept with another game.

## Concrete digital timing details

A scarce house (four or fewer bank houses) or hotel (two or fewer) request opens a five-second contest window if another eligible builder exists. A contest starts the normal 30-second auction; every bid adds five seconds. With no contest, the requester purchases at the printed construction cost. Incoming mortgaged deeds charge transfer interest atomically; the immediate-redemption choice stays open for 30 seconds. Whole-dollar interest rounds up. These are the concrete digital resolutions of the accepted classic scarcity and transfer rules.
