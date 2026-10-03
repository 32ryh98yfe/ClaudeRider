# Local driving-video observations

These are observations of the supplied recording, not recovered engine source
or measured world-space force constants. The implementation specification is
`docs/design/17-reference-fidelity.md` (superseding the preservation-first rules in
`16-reference-driving.md`). The data-only replay annotations are
`packages/content/src/reference-driving.ts`.

## Source and audit

- Source: the user-supplied local `원작 카트라이더.mp4`, 1920 × 1080,
  30 frames/s, 338.0351088435374 s. The game occupies the left 1440 × 1080
  pixels (4:3); the right column contains the input overlay.
- SHA-256, recomputed from the local file:
  `af4ad63b07786412742068a0ff9c239f738730532cd7ced0acfdb241aa1e16a9`.
- File times are used throughout. Source frame intervals are zero-based and
  end-exclusive. Nested frames in a clip are offsets from its start.
- Broad inspection covered the full recording using the existing 15-second
  samples and additional samples at the race transitions and final sequence.
  The first driving demonstration starts near 10.77 s, the second near
  114.73 s, and the third near 224.27 s. The source subtitles describe the
  second as a more ordinary route and the third as a beginner route. The
  labels `expert`, `intermediate`, and `beginner` identify those demonstrations;
  they are not measured player skill scores.
- The beginner run visibly uses a different kart body. Its vehicle stats are
  unknown. Its speed errors must be reported separately from the first two runs.

Key overlay transitions were extracted at every original frame, using a small
red-pixel patch inside each key and preserving simultaneous left/right inputs.
HUD numerals were read with local Apple Vision at 10 Hz. Dense contact sheets
pair every retained OCR sample with the original HUD pixels, inventory, and
input overlay; these were visually reviewed. Empty/non-numeric OCR results are
omitted. The launch zero is manually read from the standing-start frame.
No speed samples are interpolated and raw input edges are not moved to improve
the fit.

The frozen split contains **12 clips: 4 calibration and 8 validation**, with
**257 key-state rows and 394 speed observations**. Validation sequences were
selected from the later demonstrations before simulation fitting. Their
observations must not become an optimization target after evaluating them.

## Clip manifest and initialization

| Clip | Split | File interval (s) | Initial HUD km/h | Normal boost ticks | Start ticks | Stored boosters |
|---|---|---:|---:|---:|---:|---:|
| expert-launch | Calibration | 10.733–13.800 | 0 | 0 | 90 | 0 |
| expert-right | Calibration | 13.800–16.800 | 259 | 138 | 0 | 0 |
| expert-left | Calibration | 16.800–19.800 | 284 | 154 | 0 | 0 |
| expert-repeat | Calibration | 19.800–23.800 | 276 | 138 | 0 | 0 |
| intermediate-launch | Validation | 114.700–118.000 | 0 | 0 | 90 | 0 |
| intermediate-right | Validation | 118.000–121.000 | 265 | 124 | 0 | 0 |
| intermediate-left | Validation | 121.000–124.000 | 286 | 128 | 0 | 0 |
| intermediate-repeat | Validation | 124.000–127.000 | 272 | 128 | 0 | 0 |
| beginner-launch | Validation | 224.233–227.600 | 0 | 0 | 90 | 0 |
| beginner-right | Validation | 227.600–230.800 | 240 | 144 | 0 | 0 |
| beginner-left | Validation | 230.800–234.200 | 270 | 142 | 0 | 0 |
| beginner-repeat | Validation | 236.800–241.000 | 214 | 0 | 0 | 1 |

Launch clips begin at the first visible throttle press. The prior HUD and
starting grid establish zero velocity. **90 start ticks is an explicit existing
model hypothesis**, not a timer recovered from the video. Starting neutral and
preloading a start boost would cancel that boost before the recorded throttle
edge, so the neutral lead-in is excluded consistently for all three launches.

Normal-boost remaining time is a reproducible approximation: 180 model ticks
minus twice the source-frame distance from the preceding visible inventory
consumption. Its consumed frames are respectively 393, 491, 573, 3512, 3604,
3694, 6810, and 6905 for the eight boosted continuation clips. The assumed
180-tick total is not a measured source duration. These values were fixed from
the annotations before fitting and must not be individually optimized.

`quantitativeEligible` is true only for the three launch clips. The continuation
clips have unobserved initial lateral velocity, yaw, drift phase, remaining
boost life, and sometimes course elevation. They are valuable rendering and
control-sequence comparisons but cannot establish a 5% absolute-speed claim.
There are **two eligible held-out launch clips**, not three independent controlled
held-out experiments. Even those retain unknown kart stats and input-overlay
latency. High confidence in a readable HUD number does not remove these limits.

## Direct observations and timing uncertainty

| Observable | Source frame / time | Evidence |
|---|---|---|
| Expert first throttle | 322 / 10.733 s | Overlay lights Up at the standing start |
| Expert first inventory award | 391 / 13.033 s | Booster icon appears, visible through frame 392 |
| Expert first inventory consumption | 393 / 13.100 s | Icon disappears; source Ctrl overlay lights later at 396 |
| Expert right drift press / release | 424 / 14.133 s; 429 / 14.300 s | Shift + right then right only |
| Expert right-drift counter input | 441 / 14.700 s | Left lights after neutral steering |
| Expert left drift press / release | 512 / 17.067 s; 517 / 17.233 s | Shift + left then left only |
| Expert same-direction re-press | 596 / 19.867 s; 615 / 20.500 s | Two separate right + Shift presses |
| Intermediate first inventory award / consumption | 3510 / 117.000 s; 3512 / 117.067 s | Icon appears then disappears |
| Beginner first inventory award / consumption | 6807 / 226.900 s; 6810 / 227.000 s | Icon appears then disappears |

The expert first inventory event demonstrates a **three-frame (100 ms)
overlay-to-game offset** for that event: the icon disappears before Ctrl lights.
Other inspected inventory consumptions coincide with the displayed Ctrl edge.
Therefore there is no justified single global time shift. Record exact overlay
frames, retain the mismatch, and allow that uncertainty when comparing physical
event times. An input edge is not itself proof that a drift or boost succeeded.

The first expert launch reaches HUD 128 at 11.2 s, 209 at 11.5 s, 268 at 11.8 s,
and 307 at 12.1 s. Later it recovers from 263 at 14.6 s to 307 at 15.6 s.
Intermediate and beginner launches differ: the latter reaches 317 at 225.7 s.
These are displayed speeds, not evidence for a particular metre-per-second
conversion. Matching the speedometer alone does not establish matching travel
distance, corner radius, or speed perception.

The event rows distinguish observed input presses/releases from inventory
appearance/disappearance. `gauge-full-visible` means that an inventory icon
appeared; it does not encode an inferred numerical internal gauge. Frame-level
audits use ±1 frame; events bracketed by 10 Hz samples use ±3 frames. Speed
observations use ±1 source frame, independently of the overlay latency.

## Reproduction and local artifacts

Both extraction tools use AVFoundation/AppKit on macOS. The video remains local;
neither tool uses the network. Pass the local source path and an output directory
outside the repository:

```sh
swift tools/reference/extract-video.swift "$REFERENCE_VIDEO" 318 714 /tmp/reference-expert
swift tools/reference/extract-review.swift "$REFERENCE_VIDEO" 318 714 3 /tmp/reference-expert-review.png
swift tools/reference/extract-review.swift "$REFERENCE_VIDEO" 386 405 1 /tmp/reference-first-booster.png
```

The first tool writes `samples.jsonl` with requested frame, actual media PTS,
key patch fractions, raw OCR text/confidence, and half-second screenshots. It
also writes a dense review sheet. The second tool generates a compact sheet
directly from exact source frames, including the inventory, without relying on
OCR. It can inspect individual transitions with stride 1.

This session's local evidence is under `/tmp/clauderider-reference/`:
`expert-review.png`, `intermediate-review.png`, `beginner-review.png`,
`beginner-repeat-review.png`, and the `*-boost.png` frame-level inventory audits.
The extraction directories contain raw `samples.jsonl` and source thumbnails.
These temporary artifacts may disappear; the commands and committed annotations
allow reproduction from the original local file. Source footage and pixel
extractions are deliberately not committed.

The content module passes the content TypeScript check. A structural audit
verified frame-zero key state, integer frame bounds, monotonic key transitions,
clip counts, and source FPS. This validates the annotations' shape, not the
physical fidelity of the implementation that consumes them.
