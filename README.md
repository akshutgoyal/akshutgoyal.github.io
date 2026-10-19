# Portfolio — Akshut Goyal

A scroll-driven 3D portfolio. The page *is* the camera track: every section owns a
framing, and scrolling flies you between them, through a corridor of project
panels, past a node graph, around a stack ring, and out over the floor of the world.

Everything in the 3D scene is generated at runtime — no GLB, no HDR, no textures
off the wire. The only network requests are two self-hosted woff2 fonts.

```
npm install
npm run dev        # http://localhost:5180
npm run build      # → dist/
npm run preview    # serves dist/ on :4173
```

Port **5180** on purpose: `5173` belongs to another project on this machine
(`vite.config.js` sets it, and Vite will still walk up if the port is busy).

## Publishing

The source lives in `akshutgoyal/akshutgoyal.github.io`. Pushing to `main` runs
`.github/workflows/deploy.yml`: Node.js 22 installs the lockfile with `npm ci`,
builds Vite, and deploys only `dist/` to GitHub Pages. Build output and
`node_modules/` stay out of Git. The existing Google verification tag is retained.

---

## Stack

| Piece | Why |
| --- | --- |
| **Vite 8** | Instant dev server, ES-module native, one config file. |
| **three 0.186** | The scene. `EffectComposer → RenderPass → UnrealBloom → OutputPass` for the glow, `SRGBColorSpace` art, `ACESFilmic` tone mapping. |
| **GSAP 3.15** | The preloader timeline and the DOM reveals (`gsap.ticker` drives the single rAF loop for the whole site). |
| **Lenis 1.3** | Smooth scroll. Scroll becomes camera progress, so smoothing happens once, in one place. |

No React, no bundler plugins, no CSS framework — around 3.7k lines of hand-written
JS/CSS in total, and the whole `dist/` is ~810 kB before gzip (three is 566 kB of
that, 140 kB gzipped; the app itself is 61 kB).

The look is procedural and lightless: there are no lights in the scene at all. Every
object is an unlit `ShaderMaterial` — additive or fresnel — hanging in front of a
deep-space dome (a near-black gradient, two faint nebula pools, and a starfield
welded to the sphere so it never parallaxes, which is what makes it read as
infinitely far away next to the dust drifting past the camera). The dome fills the
screen, so its hashes are deliberately sin-free.

---

## The camera: authoring `data-camera`

Camera poses live in the markup, on whatever element should own that framing:

```html
<article class="work" data-camera='{"pos":[-1.8,0.4,-32.5],"target":[1.05,0.1,-46],"fov":36,"roll":-0.02}'>
```

`CameraRig.buildFromDOM()` reads every `[data-camera]` in document order, converts
each element's **vertical midpoint** into a page-scroll progress value (0 = top of
the page, 1 = bottom), and then flies the camera along that polyline. Scroll
progress between two stations is eased (`inOut` by default, `"ease":"linear"` to
opt out) and damped, with a leash (`maxLead`) so a fast flick never loses the
camera or snaps it. Three layers stack on top of the station pose:

1. **scroll** — position / target / fov / roll along the polyline
2. **pointer** — a small damped parallax (±0.62 × ±0.42 world units)
3. **intro** — a one-shot dolly that plays when the preloader hands over

Because the anchors are page positions, they are re-measured on resize,
`ScrollTrigger` refresh and `document.fonts.ready` — and a re-measure
*re-anchors* (snaps to the current progress) instead of replaying the flight
from the hero. Opening a deep link (a `#hash`, or a restored scroll position)
lands with `rig.snap()` for the same reason.

### Framing rule: fit the width

Stations are authored against a **1.6 aspect viewport** (`REF_ASPECT`), and the
composition is horizontal — copy on one side, a 3D panel on the other. So the rig
fits the *width*: on a landscape window the station's fov is multiplied by
`clamp(1.6 / aspect, 0.7, 1.35)`, which keeps the horizontal framing (and therefore
the pixel size of every panel) identical on a 1280×800 laptop, a 2560×1080
ultrawide and a 4:3 window; taller screens just reveal more floor and ceiling.

### Portrait is a different composition, not a smaller one

Below `aspect < 0.95` the copy can no longer sit beside the 3D subject, so any
station may carry a `portrait` pose that overrides just the pose fields:

```html
data-camera='{"pos":[0,0.45,9.2],"target":[0,0.1,0],"fov":42,"roll":0,
              "portrait":{"pos":[0,0.35,20],"target":[0,-2,0],"fov":42,"roll":0}}'
```

In portrait the CSS puts the copy at the bottom of each work row and the card up
top, which is what those poses frame. All 15 stations have one.

### Stations

| # | Element | Framing |
| --- | --- | --- |
| 1 | `#hero` | orb at the origin, camera 9.2 units out |
| 2 | `#about` | swings left/back into the node graph at `(-11, 0.4, -24)` |
| 3 | `#work` | down the corridor throat, both walls hinted |
| 4–11 | `.work[data-project]` | slalom past the eight project panels, alternating walls |
| 12 | `#archive` | the corridor's tail, the stack ring coming up ahead |
| 13 | `#playground` | the stack ring at `z = -228` |
| 14 | `#contact` | high and long, stars behind |

---

## The corridor

The eight project cards are one `PlaneGeometry` each (7 × 3.94 world units, 16:9),
alternating `x = ±4.9`, spaced 16 units apart in `z` from `z = -46`, each rotated
~10° toward the flight path. Their artwork is a canvas texture drawn from
`site.config.js` (`projectPanelTexture.js`): index, category, title, summary, stack
chips, project highlights, and source availability. The canvas is
drawn at roughly the size it is displayed at — eight full-size 1600×900 canvases
plus mipmaps is a lot of VRAM for art that is never shown that large.

`ProjectNavigator` adds a sticky project picker with previous/next controls and
saved project links. In portrait layouts or at widths up to 900px,
`ProjectPreviews` reuses the panel canvases in document flow above the copy and
hides the floating meshes. This keeps the same artwork without overlapping text.
The toolkit uses native expandable groups; opening one refreshes the scroll and
camera measurements. With reduced motion, idle scene time is frozen and GPU
redraws stop after the scene settles.

Past the last panel (index 7, `z = -158`) the corridor gives way to the **archive**:
a DOM-only list of earlier builds and experiments, which have no 3D panel. The camera keeps
flying while it is read, so the ring is already glowing by the time the stack
section arrives.

The material adds a shader-drawn frame, a proximity glow and a reveal wipe on top
of the texture. Two details worth keeping:

* the edge treatment is measured in **world units** (via `uHalf`), not UV, or the
  glow is ~1.8× wider across the panel's width than its height;
* the additive coefficients are small on purpose — the card's background is nearly
  black, so a "10%" accent addition is the difference between a frame and a green
  wash. Hover lift is multiplicative so it can't wash out the dark areas.

Hover is raycast once every third frame, disabled while a DOM `.work` row is under
the cursor (the DOM wins), and mirrored to the DOM via `onHover` so the row and
its panel light up together.

---

## The preloader ("the dash")

Four beats, one GSAP timeline:

1. **IN** — letters dash in from the left out of motion streaks, and the mark
   overshoots then settles. The word is split and stacked below its own line
   by a small inline script in the markup (not by the module), so the first
   paint is never the letters sitting at rest.
2. **LOAD** — the counter climbs, the rail fills, a dash shuttle runs the rail and
   the status text cycles. One bounded, monotonic animation eases toward real
   asset progress. Slow requests can pause progress; readiness never jumps it.
   The rail uses a compositor transform rather than changing layout width.
3. **READY** — the same animation finishes at 100 after all tracked work settles.
4. **PART** — letters dash off to the right, then six dark blinds drop to uncover
   the site, without a white flash or counter scaling.

The hand-off is gated on `tracker.done` (fonts loaded, first GPU frame rendered,
`window.load`). Scene modules load after the loader paints, and shaders are
precompiled asynchronously before the first rendered frame. If anything
throws, or `window.__portfolioBooted` never gets set, an 8 s watchdog in
`index.html` lifts the preloader and reveals the page.

Theme previews use `?theme=cyan`, `?theme=violet`, or `?theme=rose`; the default
remains lime. CSS accents, loader colors and global 3D colors share each palette.

---

## Robustness, tiers and overrides

* `?tier=low` / `?tier=high` — force a quality tier. `low` (phones, small screens,
  weak CPUs) drops bloom, halves particle counts, caps `devicePixelRatio` at 1.5.
* `?motion=off` — the reduced-motion path (also honoured from
  `prefers-reduced-motion`): no parallax, no idle drift, instant damping, a quiet
  two-beat preloader, CSS animations neutralised.
* **Auto-degrade** — if the measured frame rate stays under ~40 fps, bloom is
  switched off at runtime.
* **Judge the look at the tier you ship.** Grain and bloom exist only on the high
  tier, and both can undo a black background if left alone: the grain is an
  `overlay` blend precisely so it textures midtones without lifting black to grey,
  and bloom's threshold stays high (0.94) so grid lines and dust don't smear into
  haze. Screenshotting only `?tier=low` hides both paths — the numbers for one
  station were mean luminance 23.6 / 38.8% near-black at high tier against 44.8 /
  0.6% before that was fixed, i.e. a visibly washed-out scene nobody saw in `low`.
* **No WebGL** — `html.no-webgl` lays the site out normally, without the canvas.
* **No JS** — the `<noscript>` block presents the profile and links as plain HTML.
* One rAF loop only, on `gsap.ticker` with `lagSmoothing(0)`. Every animated value
  is time-based (`damp()` in `core/device.js`) and the camera integrates in fixed
  1/60 s substeps, so behaviour is identical at 120 fps and at 15 fps.

---

## Project layout

```
index.html                  markup, all data-camera stations, critical preloader CSS, watchdog
src/
  main.js                   boot: tier → tracker → world → preloader → reveal
  config/site.config.js     ← projects, stack, nav, marquee, boot lines (edit content here)
  core/
    App.js                  boot order, the single ticker, resize/fonts hooks, hover bridge
    AssetTracker.js         real load progress (fonts, first frame, window.load)
    Renderer.js             canvas, post chain, resize, owns the camera's aspect
    ScrollManager.js        Lenis + ScrollTrigger
    device.js               tier detection, viewShape(), damp()/clamp()/lerp()
  preloader/Preloader.js    the four beats
  webgl/
    World.js                scene assembly, raycast hover, first-frame promise
    CameraRig.js            scroll → camera polyline (the core of the site)
    objects/                Backdrop, ParticleField, HeroCore, GridFloor,
                            DataCluster, ProjectPanels, ShapeRing
    shaders/lib.js          shared GLSL (simplex noise, fresnel)
    textures/               canvas art for the project panels
  ui/                       Navigation, Cursor, Reveals, ScrollRail, Marquee
  styles/main.css           the visual system, responsive + reduced-motion rules
public/fonts/               self-hosted Space Grotesk + JetBrains Mono (woff2)
```

## Editing content

* **Projects / stack / nav / marquee** → `src/config/site.config.js`. The corridor
  panels, the marquee and the DOM all read from it; add a project there *and* a
  matching `<article class="work" data-project="…" data-camera="…">` in
  `index.html`, and the panel texture plus a camera station come for free.
  `repo` is authored prose for the panel's spec row, never derived from a URL —
  the suite's private repositories say so instead of pointing at a sibling's
  address. `year` follows the project timeline in the profile README
  (`github.com/akshutgoyal`) — that is the source of truth for what happened when.
* **Archive rows** → `index.html` only. The 2022–23 builds are a plain
  `<li class="archive__row">` list: no config entry, no panel texture, no extra
  camera station beyond the one on `.archive`.
* **Copy, links, meta** → `index.html`.
* **Camera moves** → the `data-camera` attributes in `index.html`, next to the
  copy they frame.

## Known limits

* Bloom (`?tier=high`) is verified only on real GPUs; the headless SwiftShader
  renderer used for automated checks runs it at ~2 fps, so QA screenshots are
  taken at `?tier=low`.
* Phone project previews retain the 16:9 artwork and sit above the copy in normal
  document flow. Desktop layouts retain the floating 3D panels.
* On a phone the About and Stack sections are taller than one screen, so their
  camera station lands mid-block by design — the copy scrolls past a 3D
  backdrop instead of being composed inside one frame.
