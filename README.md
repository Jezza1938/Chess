# Chess

A chess game that runs fully offline on an iPad (or any phone, tablet or computer).

- **Play vs Bot**: 10 difficulty levels, from complete beginner to full Stockfish strength
- **2 Players**: pass-and-play on one device with a real tap clock. Move, then tap your clock
- **Editable timers**: presets from 1 to 60 minutes, custom minutes, seconds added per move,
  different time for each player, or no clock. Bot games and 2-player games remember their own settings
- **10 boards and 10 piece sets**
- Legal-move dots, hints, undo, flip board, pause, resign, draw, move list, captured pieces,
  sounds, and auto-save so a game survives closing the app
- Face-to-face mode turns Black's pieces around for the player sitting across the table

## Put it on your iPad

You need internet only once, for the first download.

1. On the GitHub website, make this repository **public**: *Settings → General → Danger Zone → Change visibility → Public*.
2. Turn on GitHub Pages: *Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/ (root)` → Save*.
   After a minute or two the page shows your link, like `https://jezza1938.github.io/Chess/`.
3. On the iPad, open that link in **Safari**.
4. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
5. Open **Chess** from the home screen once while still online. When the home screen says
   *"Saved for offline play ✓"*, it is fully stored on the iPad.

From then on it works with no internet, including in airplane mode.
If you change the app later, open it once while online and it updates itself.

## How it works

It is a plain web app (HTML, CSS and JavaScript) with no server and no build step.
A *service worker* (`sw.js`) saves every file on the device, so it opens offline like a normal app.

| Part | What it does |
|---|---|
| [chess.js](https://github.com/jhlywa/chess.js) | All the rules: legal moves, check, checkmate, castling, en passant, promotion, draws |
| [Chessground](https://github.com/lichess-org/chessground) | The board (the one lichess.org uses): tap or drag to move, animations |
| [Stockfish 19 lite](https://github.com/nmrugg/stockfish.js) | The bot. A 1.8 MB WebAssembly engine running in a background thread |
| `js/levels.js` | The 10 bot levels (engine skill, search depth, think time, and random mistakes for the low levels) |
| `js/clock.js` | The chess clock: increments, pause, flag |
| `js/rules.js` | Game-over rules on top of chess.js, including "out of time but the opponent can't mate = draw" |
| `js/app.js` | Screens, settings and game flow |

## Making changes

After editing any app file, regenerate the offline file list so devices pick up the change:

```
python3 tools/build_sw.py
```

Other tools: `tools/gen_themes.py` rebuilds `css/themes.css` and board thumbnails;
`tools/make_icons.mjs` rebuilds the home-screen icons.

### Tests

```
node tests/unit.mjs                     # rules and clock
python3 -m http.server 8123 &           # then, in another terminal:
node tests/e2e.cjs /tmp/shots           # full app in a simulated iPad (needs Playwright)
node tests/level-match.mjs 4 10         # plays level 5 vs level 4, 10 games
```

## Credits and licence

Artwork, sounds and libraries are by others; see [CREDITS.md](CREDITS.md).
Because the board and the engine are GPL-3.0, this app's own code is also GPL-3.0 (see `LICENSE`).
