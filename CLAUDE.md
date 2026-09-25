# Betterplayer

Betterplayer lets gamers enter their own online matches for credits.
The beta is a **closed beta, credits only**: no real money anywhere.
Players must be **18+** and in **Spain**.

## Who you are working with

- The owner is a beginner and works **from an iPhone only**.
- Explain every change in plain words: what changed, why, and what they will see.
  Avoid jargon; when a technical word is needed, say what it means.
- They preview the app on the web (GitHub Pages), not in Xcode. Every change must
  keep `npx expo export -p web` working.

## Money rules (never break these)

1. **The client never writes credits, matches or disputes.** Only Cloud Functions
   do. The app may read them and may call Cloud Functions, nothing more.
2. **The ledger is append-only.** Entries are never edited or deleted; mistakes
   are fixed with a new correcting entry.
3. **Balances are computed from the ledger**, never stored as an editable number.
   `wallets/{uid}` (`available`, `locked`) is a read-only summary that Cloud
   Functions update in the **same transaction** as the ledger entry it reflects.
4. **No secrets in the app.** Anything in the app ships to every user. The Firebase
   web config in `src/firebase/config.ts` is public by design; API keys for other
   services, admin credentials and service accounts belong in Cloud Functions.

## Game rules

- Games:
  - **EA FC**: 1v1. Draws are decided on penalties, so there is always a winner.
  - **Warzone Rebirth**: 2–4 players.
  - **Fortnite**: 2–4 players.
  - **Clash Royale**: 1v1.
- Every player gets **10 starter credits, once**.
- Entry is **fixed at 2 credits** per player.
- Betterplayer always takes a **20% fee of the whole pot** (all entries added
  together), whatever the number of players. It is simulated: credits only, no money.
  - 1v1: pot 4 credits, fee 0.80, the winner gets 3.20.
  - 3 players: pot 6 credits, fee 1.20, the winner gets 4.80.
  - 4 players: pot 8 credits, fee 1.60, the winner gets 6.40.
- **Winner takes all:** in every game the single winner gets the whole 80% left
  after the fee. Nobody else in the match gets credits back.
- A player can play **at most 10 matches per day**.
- **A Betterplayer admin validates every match before any credits move.**
  Until then the match shows as "awaiting result".

## Words in the app

- **No cash words.** Never show "cashout", "stakes", "bet" (or similar, like
  "wager", "gamble", "payout", "odds") anywhere in the app. Say "credits",
  "entry", "match", "win" instead.
- **No game publisher logos or artwork.** Show games as their name on a coloured
  tile (`src/components/GameTile.tsx`, games listed in `src/constants/games.ts`).

## Project layout

- `src/app/` – screens (Expo Router). `(tabs)/` holds Home (`index`), Matches,
  Create (the raised round + button), Wallet and Profile.
- `src/components/` – shared UI: header, cards, buttons, empty states, game tiles.
- `src/constants/theme.ts` – colors and fonts. Use these, don't hard-code colors.
- `functions/src/shared/games.ts` – **the one place for game and credit rules**
  (players, format, rules text, needed game ID, entry, fee, payout, limits). Used by
  the Cloud Functions and by the app (imported as `@shared/games`). Keep it import-free.
- `src/constants/games.ts` – adds tile colours to the shared game config.
- `src/app/(auth)/` – Sign up and Log in, shown only when signed out.
- `src/app/complete-profile.tsx` – shown if someone is signed in but has no profile yet.
- `src/auth/` – sign-in state (`AuthProvider`), form checks and plain error messages.
- `src/firebase/` – Firebase app, Auth and Firestore setup.
- `src/wallet/` – live, read-only wallet and ledger data, credit formatting and labels.
- `src/matches/` – match types, live Firestore hooks, and `api.ts` (the only way the
  app changes matches: callable Cloud Functions). `src/app/match.tsx` is the Match
  room (`/match?id=…`; a query parameter so it works as a static page on GitHub Pages).
- `functions/` – Cloud Functions (TypeScript, Functions v2, Node 22, region `europe-west1`).
  `onUserCreated` gives the 10 starter credits once (`ledger/grant_{uid}` + `wallets/{uid}`).
- `firestore.rules`, `firestore.indexes.json` – security rules and indexes.
- `storage.rules` – Firebase Storage rules for result screenshots.
- `firebase.json`, `.firebaserc` – Firebase project config (`betterplayer-beta`).
- `.github/workflows/firebase-deploy.yml` – **the normal way to deploy Firebase**: on
  every push to `main` that touches `functions/`, rules, indexes or Firebase config
  (or "Run workflow" in the Actions tab), deploys functions, Firestore rules and
  indexes and Storage rules with `--non-interactive --force`. It also grants the
  Storage service agent `roles/firebaserules.firestoreServiceAgent` (the CLI skips
  that question when unattended). Uses the repository secret `GCP_SA_KEY` = JSON key
  of the service account `github-deploy` (roles: Editor, Firebase Admin, Cloud Run
  Admin, Project IAM Admin, Service Account User). No secret → the job is skipped.
- `deploy.sh` – fallback from Cloud Shell. Wakes Cloud Shell's Google credentials (`gcloud auth print-access-token`;
  a new session may show an in-shell "Authorize" box), installs the functions
  dependencies and runs `firebase deploy --only
  functions,firestore:rules,firestore:indexes,storage --project betterplayer-beta`. **No
  `firebase login`**: Cloud Shell's own Google credentials are enough, and the login
  link can't complete on the owner's iPhone. Nothing is deployed automatically.
  The owner pastes this in Google Cloud Shell (keep it to one command; Cloud Shell
  disconnects when switching apps):
  `cd ~ && ( [ -d betterplayer-app ] || git clone https://github.com/BetterPlayer23/betterplayer-app.git ) && cd betterplayer-app && git pull -q && ./deploy.sh`
- `top-up.sh` – starter credits for players who signed up before the Cloud Function
  existed. Not run by `deploy.sh`. `./top-up.sh` previews, `./top-up.sh --apply` grants. Safe to re-run
  (uses the same idempotent `grantStarterCredits`).
- `.github/workflows/web-preview.yml` – publishes the web preview on every push to `main`.

## Accounts

- Email and password sign-in (Firebase Auth). Users stay signed in.
- The tabs are only reachable when signed in (`Stack.Protected` in `src/app/_layout.tsx`).
- `users/{uid}` holds: `gamerTag`, `platform` (`pc`, `playstation`, `xbox`, `mobile`),
  `ageConfirmed: true`, `ageConfirmedAt`, `country: "ES"` (self-declared), `gameIds`
  (`eaId`, `activisionId`, `epicName`, `clashRoyaleTag`), `createdAt`.
- **Never put credits or reputation in `users/{uid}`**: they are server-only.
- The app may only change `gamerTag` and `gameIds` after sign-up.
- Gamer tag: 3–20 letters, numbers or underscores. Password: at least 8 characters.

## Credits data

- `ledger/{entryId}`: `uid`, `type`, `amount`, `description`, `createdAt`. Players
  read only their own entries; nobody writes from the app. The starter grant's ID
  is `grant_{uid}`, which is what makes it impossible to grant twice.
- Ledger types and their effect on the wallet (settlement entries also store
  `availableDelta` / `lockedDelta`, so every wallet can be rebuilt from the ledger):
  - `starter_grant` (`grant_{uid}`): available +10.
  - `stake_lock` (`lock_{matchId}_{uid}`): available −2, locked +2.
  - `winnings` (`settle_{matchId}_{uid}`): available + (pot − 20% fee), locked −2.
  - `stake_lost` (`settle_…`): locked −2 (the entry went into the pot).
  - `refund` (`settle_…`, admin cancel): available +2, locked −2.
  - `stake_returned`: label only for now ("Entry returned"); nothing writes it yet.
- App labels: "Starter credits", "Entry locked: [game] match", "Winnings",
  "Entry lost", "Entry returned", "Refund". Never "stake" on screen.
- `platform_ledger/{matchId}`: the 20% fee per completed match (server-only).
- `wallets/{uid}`: `available`, `locked`, `updatedAt`. Owner can read; nobody writes
  from the app.
- Every Cloud Function that moves credits must be idempotent (safe to run twice)
  and write the ledger entry and wallet change in one transaction.

## Matches

- Lifecycle: `open` → `full` → `started` → `awaiting_result` → `under_review` →
  `completed`, or `cancelled`. Round A covers open → started; round B (results,
  review, settlement) covers the rest.
- All match changes go through callable Cloud Functions in `europe-west1`
  (`functions/src/matches/actions.ts`): `createMatch`, `joinMatch` (by id or share
  code), `leaveMatch`, `setLobbyCode`, `startMatch`, `cancelMatch`, plus the scheduled
  `expireOpenMatches` (every 5 min, cancels open matches after 15 minutes).
- Create/join need a profile with the game's ID, at least 2 available credits, and
  fewer than 10 matches created or joined today (Europe/Madrid, `dailyCounts/{uid}_{day}`).
- Share codes: 6 characters without 0/O/1/I, reserved in `matchCodes/{code}`.
- `startMatch` locks 2 credits per player in one transaction: ledger
  `lock_{matchId}_{uid}` (type `stake_lock`, amount 2) and wallet available → locked.
  Idempotent. If any player is short, nothing is locked.
- Signed-in players can read `matches`; nobody writes them from the app.
  `dailyCounts` and `matchCodes` are server-only (closed by the catch-all).
- The internal type name is `stake_lock`, but the app shows it as
  **"Entry locked: [game] match"** (no cash words on screen).
- Callable errors: the Firebase library appends " [400]"-style codes to messages;
  always show them through `matchError()` in `src/matches/api.ts`.

## Results and review (round B)

- Flow: `started` → a player reports (`submitResult`) → `awaiting_result` with
  `responseDeadline` = +30 min → the other players `confirmResult` or
  `disputeResult` → `under_review` (`disputed` true/false) → an admin decides
  (`adminDecide`) → `completed` or `cancelled` (settled).
- Only ONE report per match (the first player to report; no edits). The others
  confirm or dispute. All others confirmed, or any dispute → `under_review`.
  `closeResponseWindows` (every 5 min) moves `awaiting_result` past the deadline to
  `under_review` with `disputed: false` (silence counts as confirmation).
- Reports: `matches/{id}/reports/{uid}`; disputes: `matches/{id}/disputes/{uid}`.
  Readable by players of that match and admins; written only by functions.
- Score checks live in `checkResult` in `functions/src/shared/games.ts` (used by the
  app form and the server): EA FC goals (+ penalties only when level, never level),
  Clash Royale crowns 0–3 (no level results), Warzone/Fortnite distinct placements
  (1 = best). The winner must match the score.
- Screenshots: Storage `results/{matchId}/{uid}/{file}`. A player of a started or
  awaiting match uploads into their own folder only; jpeg/png/webp/heic, ≤ 10 MB;
  never overwritten or deleted (`resource == null` on create). Players of the match
  and admins can read. Functions check the file exists and is in the caller's folder.
- Admins: a document at `admins/{uid}`, created by hand in the Firebase console.
  The Admin tab shows only for them. `adminDecide(decision, winnerUid?, note)`:
  `approve` (reported winner), `override` (another player), `cancel_refund`.
  Note required (3–500 chars). Writes `admin_reviews/{matchId}`.
- Settlement is one idempotent transaction in `functions/src/matches/admin.ts`.
- Reputation `reputation/{uid}` {points, matchesCompleted, disputesLost}, server-only,
  owner-readable: +1 per completed match; −5 (and disputesLost +1) when your report
  is overridden or your dispute is rejected. Cancel & refund changes nothing.

## Look and feel

Dark theme only.

- Background dark navy `#070B16`; cards `#0E1628` with thin blue borders `#1C2A4A`.
- Electric blue `#1E6BFF` for primary actions, with a soft glow.
- Cyan `#29B6FF` accent.
- Green `#22C55E` for Join and success.
- Yellow `#FACC15` for "awaiting result".
- Red `#EF4444` for errors and full matches.
- Text `#F5F7FF`, muted text `#8A97B5`.
- Fonts: Exo 2 bold italic for the logo and headings, Inter for body text.
- Every screen has the header: "Betterplayer" logo, outlined "CLOSED BETA" badge,
  and "18+ · Spain only".

## Before finishing a change

```bash
npx tsc --noEmit            # typecheck
npx expo export -p web      # must build without errors
npm --prefix functions run build   # if functions/ changed
```

@AGENTS.md
