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
- `src/constants/games.ts` – the supported games and their tile colours.
- `src/app/(auth)/` – Sign up and Log in, shown only when signed out.
- `src/app/complete-profile.tsx` – shown if someone is signed in but has no profile yet.
- `src/auth/` – sign-in state (`AuthProvider`), form checks and plain error messages.
- `src/firebase/` – Firebase app, Auth and Firestore setup.
- `src/wallet/` – live, read-only wallet and ledger data, credit formatting and labels.
- `functions/` – Cloud Functions (TypeScript, Functions v2, Node 22, region `europe-west1`).
  `onUserCreated` gives the 10 starter credits once (`ledger/grant_{uid}` + `wallets/{uid}`).
- `firestore.rules`, `firestore.indexes.json` – security rules and indexes.
- `firebase.json`, `.firebaserc` – Firebase project config (`betterplayer-beta`).
- `deploy.sh` – deploys functions, rules and indexes. The owner runs `./deploy.sh`
  from Google Cloud Shell. Nothing is deployed automatically.
- `top-up.sh` – one-time top-up of starter credits for players who signed up before
  the Cloud Function existed. `./top-up.sh` previews, `./top-up.sh --apply` grants.
  Safe to re-run (uses the same idempotent `grantStarterCredits`).
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
- `wallets/{uid}`: `available`, `locked`, `updatedAt`. Owner can read; nobody writes
  from the app.
- Every Cloud Function that moves credits must be idempotent (safe to run twice)
  and write the ledger entry and wallet change in one transaction.

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
