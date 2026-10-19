# Plan v3: 連鎖機關 — issue #52 (#29 theme 2 prototype)

- **Base:** branch `feat/topview` at fdccd81 (PR #51, not merged yet). Branch `feat/chain`, worktree `F:/!Coding/klg-chain`. The PR says "merge after #51".
- **Line numbers drift:** grep anchors first.
- **v3 changes (after plan audit 2):**
  - Domino cards are now whole rows `{n, gap}` starting at a fixed point. This removes the "max gap < height" shortcut and the rows that ran through the ball.
  - Gap is clear space; gap 4 and clearance 4 are excluded, so every hit and miss differs by at least 12 px.
  - New seesaw geometry: ±12° tilt, explicit coordinates, a bell track.
  - `cards` are stored in canonical sorted order and shuffled only at render.
  - Observations describe only what happened.
  - Geometry and key C-cases added.
- **Verification scripts** (the design numbers below come from them): `C:/Users/aicil/AppData/Local/Temp/claude/F---Coding/c5915076-4999-4ff2-9981-7edc965d2f44/scratchpad/chain-design/v3d.js` (dominoes generator and heuristics) and `v3.js` (geometry).

## 0. Goal and scope

Add one new module `chain` to `logic_game.html`.
- The scene is a left-to-right chain reaction ending in a bell 🔔. One or two component slots are empty (❓), and cards are shown below.
- The child fills the slots and presses ▶ 啟動. The chain animates stage by stage, driven by **deterministic rules, not physics**.
- At the first failing stage it stops, highlights that stage and speaks a neutral observation. The child can change cards and retry.
- When the bell rings, the question is solved.

**Out of scope:** gears, rails, free placement, physics, new sounds, and any change to `index.html` or other modules' behaviour.

**Template.** `topview` (#51) touches every place a new module needs.
- Run `grep -n "topview\|Topview" logic_game.html common/family.js` and add the `chain` equivalent next to **each** occurrence.
- `docs/plans/issue-50-topview-plan.md` §3 explains each row. The extras are in §3 below.
- Balance already uses the strings `'chain'`/`'chain-double'` as kinds (≈4591, 4683). Don't collide with them.

## 1. Data shape (question JSON)

```js
{ hasDominoes: boolean,      // easy false; normal/hard true
  dist: int | null,          // units from the row start x0 to the ball's left edge (8..20); null if no dominoes
  row: {n, gap} | null,      // fixed domino row when dominoes is NOT a slot; null if slot or no dominoes
  ball: 1|2|3 | null,        // ball weight (● count); null when ball is a slot
  load: 1|2|3,               // blocks in the basket under the seesaw's right end (never a slot)
  arm: 1|2|3 | null,         // left arm length in units; right arm = 4 - arm; null when fulcrum is a slot
  slots: [...],              // ordered subset of ['dominoes','ball','fulcrum'], length 1 or 2
  cards: { dominoes?: [{n,gap}...], ball?: [w...], fulcrum?: [arm...] },  // keys === slots
  prompt: string }
```

- **`cards` are stored in canonical order:** numbers ascending, rows sorted by `n` then `gap`.
  - Display order is shuffled once in `loadChainLevel` into a module variable `chainCardOrder`, never stored in the question.
  - So the default `questionKey` (≈4446, which stringifies everything except `options`/`answerIdx`) gives one key per distinct question.
  - The field is named `cards`, not `options`, so generic `qlogNOptions`/`qlogChance` don't misread it.
- There is **no answer field**; `chainSimulate` always recomputes the answer.
- **Domino units:** a domino is 1 unit wide and `DOMINO_H = 4` units tall; `gap` is the clear space between neighbours, in units. 1 unit = `U` = 12 viewBox px.
  - Row span is `n + (n − 1)·gap`.
  - Clearance is `c = dist − span`, the space between the last domino and the ball.
- **Balls:**
  - 紙球 ●, w = 1;
  - 木球 ●●, w = 2;
  - 鐵球 ●●●, w = 3.
  - The dots show on the ball cards *and* on the drawn ball. Each load block shows ●, weight 1 per block.

## 2. Rules: the single source of truth

`chainSimulate(q, choice)` takes the filled slots as `{row?, ball?, arm?}`. It returns `{ ok, failAt: null|'dominoes'|'seesaw', kind: null|'gap'|'short'|'left'|'right' }`. It is pure and touches no DOM.

1. **dominoes** (only if `hasDominoes`), with `r` = the chosen or fixed row:
   - `r.gap >= 5` → fail, kind `'gap'`. The row breaks: a falling domino's top lands short of the next domino.
   - Else, if `c >= 5` → fail, kind `'short'`. The last domino can't reach the ball.
   - Else pass: `gap ≤ 3` and `0 ≤ c ≤ 3`.
   - `gap = 4`, `c = 4` and `c < 0` never occur. The generator and validator exclude them.
2. **ball:** it rolls down the ramp onto the left end of the plank. This always passes. (With no dominoes, a 👉 nudges the ball.)
3. **seesaw:** compute `Lt = ball × arm` and `Rt = load × (4 − arm)`. Easy and normal use `arm = 2`.
   - `Lt > Rt` → fail, kind `'left'`.
   - `Lt < Rt` → fail, kind `'right'`.
   - `Lt === Rt` → pass: the plank goes level and the ball rolls across to the bell.
4. **bell:** rings, giving `ok: true`.

**U1 (uniqueness):** exactly one combination in the cartesian product of the cards gives `ok: true`.

**Intended reasoning per variant** (this is what we teach; no single-attribute shortcut beats ~50%):
- **dominoes:** first drop the rows whose gaps are wider than a domino is tall, then pick the narrow row that reaches the ball.
  - Measured over the generator's pools with equal mixing: "largest gap < 4" wins 50%, "most dominoes" 50%, "longest row" 46%, "smallest gap" 50%.
  - "Longest row whose gaps are narrow" always wins. That is the rule itself, and it is the intended reasoning.
- **ball:** the ball's dots equal the number of blocks (when `arm = 2`).
- **fulcrum:** equal weights → middle; otherwise the fulcrum goes nearer the heavier side, so that `ball × arm = load × (4 − arm)`.

## 3. Generator `genChain(diff)` and extra touch points

**Dominoes pools.** Build these once, lazily, by enumeration:
- Rows: `n` in 2..7, `gap` in {1, 2, 3, 5, 6}. `dist` in 8..20.
- For each `dist`, let:
  - A = rows with `n ≥ 3` that pass;
  - G = rows with `gap ≥ 5` and `0 ≤ c ≤ 3`;
  - S = rows with `gap ≤ 3` and `c ≥ 5`.
- Each triple `(A, G, S)` is a candidate question. Keep only the triples in family **X** or family **Y**:
  - **X**: `S.n > A.n && S.gap < A.gap`;
  - **Y**: `S.gap > A.gap && S.n < A.n`.
- Split each family by whether `span(G) > span(A)`. That gives four pools: X1 (9), X0 (48), Y1 (29) and Y0 (174), 260 card sets in total.
- **Sampling:** pick the family 1/2 – 1/2, then G-longer 1/2 – 1/2, then a uniform triple from that pool. Cards are `[A, G, S]`, canonically sorted.

**Fixed row**, used when dominoes exist but are not a slot: `dist = 12`, `row = {n: 4, gap: 2}` (span 10, c = 2, passes).

| diff | stages | variant | recipe |
|---|---|---|---|
| easy | ball → seesaw → bell | `['ball']`, `arm = 2` | Pick the answer `w` uniformly from 1..3 and set `load = w`. Cards are `w` plus 1 or 2 other distinct weights. 9 configs. |
| normal | dominoes → ball → seesaw → bell | **dominoes** (p = 1/2): `['dominoes']`, card set from the pools, `load` uniform 1..3, `ball = load`, `arm = 2` | 260 × 3 configs |
| | | **ball** (p = 1/2): `['ball']`, fixed row, cards `[1,2,3]`, `load` uniform 1..3, `arm = 2` | 3 configs |
| hard | same as normal | **dominoes+ball** (p = 1/2): card set from the pools, ball cards `[1,2,3]`, `load` uniform 1..3, `arm = 2` | 260 × 3 |
| | | **ball+fulcrum** (p = 1/2): fixed row, 2–3 distinct ball cards, fulcrum `[1,2,3]`, `load` 1..3, under `generateUntil` + U1 | 7 configs (answers arm 1/2/3 = 1/5/1) |

**Prompts** (no emoji):
- easy: `選一顆球放進問號裡，讓翹翹板平平的，球才滾得到鈴鐺！`
- normal/hard: `把卡片放進問號裡，按啟動，讓機關一路動到鈴鐺響！`

**Extra touch points:**
- `wrongThreshold`: for `chain`, return 1 if the card product is 2 (only easy with 2 cards), else 2.
  - This affects `questionCountedWrong`/adaptive only. `recordMistake` runs on every wrong anyway.
- `qlogNOptions`: the product of the card counts. `qlogChance`: `1 / product`. `qlogForm`: `'slots'`. `QLOG_HINT_GRADE`: `'chain': 'd'`.
- `mistakeSummary`: the stage list plus the slot names, e.g. `骨牌→球→翹翹板・缺 骨牌、球`. Never the answer.
- `QUESTION_VALIDATORS.chain`:
  - the shape, and the key set of `cards` equals `slots`;
  - the cards are canonically sorted;
  - every non-slot field is set;
  - no row with `gap = 4`, `c = 4` or `c < 0`;
  - `dist` is in 8..20;
  - and **recompute U1**.
- family.js:
  - add `chain` to `modules`/`subs`;
  - in `QLOG_REPORT`: `icons.chain = '🔔'`, `subLabel.chain = '連鎖機關'`, `actionFields.chain = ['submits','resets']`, `aidLabel.chainHint = '機關提示'`.
- **Menu card** in Section 2, after topview: 🔔, `<h3>連鎖機關</h3>`, `<p>缺了哪一塊？放進去按啟動，讓鈴鐺響起來！</p>`, badge `id="badge-chain"` with `🔗 因果連鎖與假設驗證`.
- `LOG_BUILD` 3 → 4, with comment `// #52：新增連鎖機關`.
- **Eye-lock condition:** add `&& !chainRunning`.
- **`goHome`:** `clearTimeout(chainTimer); chainTimer = null; chainRunning = false;`.
- **Global names** (fixed; the harnesses call them): `genChain`, `chainSimulate`, `loadChainLevel`, `renderChainScene`, `selectChainCard(slot, index)` (index into canonical `cards[slot]`), `resetChain`, `runChain`, `chainTimer`, `chainRunning`, `chainChoice`, `chainCardOrder`.
- **Rebuild:** run `tools/build_common.py`, then `tools/build_zhuyin.py` with moedict at `C:/Users/aicil/AppData/Local/Temp/claude/F---Coding/c5915076-4999-4ff2-9981-7edc965d2f44/scratchpad/topview/moedict-data/dict-revised.json`.
  - The ZHUYIN DATA diff may only add entries, and `index.html` must stay byte-identical.
  - Render the menu and every other module's view on base and on the branch, and diff the zhuyin output. Existing text must be unchanged.
  - Hand-check these polyphones: 翹 ㄑㄧㄠˋ, 倒 ㄉㄠˇ, 骨 ㄍㄨˇ, 間 (間隔 ㄐㄧㄢˋ / 中間 ㄐㄧㄢ), 得, 了, 一, 重, 把, 還, 著 (if used). List the readings in the report.

## 4. View and behaviour

**DOM** (`#view-chain`, same header pattern as the other views):
- `.prompt-box#chainPrompt`.
- `<svg id="chainScene" viewBox="0 0 640 280">` at width 100%. No words inside the SVG; emoji and ● are fine.
- `#chainCards` has one row per slot, each with an HTML label: `骨牌：`, `球：` or `支點：`. Cards are `<button class="chain-card" id="chain-card-<slot>-<index>" onclick="selectChainCard('<slot>', <index>)">`, where `index` is the canonical index. They are shown in `chainCardOrder`.
  - **Dominoes card:** a small inline SVG preview of that row **at the same scale relative to a drawn ball**, so the reach is comparable, plus an HTML label `N 個・間隔<窄詞>`. The 窄詞 map is gap 1 很窄, 2 窄, 3 中, 5 寬, 6 很寬.
  - **Ball:** `紙球 ●` / `木球 ●●` / `鐵球 ●●●`.
  - **Fulcrum:** `支點靠左` / `支點在中間` / `支點靠右` (arm 1 / 2 / 3).
  - Tapping an already-selected card does nothing.
- Buttons: `#chainReset` (🧹 重來) and `#chainRun` (▶ 啟動).

**Scene geometry** (normative; viewBox px, `U = 12`; checked by `v3.js`):
- **Ledge:** y = 120, x 10..300. A small start flag 🚩 sits at `x0 = 262 − dist·U`, which is ≥ 22.
- **Ball:** r = 14. Its left edge is `BX = 262` and its centre is (276, 106).
- **Dominoes:** 12 × 48 px, standing on the ledge (y 72..120).
  - Domino i has its left edge at `x0 + i·(1 + gap)·U`.
  - A domino falls by rotating 90° about its bottom-right corner, so its top lands 48 px right of that corner.
  - Hit margins:
    - `gap ≤ 3`: it overlaps the next domino by ≥ 12 px;
    - `gap ≥ 5`: it misses by ≥ 12 px;
    - `c ≤ 3`: it overlaps the ball by ≥ 12 px;
    - `c ≥ 5`: it misses the ball by ≥ 12 px.
  - Unfilled dominoes slot: a dashed ❓ box over x0..262, y 72..120.
- **Ramp:** from the ledge end (300, 120) down to the plank's left end in the initial pose. It always slopes down: that end is at y 150–170.
- **Seesaw:**
  - **Plank:** 192 px long. When level it lies at y = 180, x 330..522. Tick marks every 48 px.
  - **Fulcrum:** a triangle with its apex at (330 + arm·48, 180), on a post down to the ground at y = 270.
  - **Tilts** rotate ±12° about the apex:
    - **initial** = right end down, **always**, independent of the cards chosen;
    - `left` = left end down;
    - pass = level.
  - Unfilled fulcrum slot: a dashed ❓ triangle at arm 2, with the plank in its initial pose.
- **Load basket:** hangs under the plank's right end. It is ≤ 50 px tall and holds `load` stacked ● blocks. Its bottom stays ≤ 260 in every pose.
- **Bell track:** a fixed track at y = 180 from x 530 to 600, with 🔔 at about (604, 160). The ball reaches the track only across a **level** plank.
- **Stage groups:** `<g id="chain-stage-dominoes|ball|seesaw|bell">`. The failure highlight is a red rounded `<rect class="chain-fail-hl">` behind the failing group, pulsing via opacity.

**Interaction:**
- `selectChainCard(slot, index)`: set `chainChoice[slot]`, mark the card `.selected` (one per slot), re-render the scene with the component, and play `soundClick()`. Ignore it while `chainRunning`.
- `resetChain()`: clear the choices, re-render, and log `qlogEvent('x','reset')`. Ignore it while running.
- `runChain()`:
  - Return if `chainRunning`.
  - If any slot is empty: `speakText('先把卡片放進問號裡喔！')` and stop. This logs no submit and no wrong.
  - Otherwise: `qlogEvent('x','submit')`, set `chainRunning = true`, disable the cards and buttons, and animate from `chainSimulate`'s result.
- **Animation:**
  - Steps of about 700–900 ms each, ≤ 4 s in total.
  - Every `setTimeout` handle is stored in `chainTimer`.
  - Each step first checks `currentModule === 'chain'`. If not, it stops silently and resets `chainRunning = false`, `chainTimer = null`.
  - The steps:
    1. **Dominoes fall in sequence.**
       - `gap`: the first domino falls and lands in the gap; the rest stand.
       - `short`: all fall; the last lands short of the ball.
    2. **The ball rolls** down the ramp onto the plank's left end.
    3. **The seesaw reacts.**
       - `left`: the plank tips left-down and the ball stays on the left end.
       - `right`: the plank wobbles slightly and stays in its initial pose; the ball stays on the left end. It does not roll back.
       - pass: the plank goes level.
    4. **Pass:** the ball rolls across the plank and track and the bell swings. Then `chainRunning = false; chainTimer = null; triggerVictory('機關成功！', '鈴鐺響了！你讓整個機關動起來了！', isLastQuestion())`. `triggerVictory` already plays `soundSuccess`.
- **On failure:**
  - Show the highlight and play `soundError()`. Store `before = questionWrongAttempts`, then call `onWrongAnswer(text)`.
  - `text`:
    - card product 2: `'停在' + 站名` only;
    - otherwise: `'選了 ' + <the label of the chosen card(s) for the failing stage's slots> + '，停在' + 站名`.
      - Failing at dominoes → the dominoes card label.
      - Failing at seesaw → the ball and/or fulcrum card labels that are slots.
      - Don't name a card from a stage that passed.
    - `站名` is `骨牌` or `翹翹板`.
  - Speak **one** string, because `speakText` cancels the previous utterance. It is the observation, plus a hint when `questionWrongAttempts >= 2 && questionWrongAttempts > before`; also log `qlogEvent('a','chainHint')` in that case.
  - Observations (only what is seen):

    | kind | observation |
    |---|---|
    | gap | `骨牌中間斷掉了！` |
    | short | `骨牌碰不到球！` |
    | left | `翹翹板往球這邊倒下去了！` |
    | right | `翹翹板還是歪向積木那邊，沒有變平！` |

  - Hints:

    | where | hint |
    |---|---|
    | dominoes | `骨牌的間隔不能比骨牌寬，最後一個還要碰得到球喔！` |
    | seesaw, with a fulcrum slot | `點點一樣多，支點放中間；不一樣多，支點要靠近比較重的那一邊喔！` |
    | seesaw, otherwise | `球的點點要跟積木一樣多，翹翹板才會平平的喔！` |

  - After about 1.4 s: back to the initial pose with the choices kept. Remove the highlight, set `chainRunning = false` and `chainTimer = null`, and re-enable the controls.
- **`loadChainLevel()`:**
  - First: clear `chainTimer`, set `chainTimer = null` and `chainRunning = false`, and re-enable the controls.
  - Then reset the choices and shuffle `chainCardOrder`.
  - Set the badge and prompt, render the cards and scene, and end with `speakText(currentQuestion.prompt)`.

**Layout:**
- Landscape (width ≥ 700 and width > height): the scene on the left at about 60% width, with the cards and buttons in a right column.
- Portrait or narrow: the scene full width, with the cards and buttons below.
- At 768×1024 and 1024×768, the scene, all cards and ▶ must be visible at once. At 360 wide, scrolling is allowed; record how much.
- Cards are at least 48 px tall and 44 px wide. Their labels scale with `--fs`.

## 5. Invariants

- **I1:** U1 holds for every generated question, and the validator enforces it.
- **I2:** `chainSimulate` is the only rule implementation; the animation follows its result.
- **I3:** No answer leak before the bell:
  - no DOM attribute or class marks the right card;
  - the initial scene is the same for any selection (apart from the filled component itself);
  - speech, the mistake summary and the wrong text don't reveal the answer;
  - observations describe only what is seen.
- **I4:**
  - A `chain` record is accepted and appears as 連鎖機關, with `build: 4`, `form: 'slots'`, `nOptions` = the card product, and chance = 1/product.
  - `questionKey` doesn't depend on display order.
- **I5:** Leaving mid-run, or the eye lock firing mid-run, never leads to a later victory and never leaves `chainRunning` set or `chainTimer` non-null. Re-entering gives enabled controls.
- **I6:** No behaviour change in other modules (including topview).
- **I7:** `--mute-audio` on every browser launch.
- **I8 (geometry):** for every row card, every arm and every pose:
  - every domino lies within [x0, BX);
  - the hit/miss margins are ≥ 12 px as in §4;
  - the ramp slopes down;
  - the basket stays inside the viewBox;
  - the ball can reach the bell track only when the plank is level.

## 6. Acceptance cases

**Harness:** a Node Playwright script under `C:/Users/aicil/AppData/Local/Temp/claude/F---Coding/c5915076-4999-4ff2-9981-7edc965d2f44/scratchpad/chain/`. Follow `tools/regress/logic_regress.js`: `PLAYWRIGHT_PATH`, `PW_CHANNEL=msedge`, `page.clock`, fake speech, `--mute-audio`.

**Independence:** the harness uses its own §2 rules, U1 and geometry formulas. It calls the page's `chainSimulate` only in C2.

- **C1 Generator:** 3000 questions per difficulty.
  - All pass the validator and the harness's U1. Cards are canonically sorted, and the key set equals `slots`.
  - Variant frequencies are within 40–60%. Easy answers 1/2/3 are each 25–42%.
  - Over normal-dominoes questions, each of the shortcut strategies "largest gap < 4", "most dominoes", "longest row" and "smallest gap" wins ≤ 65%.
  - Distinct `questionKey` count: easy = 9; normal ≥ 150; hard ≥ 150.
- **C2 Rules agreement:** for 500 questions × every card combination, the page's `chainSimulate` and the harness agree on `ok`/`failAt`/`kind`.
- **C3 Correct path** (per difficulty and per variant):
  - The bell rings and the victory shows, with +3 stars.
  - The record has `module`/`sub` `chain`, `build: 4`, `form: 'slots'`, `outcome: 'correct'`, `actions.submits: 1` and `wrongCount: 0`.
  - The controls are enabled on the next question.
  - Double run: `page.evaluate(() => { runChain(); runChain(); })` gives exactly one run and one victory.
- **C4 Empty run:** submits 0, wrongCount 0, no mistake entry.
- **C5 Each failure kind** (gap, short, left, right):
  - During the pause, the highlight shows on the right stage, and the single spoken string equals the observation.
  - After the pause, there is no highlight, the choices are kept, and the controls are enabled.
  - `wrongCount` increments.
  - **Threshold**, with adaptive enabled and not a retry:
    - easy with 2 cards: `questionCountedWrong === true` after 1 wrong;
    - normal-ball: `false` after 1 wrong, `true` after 2.
  - **Mistake card text:**
    - easy with 2 cards: `上次停在翹翹板`;
    - otherwise: `上次選了 …`, naming only the failing stage's cards.
  - The summary contains no answer.
- **C6 Hint:** in normal-ball, two different wrong runs. The second run speaks the observation plus the hint, and `aidCounts.chainHint === 1`. Tapping ▶ or cards during the pause starts no run and adds no wrong and no hint.
- **C7 Retry:** the same question comes back with `source: 'retry'`. A question with the same content but a different display order has the same `questionKey`.
- **C8 Interrupts:**
  - `goHome()` at each animation step: no later victory, `chainRunning === false`, `chainTimer === null`, outcome `abandoned`. Re-entry gives enabled controls.
  - If the eye-care grace period expires mid-run, the lock waits for the run to end.
- **C9 Parent report:** shows `🔔 連鎖機關` and `機關提示`.
- **C10 Geometry (I8):**
  - Render every pooled row card (all 260 card sets) in the real page. Read each domino `<rect>`'s x position from the DOM and check it lies in [x0, BX).
  - For each arm and pose, read the plank and basket transforms and check that the ramp slopes down and the basket stays inside the viewBox.
  - On a pass, the ball element's final x is ≥ 590. On a fail, it stays ≤ 530.
- **C11 Layout:**
  - Viewports: 360×640, 412×915, 768×1024 and 1024×768, at font sizes 1 and 1.5, for every variant (including three fulcrum cards).
  - No horizontal scroll and no overlap; cards are ≥ 48×44.
  - At tablet sizes the scene, all cards and ▶ are visible at once.
  - Save screenshots: the initial screen, mid-run, and each failure kind.
- **C12 Regress:** compare `logic_regress.js` output against an `origin/feat/topview` (fdccd81) worktree.
  - The only allowed differences are `completed.chain: 0`, `build: 4` in new records, and `badge-chain` in `menuBadges`.
  - `montessori_regress.js` output must be byte-identical.
- **C13 Build hygiene:**
  - Rebuilding is idempotent.
  - The zhuyin DATA diff only adds entries, and `index.html` is unchanged.
  - The zhuyin of the existing UI is unchanged.
  - Every Han character in the new view and on the cards has zhuyin.
  - No console or page errors.

## 6b. State in the PR

- Merge after #51.
- Same known limitations as #51: old-version tabs drop records, and the run time counts toward `firstAnswer.dt`.
- Every failed run counts as a wrong answer (the pipes precedent). #19 phase 2 may revisit this.
- Small spaces: hard ball+fulcrum has 7 configs and normal-ball has 3 ("dots = blocks").
- In the dominoes variant, "the longest row whose gaps are narrow" always wins. This is the intended reasoning, and single-attribute shortcuts win only about 50%.

## 7. Implementer rules

- Commit identity: `Arcrek-coder <226868523+Arcrek-coder@users.noreply.github.com>`. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Don't push, don't open PRs, don't touch other worktrees.
- Don't hand-edit the generated FAMILY/ZHUYIN blocks.
- Comments in Traditional Chinese, matching the surrounding style.
- **Report:**
  - SHAs and the harness path;
  - C1–C13 results;
  - regress diff paths;
  - zhuyin additions and readings;
  - screenshot paths;
  - deviations from this plan.

---

## PAUSED (2026-10-20) — pending revision before any dispatch

The user paused #52 until #51 has been play-tested by the kids and the owner has given feedback. Plan audit 3 (Opus) still found 1 High and 4 Medium. Apply ALL of the following before the next audit; precise replacement text is in the audit-3 report summary below.

- **H1 Dominoes pool G definition.** Use the text definition: G = `gap ≥ 5` **and** `0 ≤ c ≤ 3` (G always reaches the ball).
  - Pools: X1 9 / X0 9 / Y1 29 / Y0 56, 103 sets in total.
  - Sampling: family 1/2–1/2, then G-longer with p = 0.3.
  - Audited shortcut rates: maxGap<4 50.0%, most 50.0%, longest = closest-to-ball 49.7%, middle-length 50.3%, reaches-ball 50.0%, smallest gap 50.0%.
  - Replace 260 with 103 everywhere.
  - Add the shortcuts "reaches the ball", "middle length" and "closest to ball" to C1, each ≤ 60%.
  - Note in 6b that X0 has only 9 sets, so those questions repeat more often.
- **M1 Hard ball+fulcrum.** User decision (2026-10-20): **sample the answer arm uniformly first.**
  - arm 1 → load 1, ball cards {2,3};
  - arm 3 → load 3, ball cards {1,2};
  - arm 2 → one of the other 5 configs, uniformly.
  - Add to C1: answer arms each 25–42%.
- **M2 Dominoes hint.** Replace it with `間隔要比一塊骨牌躺下來還短，最後一個也要碰得到球喔！` The rule compares the gap with the domino's height, not its width.
- **M3 Geometry.**
  - Plank: its top surface is the rotation line (y = 180 when level). It is 6 px thick, drawn below that line, and the fulcrum apex touches its underside.
  - Basket: hangs by its top centre from the plank's right-end bottom corner. Width ≤ 36, total height ≤ 44.
  - Bell track: x 548..600 at y = 180.
  - In every pose the basket's x-extent stays ≤ 540 and its bbox stays disjoint from the track, post and ground. Add this to I8/C10.
- **M4 Layout.** At 768×1024 and 1024×768 with fs = 1, everything must be visible without scrolling. At fs = 1.5, vertical scroll is allowed; record how much. The dominoes cards may sit 3-across or stacked, sharing one preview scale.
- **Low:**
  - **L1** Unfilled ball slot: a dashed ❓ circle, r 14, at (276, 106).
  - **L2** A 👉 pushes the first domino.
  - **L3** Each card preview draws its ledge from 🚩 x0 to the ball at BX using `dist`, at a scale shared by all cards.
  - **L4** `chainChoice` holds canonical indices; `chainChoiceValues()` maps them to `{row, ball, arm}`. Labels are joined with '、'.
  - **L5** Allow at most one pending timeout at a time, plus a `chainRunId` token bumped in `loadChainLevel`/`goHome`.
  - **L6** Add a stopper lip at the plank's left end.
  - **L7** Tighten the validator ranges: n 2..7; gap in {1,2,3,5,6}; ball, load and arm in 1..3; no dominoes ⇒ `dist`/`row` null; no duplicate cards.
  - **L8** Selectors: `rect.chain-domino` inside `#chain-stage-dominoes`; read the ball centre via getBBox + CTM.
  - **L9** gap 3 label is 普通, not 中. Add 鈴鐺 ㄌㄧㄥˊ ˙ㄉㄤ to the polyphone list.
  - **L10** Mistake cards of the same variant look identical. Note this in 6b.

**Process when resuming:** apply the items above, then run one fresh full plan audit. Under the user's CLAUDE.md rule this plan has already had 3 rounds, so ask the user before starting that 4th round.
