# Backlog

Ideas agreed but not built yet. Newest at the top of each section.

## Native iOS app (not the web preview)

### Clash Royale: "Open Clash Royale" + suggest the result screenshot
Goal: fewer taps from finishing a Friendly Battle to reporting it.

1. **"Open Clash Royale" button** in the Clash Royale match room (next to the
   player tags). Opens the game through its app link (URL scheme), with the
   App Store page as a fallback when the game isn't installed. On iOS, the
   scheme must be listed in `app.json` (`ios.infoPlist.LSApplicationQueriesSchemes`)
   to check whether the game is installed.
2. **"Use this screenshot?"** When the player comes back to report, the app
   looks in their photos (with permission, e.g. `expo-media-library`) for the
   **latest screenshot taken after the match started** (`startedAt`), shows it,
   and asks "Use this screenshot?" with **Use it** / **Choose another**.
   If there is none, fall back to the normal "Choose screenshot" / "Take photo".
   - Only screenshots (not camera photos), newest first, created after
     `startedAt`.
   - The phone's "taken at" time is only a hint: the server keeps its own
     checks (upload inside the match window, duplicate / look-alike refusal,
     automatic photo check).
   - Ask for photo access only at this moment, with a plain explanation.
   - Not possible on the web preview (a web page can't browse the photo
     library), so the web keeps the current buttons.

### Other native items
- Camera: replace the system camera with `expo-camera` for the result photo
  (see "Results and review" in CLAUDE.md).

## App Check (before TestFlight; planned)
Stops scripts and other apps from calling our Cloud Functions, Firestore and
Storage with the public Firebase config: only the real Betterplayer app (web on
GitHub Pages, iOS build) gets a valid token. Email verification (built) limits
fake accounts; App Check limits fake clients.

Console steps you'll need (Firebase console → App Check):
1. Web app: register the web app with **reCAPTCHA v3** (or reCAPTCHA Enterprise):
   create the site key at google.com/recaptcha (domains `betterplayer23.github.io`
   and `localhost`), paste it in the console and copy it into the app
   (`src/firebase/appCheck.ts`, public like the rest of the web config).
2. iOS app: register the iOS app (bundle `com.betterplayer`) with **App Attest**;
   needs the App Store team ID in the console and the `expo-build-properties` /
   EAS build (a native build; not needed for the web preview).
3. Debug tokens: in App Check → Apps → ⋮ → "Manage debug tokens", add one for
   the emulator/browser tests, set `FIREBASE_APPCHECK_DEBUG_TOKEN` there.
4. Enforcement: switch on "Enforce" for **Cloud Functions**, **Firestore** and
   **Storage** only after the metrics tab shows ~100% verified requests for a few
   days (unenforced first, so nobody gets locked out).
Code side: `initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true })`
in the app; `enforceAppCheck: true` on every callable in `functions/src/index.ts`
(keep it off in the emulator).

## Smaller clean-ups (later)
- **Bundle trim** (~15% of the web JS): replace `react-native-reanimated` (only the
  pulsing dot uses it) with React Native's built-in `Animated`; `expo-symbols`
  (two icons) with a small SVG; drop unused deps `expo-web-browser`,
  `expo-constants`, `expo-linking`.
- **One match type**: `src/matches/types.ts` and `functions/src/matches/common.ts`
  both describe a match; derive one from a shared type in `functions/src/shared`.
  Delete dead code: `primaryGlow`, `fonts.headingHeavy`, the `stake_returned` label,
  `src/matches/format.ts` (a pure re-export).
- **Lint**: add `eslint-config-expo` so `npx expo lint` works (AGENTS.md asks for it).
- **`rebuild-stats` memory**: it loads every completed match at once; fine for the
  beta, page it (by `settledAt`) before ~100k matches.
- **Storage rules**: `match_(matchId)` is called three times per upload check (the
  rules engine deduplicates it); one helper would read better.

## Server
- Clash Royale results from the official battle log (`GET /players/{tag}/battlelog`):
  find the Friendly Battle against the opponent's tag after `startedAt`. Needs a
  fixed outgoing IP for the API key (Cloud NAT, or a proxy). Planned, not built.

## Player stats, phase 2: stats from the games themselves (planned)
Show each player's in-game stats next to their Betterplayer stats, using the game
IDs they saved. Fetched by Cloud Functions (keys in Secret Manager), cached (e.g.
once a day), shown only when available. Needs a beta rules update (new data use).

- **Clash Royale** – official API (developer.clashroyale.com): trophies, best
  trophies, wins, losses, three-crown wins. Free, needs a developer account and a
  key tied to fixed IP addresses (same fixed-IP work as the battle-log check).
  Supercell's Fan Content Policy and API terms apply (non-official, no Supercell
  logos/artwork, keep their disclaimer).
- **Fortnite** – no official public stats API from Epic. Community APIs (e.g.
  fortnite-api.com with a free API key) return wins, kills, K/D, matches — only
  when the player's in-game stats are public. Third party: no guarantee it keeps
  working; follow its terms and Epic's fan content rules.
- EA FC and Warzone: no reliable public stats API; keep our own stats only.

## Open matches: filters, sorting and paging (planned)
Goal: find a match to join quickly once there are many open matches.

- **Game chips** at the top of Matches → Open: All, EA FC, Clash Royale, Warzone,
  Fortnite. One chip at a time; "All" by default.
- **Platform filter**: defaults to the player's own `platforms` (from Profile);
  they can tick/untick platforms. Needs a new field on each match:
  `platforms` (the host's platforms at creation, or a platform the host picks in
  Create). Matches created before this have no field: show them under "All
  platforms" only.
- **Sort**: "Newest" (`createdAt` newest first) or "Starting soon". Open matches
  have no start time today; "Starting soon" = fewest free places first, then
  closest to expiring (`expiresAt`). If large lobbies (below) add a fixed start
  time, it sorts by `startsAt`.
- **20 per page, infinite scroll**: Firestore `limit(20)` and `startAfter(last)`,
  the next page loads when the list reaches the bottom. Only the first page is
  live (updates on its own); older pages are loaded once.
- **Server-side queries** (Firestore does the filtering, not the phone).
  `platforms` is a list, so the query uses `array-contains-any` (up to 30 values).
  Indexes to add in `firestore.indexes.json`:
  - `matches`: `status` ↑, `game` ↑, `createdAt` ↓ (game chip + Newest)
  - `matches`: `status` ↑, `platforms` (array), `createdAt` ↓ (platform + Newest)
  - `matches`: `status` ↑, `game` ↑, `platforms` (array), `createdAt` ↓
  - the same three with `expiresAt` ↑ instead of `createdAt` ↓ (Starting soon)
  - "Fewest free places" needs a stored number `freePlaces`, updated by
    `joinMatch` / `leaveMatch`, plus indexes with it.
- Security rules don't change (signed-in players can already read matches).

## Large private lobbies: Warzone (incl. Rebirth Island) and Fortnite, 32–100 players (planned)
A new match type next to 1v1 and squads: one host, one in-game private match,
many Betterplayer players.

- **Setup (host)**: game, map/mode (e.g. Warzone Rebirth Island), **fixed start
  time**, **player cap** 32–100, then shares the **in-game private match code**
  in the lobby (like `setLobbyCode` today, shown only to joined players).
  Check first that the host can create such a match: Fortnite private matches
  need custom-matchmaking access (usually a creator code), Warzone private
  matches have their own minimums and rules.
- **Joining**: first come, first served up to the cap, then a **waitlist**. If a
  player leaves before the start, the first waitlisted player moves up (with a
  notification). At the start time the list is frozen, entries are locked (2
  credits each, as today) and waitlisted players are released.
- **No-shows**: a player who doesn't submit a result counts as last with 0
  eliminations; their entry stays in the pot.
- **Prize split to the top 3**, default **50 / 30 / 20** of what's left after the
  fee. Example: 100 players → pot 200, fee 20 (10%), 180 left → 90 / 54 / 36.
  Fewer than 3 valid results → the split is rescaled among them. Ties on a place
  share those places' credits equally in cents (like `splitWinnings` today).
- **Score** = eliminations + placement points. Suggested default: 1 point per
  elimination; placement 1st 15, 2nd 12, 3rd 10, 4th–5th 8, 6th–10th 5,
  11th–25th 2, others 0. Tie → higher placement, then fewer deaths/more damage.
  The table lives in `functions/src/shared/games.ts` like the other rules.
- **Results**: each player submits **their own end screen** (placement +
  eliminations). Vision reads each one; then a **cross-check** across all
  screens: only one 1st place, placements don't repeat (solos) or repeat only
  within a squad, eliminations add up to at most the number of players, times
  inside the match window, no duplicate / look-alike photos. Anything that
  doesn't fit goes to an admin with the reasons.
- **Anti-teaming rules** (in the beta rules, new version): no teaming with other
  players in solo lobbies, no feeding, no sharing accounts. Signals to flag for an
  admin: the same players repeatedly finishing next to each other, reports from
  other players, a moderator photo that contradicts a report. Penalty:
  disqualification from the lobby (entry not returned, goes to the pot),
  reputation −10, repeat → banned from large lobbies.
- **Technical notes**: settling 100 players = ~100 ledger entries + 100 wallets +
  100 stats in one transaction, close to Firestore's 500-writes limit. Plan:
  split into a "results frozen" step and idempotent settlement batches (one per
  group of players), each safe to re-run. The daily limit counts a lobby as 1 match.
  Stats: Elo for 100 players needs its own rule (e.g. placement-based).

## Community moderators in large lobbies (planned)
Any player in a large lobby can act as a moderator by photographing the
**winner's** result.

- **What they submit**: a photo of the WINNER's end screen or the in-game final
  standings (e.g. while spectating after being eliminated). Never their own
  result, and not a squad-mate's (same squad counts as "own").
- **Vision checks each moderator photo** like any result photo (timing,
  duplicates, reading names and numbers). Two moderators sending the same image
  → both refused (duplicate check).
- **Reputation rules**:
  - +2 reputation only when the moderator photo **matches the confirmed result**
    (the final, settled winner).
  - At most **one reward per player per match**.
  - No points for photos of your own (or your squad's) result.
  - A photo that **contradicts the confirmed result** costs −3.
  - Reputation can't be transferred, sold or bought (no feature ever moves it
    between players).
  - Rewards are given at settlement, in the same transaction, with an
    append-only record `reputation_log/{matchId}_{uid}` so every point can be
    explained and a reversal can undo it with a new entry.
- **Extra evidence for the automatic check**: moderator photos that agree with
  the winner's own report raise confidence; any that disagree send the lobby to
  an admin (`reviewReasons`: `moderator_conflict`).

## Reputation rewards (ideas, planned)
What reputation could unlock. Nothing here has a money value.

- **Badges** on the profile and in match rooms: "Trusted reporter" (many
  confirmed reports, no lost disputes), "Moderator" (N correct moderator photos),
  "Fair play" (no disputes lost in 30 days), game-specific badges.
- **Profile themes**: neon colour accents for the profile card and name
  (from the design tokens, no game artwork).
- **Trusted moderator status** (e.g. 50+ points and 10+ correct moderator
  photos): their photos count as stronger evidence; lost if they drop below the
  level or submit a contradicting photo.
- **Priority in lobbies**: an early join window (e.g. 10 minutes before
  everyone else) or moving up the waitlist first.
- Levels (Bronze / Silver / Gold / Neon) shown next to the gamer tag.

## Rewards store (LEGAL REVIEW REQUIRED BEFORE ANY BUILD)
A catalogue of gaming items: gear (headsets, controllers, mouse pads), gift
cards, Fortnite V-Bucks, COD Points. **Nothing below is legal advice**; every
point must be confirmed by a Spanish lawyer (gaming, consumer and tax law)
before any work starts.

### Option A: paid with match credits
- **What it changes legally**: today credits have no money value, which is why
  the beta is "credits only". If credits can be swapped for items with real
  value, credits gain a money value. Paying 2 credits to enter a match with an
  uncertain result, to win more credits, could then be treated as **gambling**
  under Spain's gambling law (Ley 13/2011), which needs a licence from the DGOJ
  (the Spanish gambling regulator), strict age/identity checks (KYC), responsible
  gaming tools, anti-money-laundering rules and the rules on gambling advertising
  (Real Decreto 958/2020). Skill games are not automatically outside that law.
  Very likely **not possible without a licence**; also changes the beta rules,
  the privacy text and the "no cash words" approach.
- Also: prize tax (in Spain, prizes above a threshold can need a tax withholding
  by the organiser), consumer law (returns, warranties on gear), VAT.
- **Publishers' rules**: see below; apply to both options.

### Option B: paid with reputation points only
- **What it changes legally**: reputation is earned only by playing fair and
  moderating, can't be bought or transferred, and no credits are involved, so
  it's closer to a **loyalty or promotional scheme** than gambling. Still to
  confirm: whether it counts as a promotional contest (regional rules and tax on
  "combinaciones aleatorias" may apply if chance is involved), prize tax
  withholding on items above the threshold, consumer law, and that reputation
  can never be linked to credits (or players could "buy" reputation by winning
  matches). Much lower risk than A, but not zero.

### Publishers' rules on V-Bucks and COD Points (both options)
- Epic's and Activision's terms say in-game currency has no real-world value
  and **can't be sold, traded or transferred** outside their stores; buying and
  reselling codes is not allowed except through their **authorised retailers**.
- The legal way to give them is an **official gift card / code bought from an
  authorised seller**. Even then, gift-card terms may forbid resale or using
  them as prizes without permission: check the exact terms, and ask Epic and
  Activision in writing if unclear.
- Codes are region-locked: buy Spain/EU codes only.
- Using the names Fortnite, V-Bucks, Call of Duty, COD Points in a store needs
  care (trademarks): plain names, no logos or artwork (as today).
- Epic and Activision also have rules for third-party tournaments with prizes;
  read them before offering prizes linked to their games.

### Suppliers, stock, delivery, costs (both options)
- **Suppliers**: authorised digital gift-card distributors with an API (e.g.
  large B2B gift-card platforms) for codes; a regular retailer or distributor
  for physical gear. Contract, invoices and proof they are authorised.
- **Stock**: digital codes bought on demand through the API (no stock to hold)
  or a small prepaid pool; physical gear in small batches, or drop-shipped.
- **Delivery**: codes shown once in the app (in a server-only document, read
  only by the owner) and sent by email; physical items need a shipping address
  (new personal data → privacy text update) and tracking.
- **Costs**: face value of each item, distributor fee, VAT, shipping, payment
  fees, a lawyer's review, possible licence/tax costs (A), fraud checks (multiple
  accounts farming reputation), customer support.
- **Technical**: redemptions are Cloud Functions only, idempotent, with an
  append-only record (like the ledger); the app never writes them.

### Open questions for you
1. Open matches: should a match be tied to one platform the host picks, or to all
   the host's platforms? Should cross-play games (Fortnite, Warzone) ignore the
   platform filter?
2. Large lobbies: the same 2-credit entry, or a different entry for lobbies? Is
   the 10% fee the same? Is 50 / 30 / 20 fine for 32 players as well as 100?
3. Large lobbies: are you (or trusted hosts) able to create Fortnite / Warzone
   private matches of that size? Who can be a host: anyone, or only
   trusted players?
4. Score: are the suggested placement points OK, or do you want eliminations
   only?
5. Moderators: +2 for a correct photo and −3 for a contradicting one: are these
   numbers OK? Should moderators be allowed in 1v1 and squad matches later?
6. Reputation rewards: which ones first (badges, themes, trusted moderator,
   lobby priority)? Can reputation ever raise the 10-matches-per-day limit?
7. Rewards store: do you want to pay for a lawyer's review? Option B only, or
   both? What budget per month for rewards?
8. Rewards store: digital items only (no shipping, no addresses) at the start?
