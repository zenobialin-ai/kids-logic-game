# Plan: 光影小偵探（俯視圖還原）— issue #50（#29 主題一小原型）

Base: `main` e082a22. Branch `feat/topview`. Worktree `F:/!Coding/klg-topview`.
Line numbers below are from e082a22 and **will drift once you start editing — grep the anchor text first**.

## 0. Goal and scope

Add one new module `topview` to `logic_game.html`:
- The child sees an isometric block structure on a 3×3 floor plus a 🐻 marker.
- Below it is a 3×3 grid of buttons, the floor seen from directly above.
- The child taps cells to paint the shadow cast by a flashlight shining straight down, then presses ✅ 檢查.

**Out of scope:** dual light sources, the minimum-blocks puzzle, dragging the light, any change to `index.html`, and any change to other modules' behaviour.

## 1. Data shape (question JSON)

```js
{ heights: [[h00,h01,h02],[h10,h11,h12],[h20,h21,h22]],  // GRID frame (answer frame), ints 0..3
  layout: 'diamond' | 'square',   // how the answer grid is drawn (see below)
  view: 0 | 1,             // which front edge of the iso picture the bear stands at (see mapping)
  prompt: string }
```

**Why there are two layouts (audit H3).**
- The iso floor is a diamond. An upright square answer grid therefore needs about 45° of mental rotation for *either* front edge, so "bear on the side" alone would not make hard any harder.
- `layout: 'diamond'` (easy and normal): the answer grid is rotated 45° (CSS `transform: rotate(45deg)` on the grid container) so it lines up with the iso floor. Its bear sits at the same edge as in the picture (`view` is always 0 here), so the correspondence is direct.
- `layout: 'square'` (hard): the answer grid is an upright square with the bear under its bottom edge. In the picture the bear stands at the lower-left edge (`view 0`) or the lower-right edge (`view 1`), chosen at random. The child has to mentally rotate about 45°, to one side or the other.

**GRID frame.** This is the frame of the button grid the child taps.
- Row `gr = 0` is far from the bear and `gr = 2` is next to the bear.
- Column `gc = 0` is on the bear's left, *as seen standing where the bear stands, facing the blocks*.
- The answer is `heights[gr][gc] > 0`.
- For the diamond layout, the unrotated grid container (row 0 at top, col 0 at left) is rotated 45° clockwise:
  - cell (0,0) ends up as the top corner, (0,2) the right corner, (2,0) the left corner, (2,2) the bottom corner;
  - this matches render frame `view 0`;
  - the diamond grid's bear is drawn outside its lower-left edge (row 2), exactly as in the picture.

**RENDER frame** `(r, c)` is what `blockScreenPos(r, c, z)` (logic_game.html:4585) consumes:
- `x = (c - r) * tw/2`, `y = (c + r) * th/2 - z * bh`.
- Larger `r + c` is nearer the viewer.

**Mapping (normative):**
- `view 0`: `(r, c) = (gr, gc)`. The bear is drawn on the floor beyond edge `r = 2`, the lower-left edge of the diamond.
- `view 1`: `(r, c) = (2 - gc, gr)`. The bear is drawn beyond edge `c = 2`, the lower-right edge.
  - Derivation: the bear stands at `c = 2` facing toward `c = 0` (up-left on screen), so its left-hand side is increasing `r`.
  - Hence `gc = 0` maps to `r = 2`, and "near the bear" (`gr = 2`) maps to `c = 2`.

Implement this mapping exactly once, as a pure function `topviewToRender(gr, gc, view) -> {r, c}`, and use it everywhere (rendering, the visibility check, the victory animation).

## 2. Generator `genTopview(diff)`

Rule table, in the style of `BLOCKS_RULES` (logic_game.html:4573):

| diff | columns (cells with h > 0) | h range | layout | view |
|---|---|---|---|---|
| easy | 3–4 | 1–2 | diamond | 0 |
| normal | 4–6 | 1–3 | diamond | 0 |
| hard | 4–6 | 1–3 | square | 0 or 1 (random) |

Prompts (Traditional Chinese, speakable, **no emoji**; verify the readings of polyphonic characters, see §3 #21):
- easy/normal: `手電筒從上面往下照，影子會在哪些格子？點一點，把影子塗上去！`
- hard: `站在小熊的位置看！手電筒從上面往下照，影子會在哪些格子？`

Use `generateUntil` (4376) and reject a candidate unless all of these hold:

- **V1 Visibility (the invariant that makes the answer unique).** Work in the RENDER frame.
  - For every occupied render cell `(r, c)` with height `h`, every render cell `(r', c')` with `r' >= r`, `c' >= c`, `(r', c') != (r, c)` must have height `<= h`.
  - This guarantees every column's top face is fully visible. Geometry: same-height neighbours only share an edge, and cells with `r' > r, c' < c` (or the mirror case) are offset by at least `tw` in x, so they never overlap.
- **V2** The occupied count lies within the table range. The occupied set is never all 9 cells or 0 cells.
- **V3** At least one column has `h >= 2` (normal/hard only), so heights are a real distraction.
- **V4 Empty floor readable (audit M1).** Every empty render cell's floor tile must be at least 50% visible.
  - Floor tile of render cell `(r, c)`, with `(x, y) = blockScreenPos(r, c, 0)`: the rhombus `[x, y], [x+hw, y+hh], [x, y+th], [x-hw, y+hh]`, i.e. the bottom face of a z=0 cube.
  - Measure by sampling the 25 points of a 5×5 lattice inside the rhombus (bilinear parameters 0.1, 0.3, 0.5, 0.7, 0.9 along the two edge directions).
  - A point is hidden if it lies inside `cubeOutline` (4592) of any cube in the structure. Use the existing `insideConvex`.
  - The tile is visible enough if **≥ 10** of the 25 points are not hidden.
  - Why 10: `insideConvex` counts boundary points as inside. A single front neighbour hides exactly half the tile, leaving exactly 10 lattice points visible (true visible area exactly 50%, never lower), and that is acceptable. With 13 only 33 easy grids would remain.
  - Expected after V1–V4: 198 easy and 1645 normal/hard distinct render grids. Generator acceptance is about 8.9% (easy) and 2.2% (normal), fine for `generateUntil`'s 3000 tries.

**Canvas geometry (normative, audit H1).**
- Declare a top-level `const TOPVIEW_CANVAS = { w: 320, h: 300, ox: 160, oy: 150 }`. Use **no `export` keyword**: the page is a classic script, and `export` would be a SyntaxError for the whole page. A cube at render `(r, c, z)` is drawn at `(ox + pos.x, oy + pos.y)` with `pos = blockScreenPos(r, c, z)`.
- Change these numbers only if A10 shows clipping. The harness must read them from the page, not hard-code them.

Randomness goes only through the existing `randInt` / `pick` / `shuffle` helpers. Don't add a new RNG.

## 3. Integration touch points (all required)

Grep each anchor and add a `topview` entry next to the existing ones.

| # | Where (e082a22 line) | What |
|---|---|---|
| 1 | menu Section 2 cards (1875–1896) | Card `card-topview`: icon 🔦, `<h3>光影小偵探</h3>`, `<p>手電筒從上面照下來，影子會在哪裡？</p>`, badge `id="badge-topview"` text `🔦 俯視圖與心智旋轉`. Place it after folding. |
| 2 | CSS `.card-*` (199–208) | `.card-topview` colour rule, same pattern. |
| 3 | game views (1900–2161) | `#view-topview.game-view`: same header as other views (`.game-title-box`, `.level-badge id="topviewLevelBadge"`, `.speak-btn onclick="speakCurrentPrompt(true)"`), `.prompt-box id="topviewPrompt"`, `<canvas id="topviewCanvas">`, grid container `#topviewGrid`, bear label `#topviewBear` (`🐻 小熊站這裡`, placement per §4), buttons `id="topviewReset"` (🧹 重來) and `id="topviewCheck"` (✅ 檢查). |
| 4 | `defaultProgress().completed` (3221) | `topview: 0` |
| 5 | `MODULE_LOADERS` (4048) | `topview: loadTopviewLevel` |
| 6 | `speakCurrentPrompt` (4061) | Add a branch that speaks `currentQuestion.prompt`. |
| 7 | `QUESTION_GENERATORS` (5656) | `topview: genTopview` |
| 8 | `MODULE_INFO` (5171) | `topview: { icon: '🔦', title: '光影小偵探' }` |
| 9 | `QUESTION_VALIDATORS` (5189) | `heights` is 3×3 ints 0..3; `layout` is `'diamond'` or `'square'`; `view` is 0 or 1, and `layout === 'diamond'` implies `view === 0`; the occupied count is 1..8; `prompt` is a string. |
| 10 | `mistakeSummary` (5268) | **Must not reveal the answer.** Use `'共 ' + totalBlocks + ' 塊積木・' + (layout === 'square' ? '方格' : '菱形格')`. That gives the total block count only, never which cells are occupied. Don't use the top-view pattern the blocks summary uses (5271). |
| 11 | `goHome` cleanup (3995–4010) | Cancel the topview animation timer and reset `topviewAnimating = false`. |
| 12 | eye-lock condition (~7249, `!gearDemoRunning && !pipeRunning`) | Add `&& !topviewAnimating`. |
| 13 | resize handler (~7151) | Re-render topview if `currentModule === 'topview'`. |
| 14 | `common/family.js` `QLOG_GAMES.little_logic_qlog_v1` (174–178) | Add `'topview'` to `modules` and `subs`. **Without this every record is silently dropped.** |
| 15 | `common/family.js` `QLOG_REPORT.little_logic_qlog_v1` (509–528) | `icons.topview = '🔦'`, `subLabel.topview = '光影小偵探'`, `actionFields.topview = ['submits', 'resets']`, `aidLabel.topviewCount = '柱子數提示'`. |
| 16 | `QLOG_HINT_GRADE` (3612) | `'topview': 'd'`. Trade-off: the first-wrong feedback is generic (g-like), but the second-wrong column count is directional, so we grade by the strongest hint. |
| 17 | `qlogForm` (3650) | `if (module === 'topview') return 'grid';` |
| 18 | `qlogChance` (3671) | No change needed. The function's final fallback already returns `null`; verify it does for `topview`. |
| 19 | `LOG_BUILD` (3609) | 2 → 3, with a comment `// #50：新增光影小偵探`. |
| 20 | `python tools/build_common.py` | Re-embeds family.js into **both** html files. Commit both. |
| 21 | `python tools/build_zhuyin.py <moedict dict-revised.json>` | New characters (影 照 筒 熊 塗 位 …) are missing from the dictionary. Get moedict as described in the header of `tools/build_zhuyin.py`, cloning into the session scratchpad, not the repo. Run it after step 20. **Audit M5:** the ZHUYIN DATA diff may only *add* characters. No existing reading may change, and `index.html` must be byte-identical. If an existing reading drifts, restore it via the script's `MANUAL` table. Hand-check the readings of polyphonic characters in the new strings (e.g. 了 in 塗了, 重 in 重來, 一 in 一共／點一點, 數 in 柱子數提示, 上, 往, 照) and list them in the report. Also compare the zhuyin output of the **existing** UI text before and after: render the menu plus every other module's view on main and on the branch, and diff the annotation text. Newly added words can change the word segmentation of old strings, which the DATA diff alone does not show. |

## 4. Module behaviour

- **State:** a module-level `topviewMarks` (3×3 booleans), `topviewAnimating`, and `topviewAnimTimer`.
- **`loadTopviewLevel()`** (template: `loadPatternLevel` 5669 plus the deduction build-then-check flow 6384–6509):
  - **First (audit M4, precedent `loadPipesLevel` 6193–6213):** `clearTimeout(topviewAnimTimer)` (in browsers this also clears an interval), set `topviewAnimating = false`, and re-enable `#topviewReset`, `#topviewCheck` and the grid cells.
  - Reset `topviewMarks` and set the badge with `levelBadgeText()`.
  - Set the prompt text, render the canvas, and build the 9 grid cells.
  - End with `speakText(currentQuestion.prompt)`.
- **Canvas rendering:**
  - Draw the floor tiles for all 9 render cells first, light colour with an outline, so empty cells are readable.
  - Draw the cubes back to front (ascending `r + c`, then `z`), reusing `drawIsoCube` (5943) with `isXray = false`.
  - Draw the bear **last**, so it is never covered. Use `fillText('🐻')` with an explicit emoji font stack, e.g. `"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`. Place it beyond the bear edge (`r = 2` for view 0, `c = 2` for view 1), at the midpoint of that edge, pushed outward by about 0.8 tile.
  - Use the canvas size and origin from `TOPVIEW_CANVAS` (§2). Add CSS `max-width: 100%; height: auto` so it scales on phones.
  - Text in the canvas gets no zhuyin. Keep text out of the canvas apart from the emoji.
- **Answer-grid layout:**
  - `diamond`: the 3×3 container is rotated 45° clockwise. The cells stay buttons; hit-testing follows the transform. Size the wrapper so the rotated grid does not overlap the buttons below it: the diagonal is about cell × 3 × 1.414.
    - `#topviewBear` is a **sibling** of the rotated container, not inside it, so its text stays horizontal.
    - Centre it on the outer side of the row-2 edge, the lower-left edge of the diamond. **Not** under the bottom corner (2,2): that would put the bear between the two front edges and teach the wrong correspondence.
  - `square`: an upright grid with `#topviewBear` centred under the bottom edge.
- **Grid cell size (audit L-6), the single rule:**
  - 44px at viewport width ≤ 360px;
  - else 48px at width ≤ 600px or height ≤ 1024px;
  - else 56px.
  - A10 is the final judge.
  - A side-by-side layout from ≥ 700px wide in landscape is also allowed if it fits better.
- **Layout (audit M6):**
  - At ≥ 900px wide in landscape, put the canvas and the answer grid side by side.
  - At 768×1024 and 1024×768 both must be fully visible at the same time without scrolling.
  - At 360 wide, vertical stacking with scrolling is accepted; state this in the PR.
- **Grid cells:**
  - Each cell is `<button class="tv-cell" id="tv-cell-<gr>-<gc>" aria-label="第<gr+1>排第<gc+1>格">` with `onclick` toggling the mark. This is required for tap logging; see family.js 358–365.
  - A marked cell shows a dark shadow fill.
  - Size per the grid cell size rule above, via a CSS variable like `--pipe-cell`.
  - Play `soundClick()` on toggle.
- **🧹 重來:** clears all marks and calls `qlogEvent('x', 'reset')`.
- **✅ 檢查:**
  - **No marks:** `speakText('先點格子，把影子塗上去喔！')`. This does **not** call `onWrongAnswer` and logs no submit.
  - **Otherwise:** `qlogEvent('x', 'submit')`, then compare the marks with the answer mask (exact set equality).
  - **Correct:**
    - Set `topviewAnimating = true` and disable the grid and buttons.
    - Light the answer cells one by one (~150 ms each, total ≤ 1.5 s).
    - If you chain `setTimeout`s, store **every** new handle in `topviewAnimTimer`; alternatively use one `setInterval` and `clearInterval`. `goHome` must be able to cancel whichever step is pending (I5).
    - Then `topviewAnimating = false` and `triggerVictory(title, msg, isLastQuestion())`.
    - The timer handle goes in `topviewAnimTimer`, so `goHome` can cancel it. If `currentModule !== 'topview'` when the timer fires, do nothing.
  - **Wrong:**
    - Call `soundError()`, then `onWrongAnswer(text)`. Report the wrong answer only through `onWrongAnswer`; don't add your own `qlogEvent('w')`.
    - **Audit H2:** the argument is the wrong-answer *text*. The mistake card prints it as `上次${wrongText}` (~5382). Pass the child's own marks, e.g. `'塗了 ' + rows.map(row => row.map(m => m ? '⬛' : '⬜').join('')).join('／')`. This also keeps the 800 ms de-dupe from merging two different wrong answers.
    - Decide which hint to speak with `questionWrongAttempts` as read **after** `onWrongAnswer` returns. Keep no separate counter.
    - `questionWrongAttempts < 2`: speak `再看看，手電筒從正上方照，有積木的格子才有影子喔！`
    - `questionWrongAttempts >= 2`: speak `提示：一共有 N 根柱子喔！` and call `qlogEvent('a', 'topviewCount')`. Don't touch `questionWrongAttempts` yourself; the wrong answers already count.
    - Keep the marks so the child can adjust them. **Don't reveal which cells are wrong.**
  - **While animating:** 檢查, 重來 and the cells are disabled, and `checkTopview` returns at once if `topviewAnimating` is set. A double tap can never give two victories.
- **Mistake book retry:** works through the existing `startModule(mod, mistake)` path. Nothing special is needed beyond the validator.

## 5. Invariants (auditor verifies each)

- **I1** For every generated question, the answer is uniquely determined by the picture: every occupied column's top face is fully visible (V1). Check it with the pixel test A2.
- **I2** `topviewToRender` is the only GRID→RENDER mapping. Rendering, V1 and the animation all use it.
- **I3** No path reveals the answer before it is solved: the mistake summary, prompts, hints, the speech text, the aria-labels (cell labels are positional only), and the DOM. No `data-*` attribute or class may encode the answer before victory.
- **I4** A topview record is accepted by `isValidLogRecord` and appears in the parent report under 光影小偵探.
- **I5** `goHome` (or the eye lock) during the victory animation never leads to `triggerVictory` afterwards, and leaves no `topviewAnimating = true` behind.
- **I6** No change to other modules' behaviour. `logic_regress` output equals main's except for the expected diffs listed in A11.
- **I7** All browser runs use `args: ['--mute-audio']`. **Never play sound through the speakers on this machine.**

## 6. Acceptance cases

Write a Node Playwright harness **outside the repo**, in the session scratchpad, modelled on `tools/regress/logic_regress.js`: its header explains `PLAYWRIGHT_PATH`/`PW_CHANNEL`, `page.clock`, and the fake speechSynthesis. Each case prints a compact JSON result. Use `locator.click()`, not `el.click()`.

**Independence rule (audit M2).** In A1–A3 the harness must use its **own** implementation of the GRID→RENDER mapping, V1 and V4, written from this plan's text. It must never call the page's `topviewToRender` or validity functions; otherwise a wrong implementation would prove itself right. From the page it reads only `BLOCK_SIZE` and `TOPVIEW_CANVAS`, and calls `genTopview`.

- **A1 Generator:**
  - Run 3000 questions per difficulty.
  - Every one passes `QUESTION_VALIDATORS.topview` and the harness's own V1–V4.
  - `layout` and `view` match the table (for hard, both views occur); heights stay within range.
  - Report the number of distinct questions per difficulty, which must be ≥ 50.
- **A2 Pixel visibility:**
  - For 300 normal and 300 hard questions, render on an offscreen canvas using the same `BLOCK_SIZE`, origin and draw order.
  - Each column gets a unique flat colour for its top faces and a different colour for its side faces. **Fill only, no stroke, no antialiasing tricks.**
  - Count the pixels whose RGBA exactly equals each column's top-face colour.
  - Every occupied column must show ≥ 99% of the top-face pixel count it has when drawn alone.
  - Measure the V4 floor visibility the same way: empty floor tiles ≥ 45% by pixels.
- **A3 Mapping (audit H1).** Render through the real page. Sample the canvas pixel at the centre of the expected top face, computed from `TOPVIEW_CANVAS` and `blockScreenPos`. It must be cube-coloured, and the other three corner positions must not be.
  - Only `[0][0] = 1`: view 0 → render `(0,0)` (top corner); view 1 → `(2,0)` (left corner).
  - Only `[0][2] = 1`: view 0 → `(0,2)` (right corner); view 1 → `(0,0)` (top corner).
  - Only `[2][0] = 1`: view 0 → `(2,0)` (left corner); view 1 → `(2,2)` (bottom corner).
  - Only `[2][2] = 1`: view 0 → `(2,2)` (bottom corner); view 1 → `(0,2)` (right corner).
  - The bear is beyond the lower-left edge for view 0 and the lower-right edge for view 1. Check with a pixel sample, or by stubbing `fillText` and recording its coordinates.
  - Diamond layout: after the rotation, the bounding-box centre of `#tv-cell-0-0` is the topmost of the nine cells, `#tv-cell-0-2` the rightmost, `#tv-cell-2-0` the leftmost and `#tv-cell-2-2` the bottommost.
  - Diamond bear label: let `v` be the vector from the centre of `#tv-cell-1-1` to the centre of `#tv-cell-2-1`. The dot product of `v` with (centre of `#topviewBear` − centre of `#tv-cell-2-1`) must be > 0 (outward). Also, with `w` the unit vector from the centre of `#tv-cell-2-1` to the centre of `#tv-cell-2-2`, `|(bear centre − centre of #tv-cell-2-1) · w| ≤ 0.5 × cell size`, so the label is centred along the row-2 edge; this catches a label placed under the bottom corner. The label must not be rotated (its computed transform is `none`, or it is not a descendant of the rotated container).
  - How to load a fixed question: in `page.evaluate`, start the module with `startModule('topview')`, then set `currentQuestion = {...}` and call `MODULE_LOADERS.topview()`. Don't use the mistake-book retry path for this, because it changes stars and mistakes.
- **A4 Correct path:**
  - Start topview from the menu, tap exactly the answer cells, then press 檢查.
  - The victory modal appears after the animation and stars increase by 3.
  - The latest qlog record has `module: 'topview'`, `sub: 'topview'`, `build: 3`, `form: 'grid'`, `outcome: 'correct'`, `actions.submits === 1`, `wrongCount === 0`.
  - After the victory modal → next question, 檢查, 重來 and the cells are enabled again.
  - Tapping 檢查 twice quickly on a correct answer still gives exactly one victory and +3 stars.
  - Do this for each difficulty: for hard, at least one view-0 and one view-1 question, and for easy, the diamond layout.
- **A5 Empty check:** pressing 檢查 with no marks gives `wrongCount === 0`, `actions.submits === 0`, and no mistake-book entry.
- **A6 Wrong twice, then a mistake-book retry:**
  - Submit two **different** wrong patterns, with `page.clock.runFor(1000)` in between, because of the 800 ms de-dupe.
  - After them, `wrongCount === 2`, the aids include `topviewCount`, and the mistake book has a `topview` entry whose card text starts with `上次塗了`.
  - Its summary doesn't contain the answer pattern.
  - A retry from the mistake book renders the same heights and view, and solving it gives `source: 'retry'`.
- **A7 Reset:** 重來 clears the marks, and `actions.resets` increments.
- **A8 Parent report:** after A4, the parent-page learning log text contains `光影小偵探`.
- **A9 Interrupted animation:**
  - Answer correctly, then call `goHome()` during the animation (use `page.clock`).
  - No victory modal appears afterwards, `topviewAnimating === false`, and the record outcome is `abandoned`.
  - Re-entering topview leaves 檢查, 重來 and the cells enabled.
  - Eye lock: with the eye-care limit expired and the grace period passed during the animation, the lock waits until the animation ends.
- **A10 Layout:**
  - Viewports 360×640, 768×1024 and 1024×768, plus font scale 1.5 at 360.
  - No horizontal page scroll, and every `.tv-cell` is ≥ 44×44 px (pre-rotation size).
  - At 768×1024 and 1024×768 the canvas, the whole answer grid and the 檢查 button are all inside the viewport **at the same time**, without scrolling.
  - At 360×640, scrolling is allowed; record how many px of scrolling are needed.
  - The rotated diamond grid must not overlap the buttons or the prompt.
  - Save screenshots to the scratchpad for the PR. Don't commit them; the `pr-assets` branch is for PR images.
- **A11 Regress:**
  - Run `node tools/regress/logic_regress.js` on this branch and on an origin/main worktree, and compare.
  - The only allowed differences are:
    - the `completed.topview: 0` key in save dumps;
    - `build: 3` in records created on this branch;
    - the new `badge-topview` entry in every step's `menuBadges` (logic_regress.js ~321).
  - List each differing path in the PR.
  - `montessori_regress.js` must be identical except for the embedded family.js effects; ideally identical.
- **A12 Build hygiene:**
  - After running `build_common.py` and `build_zhuyin.py`, `git diff --exit-code` shows nothing more to change on a second run.
  - No console errors or page errors in any case.
  - In the new view, every Han character outside canvas/svg has a zhuyin annotation; count elements without one.

## 6b. Known limitation (state it in the PR)

An old-version tab still open during the upgrade will filter topview records and mistakes as invalid, and drop them on its next write (family.js ~260, ~300). Every previous new module had the same limitation.

Also state in the PR:
- The roughly 1 s victory animation counts toward `firstAnswer.dt`. Pressing 🏠 during it records `abandoned`, the same as the pipes animation.
- Design deviation from the issue #50 text: easy/normal use a diamond answer grid, and hard uses a square grid with the bear at either front edge, instead of "bear on the side". Give the reason from §1.

## 7. Implementer rules

- One commit series on `feat/topview`. Don't touch `main`; don't merge. Commit identity, set per command or in the worktree config: `Arcrek-coder <226868523+Arcrek-coder@users.noreply.github.com>`.
- Don't hand-edit the generated `FAMILY:START…END` or `ZHUYIN:START…END` blocks; use the build scripts.
- Match the surrounding code style: Traditional Chinese comments, the same naming pattern (`loadXLevel`, `genX`, `checkX`).
- Report back:
  - the harness path;
  - the JSON results for A1–A12;
  - the regress diff paths;
  - anything you could not satisfy and why.
