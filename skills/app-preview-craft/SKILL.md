---
name: app-preview-craft
description: "Creates marketing visuals for an app from its screenshots and screen recordings: App Store and Google Play screenshot sets, social and Open Graph cards, 2D screen videos, 3D device mockup images and 3D device videos (iPhone, Galaxy, MacBook). Renders locally with headless Chrome, three.js, sharp and ffmpeg; 40 themes, every property configurable, plus a live preview studio. Use when the user wants app store or play store screenshots, an app preview or promo video, a phone or device mockup, a 3D phone animation, or a launch/social card for their app. Not for diagrams, slides, or capturing screenshots of a running app."
license: MIT
compatibility: "Needs a shell, Node 20+, npm, and a Chromium-based browser (Chrome, Chromium, Edge, Brave) with WebGL; set CHROME_PATH if it is somewhere unusual. Videos and screen-recording input need ffmpeg (set FFMPEG_PATH if not on PATH). First use runs `npm install` inside the skill (~95 MB: three.js, sharp, puppeteer-core, fonts). Works offline after that. Not usable where there is no shell or browser (claude.ai chat, the Skills API, most CI images without Chrome)."
metadata:
  version: "0.1.0"
---

# app-preview-craft — store screenshots, social cards and 3D device videos

Everything this skill makes is a page (`stage/stage.html`) posed by a theme and captured by
headless Chrome: stills are screenshotted and finished by sharp, videos are rendered frame by
frame and piped into ffmpeg. The same page powers the preview studio, so what the user sees
there is exactly what the CLI exports.

## 0. Find the skill, set it up once

**Paths below are relative to the directory holding this `SKILL.md`.** Resolve it once and
prefix commands with it — `$SKILL` means that directory throughout:

```bash
SKILL=/absolute/path/to/app-preview-craft        # the folder with SKILL.md, scripts/, stage/
# not sure where it was installed? (skill folders, then the Claude Code plugin cache)
find ./.claude/skills ./.agents/skills ~/.claude/skills ~/.agents/skills ~/.gemini/skills \
     ~/.claude/plugins -path '*app-preview-craft*/scripts/cli.mjs' 2>/dev/null | head -1
```

Then check the machine. `--fix` runs `npm install` inside the skill when packages are missing:

```bash
node "$SKILL/scripts/doctor.mjs" --fix
```

Doctor must end with `Ready.` A missing ffmpeg is only a warning (stills still work). If it
reports no WebGL, 3D themes cannot render — say so rather than silently switching to flat
themes.

**Outputs go to the directory the user is working in** (the shell's cwd) unless they name
another folder with `--out`. Never write renders into `$SKILL`. Temp state lives in
`$TMPDIR/app-preview-craft/` and is removed after each run.

## 1. Workflow

1. **Pick the category** (the first CLI argument) from what the user asked for:

   | Category | Makes | Default size |
   |---|---|---|
   | `app-store` | A **set**: one screenshot per slide, per size, plus `overview.png` | `iphone-6.9` 1320×2868 |
   | `social-card` | One card (or `--all` slides) for og/X/LinkedIn/Instagram/story | `og` 1200×630 |
   | `screen-video` | 2D motion from the screens alone; accepts screen recordings | `reel` 1080×1920 |
   | `device-video` | three.js device showcase video | `reel` 1080×1920 |
   | `device-mockup` | 3D hero still, optionally transparent | `mockup-landscape` 2400×1600 |

2. **Gather content.** Screenshots (PNG/JPG/WebP) and/or recordings (MP4/MOV/WebM) from the
   user's project, one per slide, in order. Write the copy yourself unless the user supplied
   it (see §4). With no screens the bundled sample app "Tempo" is used — fine for showing
   themes, never for a deliverable.

3. **Pick a theme.** A theme the user names wins. For App Store sets, match the app's store
   category to the table in §3 and say which theme you chose and why. When the user is
   undecided, show them the options first:

   ```bash
   node "$SKILL/scripts/cli.mjs" gallery app-store        # → ./gallery-app-store.png
   ```

   Read the sheet back (so it renders for the user) and let them choose. The studio (§8) is
   the better answer when they want to browse and tweak visually.

4. **Render.**

   ```bash
   node "$SKILL/scripts/cli.mjs" app-store shots/01.png shots/02.png shots/03.png \
     --theme ledger \
     --title "Every euro, *accounted for*" --title "Budgets that *adapt*" --title "Private *by design*" \
     --subtitle "One-line benefit…" --subtitle "…" --subtitle "…" \
     --size iphone-6.9,ipad-13 --set palette.accent=auto
   ```

5. **Inspect before you report.** Read `overview.png` (sets), the still, or pull frames from a
   video (`--frames 1,4,mid,end` renders PNG frames instead of a video — cheap for checking
   motion). Look for clipped headlines, text over the device, a device covering decor, empty
   screens. Fix with `--set`/per-slide overrides and re-render.

6. **Report** the output paths, the theme and size, and — whenever a 3D device appears — that
   `CREDITS.txt` was written and that the CC-BY credit must travel with the images (§7).

## 2. Sizes

`node "$SKILL/scripts/cli.mjs" list sizes --category app-store` prints the table. Any `WxH`
works too. Several at once: `--size iphone-6.9,iphone-6.5,ipad-13`.

- **App Store Connect** requires the 6.9" set (`iphone-6.9`) for iPhone apps and `ipad-13`
  for iPad apps; other sizes are optional. PNG output is flattened (Apple rejects alpha).
- **Tablet sizes** automatically swap the phone for a flat tablet frame unless the theme is
  frameless. Give iPad screenshots for those slides when the app has them.
- **App preview videos**: `--size app-preview` (886×1920) or `app-preview-ipad`, 15–30 s,
  30 fps. A silent stereo AAC track is added automatically (Connect expects audio).
- **Google Play**: `play-phone`, `play-tablet`, and `play-feature` (1024×500, social-card).

## 3. Themes

`list themes --category <c>` prints these with their layouts. Every category has ≥ 5.

### app-store — each modelled on a popular app category

| Theme | App category | Inspired by | Look |
|---|---|---|---|
| `stride` | Health & Fitness | Strava, Nike Run Club | hot orange, condensed all-caps pills, speed stripes, angled phone |
| `ledger` | Finance | Revolut, Monzo, Robinhood | midnight mesh, mint→cyan gradient words, chrome orbs |
| `serene` | Health & Mindfulness | Calm, Headspace | pastel aurora, italic serif accents, frameless screen on a soft blob |
| `canvas` | Productivity | Notion, Things, Linear | warm paper, notebook grid, big serif, flat ink phone |
| `sizzle` | Food & Drink | DoorDash, Uber Eats, Deliveroo | sunny yellow, polka dots, red marker highlights, tilted phone |
| `wander` | Travel | Airbnb, Hopper, Booking | dusk gradient with a retro sun that runs across the whole set (panorama) |
| `mixtape` | Music & Audio | Spotify, Apple Music | your screen blurred into a glowing backdrop, giant outlined word |
| `arcade` | Games | Apple Arcade, mobile game launch art | synthwave grid, neon rims, glossy 3D toys |
| `snapshot` | Photo & Social | Instagram, BeReal, VSCO | three frameless shots fanned like prints, warm film mesh |
| `pulse` | Health data & Wearables | Oura, WHOOP, Apple Health | clinical black, crimson glow, headline below a front-facing Pro Max |

The themes borrow a mood, never a brand: no logos, names or artwork of those apps appear.

### social-card
`launch` (aurora + tilted phone), `spotlight` (beam + mirror floor), `pastel-fan` (three
fanned screens), `bento` (grid of screen crops), `neon-grid` (synthwave), `editorial` (paper,
serif, duotone screen), `duo` (MacBook + phone — pass a `desktop` screen for the laptop).

### screen-video (2D)
`carousel`, `stack` (cards flick away), `scroll` (long captures scroll inside the phone),
`zoom-tour` (full-bleed Ken Burns to each slide's `focus`), `wall` (tilted wall of screens),
`store-preview` (App Store preview style — use `--size app-preview`), `grid-reveal`.

### device-video (3D)
`turntable`, `orbit` (camera arcs), `float` (loopable), `rise` (camera pushes in), `flip`
(back → front reveal), `trio` (three models fan out), `desk` (MacBook lid opens, phone slides
in), `spotlight` (360° on a mirror), `synthwave`.

### device-mockup (3D stills)
`studio`, `noir`, `pedestal`, `levitate`, `lineup` (every phone model), `flatlay`,
`desk-duo`. Add `--transparent` for a cut-out PNG.

## 4. Copy

- Headline per slide: ≤ 6 words, a benefit not a feature. Wrap 1–2 words in `*asterisks*` to
  highlight them in the theme's style; `" | "` forces a line break.
- Subtitle: one short sentence. Kicker (optional): one word label above.
- First two slides carry the pitch — most shoppers never scroll further.
- Never invent ratings, download counts, awards or press quotes. Decor such as `rating` and
  `laurels` is for real figures the user gives you; ask when unsure.
- Don't name competitors or use Apple/Google trademarks in copy beyond what store guidelines allow.

## 5. Configuring anything

Resolution order, later wins:
**built-in base → layout defaults → theme (and its `extends` chain) → custom theme file →
project config `themeOverrides` → CLI shortcuts → `--set` → per-slide `theme`**.

- Shortcuts: `--layout --device --finish --pose --font --body-font --bg --bg2 --bg3 --ink
  --sub --accent --accent2 --background --pattern --background-image --clean-status-bar
  --no-decor --duration --fps --speed --intro --outro`.
- `--set path=value` reaches **any** theme key (repeatable). `list options` prints the
  documented paths with types and ranges. Values are coerced; JSON works for lists/objects:
  `--set device.pose=6,-24,9 --set 'decor=[{"kind":"sparkles","count":8}]'`.
- Colors accept `auto` = the most vivid color in the first screenshot: `--accent auto`.
- `--device iphone-17-pro | iphone-17-pro-max | iphone-12-pro | galaxy-s21-ultra |
  macbook-pro-16 | flat[:phone|phone-android|tablet|browser] | frameless | none`.
- Layouts are interchangeable within a kind (`list layouts`): stills — `hero-top`,
  `hero-bottom`, `tilt`, `duo`, `fan`, `split`, `big-type`, `callout`, `bento`,
  `laptop-phone`, `showcase`, `pedestal`, `lineup`, `flatlay`; videos — `carousel`, `stack`,
  `scroll`, `zoom-tour`, `wall`, `phone-swap`, `grid-reveal`, `turntable`, `orbit`, `float`,
  `rise`, `flip`, `trio`, `desk`, `spotlight`.

**Custom themes** are JSON (or `.mjs`) files with any subset of theme keys plus `extends`:

```json
{ "extends": "app-store/ledger", "name": "Acme", "palette": { "accent": "#ff5a1f" },
  "type": { "display": "bricolage", "weight": 800 }, "device": { "finish": "#1c1f24" } }
```

Pass `--theme path/to/acme.json`, or drop it in `./.app-preview-craft/themes/` (or
`~/.app-preview-craft/themes/`) and use `--theme acme`. `list themes` shows custom ones.

**Project config.** `node "$SKILL/scripts/cli.mjs" init app-store` writes `app-preview-craft.json`;
afterwards `node "$SKILL/scripts/cli.mjs"` (no arguments) renders it, and flags still
override it. `$SKILL/examples/app-preview-craft.json` is a complete, working example: per-slide
copy, decor and theme overrides, a custom theme file, a desktop screen, and a `jobs` list
that renders an App Store set, a social card, a mockup and a video in one command. Paths in a
config resolve relative to the config file.

Per-slide keys: `screen`, `desktop` (laptop display), `title`, `subtitle`, `kicker`,
`theme` (overrides for that slide only), `decor` (replaces the theme's decor for that slide),
`focus: [x, y, zoom]` (zoom-tour target), `hold` (seconds in a video), `trim: [start, end]`
and `at` (which second of a recording a still uses), `bigWord` (big-type layout).

**Decor** items are `{kind, x, y, scale, rotate, style, layer, delay, …}` with x/y as page
fractions and `style` one of `glass | solid | light | dark | outline`:

| kind | extra keys |
|---|---|
| `badge` | `text`, `icon` (star bolt heart check sparkle trophy leaf lock music pin flame bell chart shield globe play) |
| `rating` | `score`, `label`, `starColor` |
| `laurels` | `top`, `text`, `bottom` |
| `chips` | `items[]`, `icons[]`, `width`, `lead` |
| `notification` | `app`, `title`, `body`, `time`, `icon` (image path) or `glyph`, `width` |
| `stat` | `label`, `value`, `trend`, `trendColor` |
| `callout` | `rect: [x, y, w, h]` of the screenshot to magnify, `w`, `border`, `radius` |
| `arrow` | `w`, `h`, `text` (handwritten note), `flip`, `stroke` |
| `logo` | `name`, `src` (app icon path) |
| `store-badge` | `top`, `text`, or `src` for the official badge artwork |
| `sparkles` `confetti` | `count`, `colors[]`, `area: [x0, y0, x1, y1]`, `seed` |
| `blob` | `size`, `color`, `opacity` (sits behind the device) |
| `orbs` `rings` `shapes` | 3D primitives: `count`, `shapes[]`, `finish` (glossy chrome matte glass iridescent), `area`, `items[]` |
| `credit` | `text` (defaults to the model credit line) |

## 6. Screens and treatments

- sharp prepares every screenshot before Chrome starts: `screen.cleanStatusBar` (redraws a
  9:41 / full-battery iOS status bar — phone-shaped captures only), `tint` + `tintAmount`,
  `duotone: "#dark,#light"`, `saturate`, `brightness`, `sharpen`, and a pre-blurred backdrop
  for `blur-shot` backgrounds.
- On iPhone models the **Dynamic Island** is drawn as one merged black pill over the model's
  pill-and-camera cutouts, matching what iOS shows. Supply screenshots with the island area
  clear (any normal iOS capture is); `cleanStatusBar` keeps the time and icons either side.
- A capture taller than the display **scrolls** in videos (`scroll` theme) and shows its top
  in stills (`screen.fit=top`).
- Recordings are split into frames by ffmpeg at the output frame rate; in videos each
  recording's slide lasts as long as the clip (override with `hold`, cut with `trim`). Stills
  use one frame (`at`, default: the middle).
- Laptop displays letterbox a phone screenshot over a blurred copy unless the slide has a
  `desktop` screen.

## 7. 3D models and credits — required

The device models are **CC-BY-4.0** (authors: Ranguel, MajdyModels, DatSketch, jackbaeten;
see `assets/CREDITS.md`). Whenever a render shows one, the CLI writes `CREDITS.txt` beside
the output and embeds the credit in video metadata and PNG EXIF. Tell the user the credit has
to accompany published images (a line in the store description, the site footer, or the post).
Never delete or edit `CREDITS.txt` to hide it. Flat and frameless themes use no models and
write no credits.

`scripts/models.mjs --from <folder>` re-imports the source GLBs (WebP textures + meshopt
geometry, credits read from each file's metadata).

## 8. The studio

```bash
node "$SKILL/scripts/cli.mjs" studio            # opens http://127.0.0.1:4747/studio/
```

A preview-first editor on localhost, run from the user's project folder: category tabs, the
live previews (real WebGL), a theme dock, drag-and-drop screenshots/recordings, click-to-edit
headlines on the preview, drag a 3D device to turn it, a Customize panel generated from the
same schema as `--set`, export with progress, "Save as theme", "Save app-preview-craft.json", and
"Copy command" (the exact CLI call). Uploads are saved to `./.app-preview-craft/uploads/`; exports
go to the folder the studio was started in. Suggest it when the user wants to explore looks;
run it in the background and give them the URL.

## 9. Useful commands

```bash
node "$SKILL/scripts/cli.mjs" --help
node "$SKILL/scripts/cli.mjs" list [categories|themes|sizes|devices|fonts|layouts|options]
node "$SKILL/scripts/cli.mjs" social-card shot.png --theme launch --size og,x-post,story --title "Meet *Acme*"
node "$SKILL/scripts/cli.mjs" device-video a.png b.png demo.mov --theme desk --duration 12 --format mp4
node "$SKILL/scripts/cli.mjs" screen-video flow.mp4 --theme store-preview --size app-preview
node "$SKILL/scripts/cli.mjs" device-mockup home.png --theme noir --transparent --size 3000x2000
node "$SKILL/scripts/cli.mjs" device-video … --frames 0.5,3,mid     # PNG frames to check motion
node "$SKILL/scripts/cli.mjs" app-store … --dry-run                 # print the resolved spec
node "$SKILL/scripts/selftest.mjs" --quick                          # after changing scripts/ or stage/
```

Video formats: `mp4` (H.264, BT.709, faststart), `hevc`, `mov` (ProRes 4444, keeps alpha with
`--transparent`), `webm` (VP9, alpha), `gif`. Add music with `--audio track.mp3` (faded out at
the end). Rendering speed on an Apple-silicon GPU is roughly 15–20 frames per second at 1080p.

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `No Chromium-based browser found` | Install Chrome or set `CHROME_PATH`. |
| Doctor says SwiftShader | 3D works but slowly; lower `--fps`, `--duration` or size. |
| Headline clipped or crowding the device | `--set text.width=0.8`, `--set type.size=0.85`, `--set device.y=0.7`, or a per-slide `theme`. |
| Device covers decor | Move the decor (`x`, `y`) or set `"layer": "front"`. |
| Screenshot cropped oddly | Aspect differs from the device; supply a matching capture or use `--device frameless`. |
| `layout X makes a video, but … is a still category` | Pick a layout of the right kind (`list layouts`). |
| Laptop shows a letterboxed phone screen | Add `"desktop": "web.png"` to that slide. |
| Video too fast with many slides | The CLI warns; raise `--duration` or give slides `hold`. |
