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

## Server
- Clash Royale results from the official battle log (`GET /players/{tag}/battlelog`):
  find the Friendly Battle against the opponent's tag after `startedAt`. Needs a
  fixed outgoing IP for the API key (Cloud NAT, or a proxy). Planned, not built.
