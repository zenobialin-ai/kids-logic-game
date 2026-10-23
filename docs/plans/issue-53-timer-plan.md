# #53 過關計時（挑戰等級）— 實作計畫 v1

範圍：只改 `logic_game.html`。`common/family.js`、`montessori_math_game.html`、`index.html` 不動（byte-identical）。
行號是寫計畫當下（main 8a3573a）的值，會漂移：**動手前先 grep 函式名確認位置**。
`logic_game.html` 是 **CRLF**：用保留換行的編輯方式，不要用 Git Bash `sed -i`。

## 1. 規格（對應 #53 的預設選項）

| 名詞 | 定義 |
|---|---|
| 挑戰題 | 這一題開題時 `qlogActive.difficulty === 'hard'`（= 當時的 `getActiveDifficulty()`，含自動調整升上來的），且**不是**錯題重做（`retryMistakeId === null`）。 |
| 單關時間 | 這一題的學習紀錄 `activeMs`（`tClose - tOpen - offMs`，已扣掉背景／彈窗／護眼鎖）。在 `qlogClose('correct')` 之後讀。 |
| 整輪時間 | 同一輪（`startModule` 到第 5 關過關）5 關**都是挑戰題**時，5 個單關時間相加。只要有一關不是挑戰題，這一輪就沒有整輪時間。 |
| 最快紀錄 | 每位孩子 × 每個小遊戲（`currentModule`，即選單上的卡片）一筆整輪時間的最小值。 |

顯示：
- 挑戰題過關：過關視窗 `#modalMsg` 下方加一行 `⏱️ 這關花了 42 秒`。
- 第 5 關過關且整輪成立：再加一行 `⏱️ 5 關總共 3 分 20 秒`，接著：
  - 之前沒有紀錄：`🏅 第一次的挑戰紀錄！`
  - 比紀錄快（嚴格小於）：`🎉 比上次更快了！新紀錄！`，並**朗讀**「比上次更快了！新紀錄！」
  - 沒有比較快：不加任何話（不顯示紀錄秒數，避免孩子覺得輸了）。
- 簡單／普通題、錯題重做：完全不顯示時間。
- 家長頁：學習紀錄區下方加「⏱️ 挑戰最快紀錄」區塊（見 §3.5）。

時間格式 `fmtDuration(ms)`：`s = Math.max(1, Math.round(ms / 1000))`；`s < 60` → `${s} 秒`；否則 `${Math.floor(s/60)} 分 ${s%60} 秒`（剛好整分時 `3 分 0 秒` → 寫成 `3 分鐘`）。

## 2. 不變式

- **I1** 計時程式全部包在 try/catch；任何失敗只會「不顯示時間」，不能改變過關、給星、自動調整、下一關的行為。
- **I2** 沒有可用的 `activeMs`（`qlogActive` 為 null、`activeMs` 不是有限數字、或 < 0）時：這一關不顯示時間，而且這一輪**作廢**（`roundTimer.valid = false`），不能拿不完整的加總去破紀錄。
- **I3** 最快紀錄只會變小，不會因為載入、匯入、同步而變大或消失（§3.4）。
- **I4** 非挑戰題的畫面與朗讀，跟 main 完全一樣（回歸 harness 驗證，§5-A1）。

## 3. 改動

### 3.1 狀態（放在 `let qlogRoundId = '';`〔約 3736〕附近）
```js
// #53：這一輪的挑戰計時（只在記憶體；重新整理或中途離開就作廢）
let roundTimer = { id: '', ms: 0, count: 0, valid: false };
```
`startModule()`（約 4133）在設定 `qlogRoundId` 之後：`roundTimer = { id: qlogRoundId, ms: 0, count: 0, valid: !mistake };`

### 3.2 `triggerVictory()`（約 4216）
第一行 `qlogEvent('c', null);` 之前先抓 `const rec = qlogActive;`（`qlogActive` 是 family.js 的全域，`speakText` 已在用）。`qlogClose('correct')` 之後：
```js
const timing = challengeTiming(rec, isLastLevel);   // 不是挑戰題 → null
```
在 `adaptMsg` 的 note 之後、`modal.classList.add('active')` 之前，若 `timing` 不是 null，用 `timing.lines` 每行 append 一個 `<div class="time-note">`（樣式仿 `.adapt-note`）到 `#modalMsg`。
朗讀：`timing.speak` 有值且**這次沒有 adaptMsg** 才 `speakText(timing.speak)`（有 adaptMsg 時它已在念，不要互相 cancel）。

### 3.3 `challengeTiming(rec, isLastLevel)`（新函式，放在 `triggerVictory` 前）
```
try {
  if (retryMistakeId || !rec || rec.difficulty !== 'hard') { roundTimer.valid = false; return null; }
  const ms = rec.activeMs;
  if (!Number.isFinite(ms) || ms < 0) { roundTimer.valid = false; return null; }   // I2
  const lines = ['⏱️ 這關花了 ' + fmtDuration(ms)];
  let speak = '';
  if (roundTimer.id === qlogRoundId) { roundTimer.ms += ms; roundTimer.count++; }
  else roundTimer.valid = false;
  if (isLastLevel && roundTimer.valid && roundTimer.count === ROUND_SIZE) {
    lines.push('⏱️ ' + ROUND_SIZE + ' 關總共 ' + fmtDuration(roundTimer.ms));
    const r = recordBestTime(currentModule, roundTimer.ms);   // 'first' | 'better' | 'same'
    if (r === 'first') lines.push('🏅 第一次的挑戰紀錄！');
    if (r === 'better') { lines.push('🎉 比上次更快了！新紀錄！'); speak = '比上次更快了！新紀錄！'; }
  }
  return { lines, speak };
} catch (e) { console.warn('challengeTiming', e); return null; }
```
注意 `isLastQuestion()` 在錯題重做時也回 true，但錯題重做在第一行就 return 了。

### 3.4 最快紀錄的儲存
- 位置：`userProgress.bestTimes = { [module]: { ms, at } }`（per-child，跟 `completed` 同一個 key `childKey(SAVE_KEY, id)`）。`defaultProgress()`（約 3330）**不加**這個欄位；讀的地方一律 `userProgress.bestTimes || {}`，並檢查 `Number.isFinite(x.ms) && x.ms > 0`，壞值當沒有。
- `recordBestTime(mod, ms)`：比較 → 必要時寫入 `{ ms: Math.round(ms), at: Date.now() }` → `saveToLocalStorage()`。回傳 `'first' | 'better' | 'same'`。
- **匯入／同步（I3）**：`keepLocalSettings(imported, childId)`（約 3983）在現有 adaptive 那行之後合併：對 `local.bestTimes` 與 `imported.bestTimes` 的每個 module 取 `ms` 較小的那筆（壞值忽略），結果寫回 `imported.bestTimes`；兩邊都沒有就不新增欄位。
  - 舊版本的同步碼／匯出沒有 `bestTimes`：合併後保留本機的紀錄。
  - 新版本的進度被舊版本頁面讀到：舊頁面不認得這個欄位，`readProgressForChild` 照樣回傳整個物件，存回時欄位仍在（舊頁面是整包 `JSON.stringify(userProgress)`）→ 不會丟。實作時核對 `saveToLocalStorage`／`readProgressForChild` 確實沒有挑欄位，報告附 file:line。
- 「清空這位孩子的進度」（家長頁既有功能）若是整包重設成 `defaultProgress()`，紀錄跟著清掉，這是預期行為，不另外處理。

### 3.5 家長頁
`#learningLogBox`（約 2435）之後加：
```html
<div class="parent-note" id="bestTimesBox" data-no-zhuyin style="white-space:pre-wrap;"></div>
```
`renderLearningLog()`（約 7863）最後，用 `readProgressForChild(logViewChildId).bestTimes` 填：
```
⏱️ 挑戰最快紀錄（挑戰等級 5 關都完成才會記）
水管接接樂：3 分 20 秒（10/23）
…（依 MODULE_INFO 的順序，只列有紀錄的）
```
沒有任何紀錄時第二行起改為 `還沒有紀錄`。模組名稱用 `MODULE_INFO[mod]` 既有的名稱欄位（grep 確認欄位名）。

### 3.6 LOG_BUILD 與注音
- 有新增朗讀 → `LOG_BUILD` 3 → 4（約 3723），註解 `// #53：挑戰計時（破紀錄會朗讀）`。
  - ⚠ 暫停中的 `feat/chain`（#52）計畫也寫 LOG_BUILD 4。#52 恢復時要改成 5——實作報告要提醒，**不要**動 feat/chain。
- 過關視窗是給孩子看的，會自動加注音。新字（秒、鐘、總、共、錄、紀、第、次、快…）若字典沒有，照 `docs/plans/issue-50-topview-plan.md` 第 21 步跑 `tools/build_zhuyin.py`（moedict clone 到 scratchpad，不進 repo），同樣遵守「DATA diff 只能新增」與多音字人工核對（這次要核：`總共`、`第一次`、`分`〔分鐘〕、`更`、`上次`、`紀錄`）。字典已有就不跑，報告說明怎麼確認的。

## 4. 不做

數學樂園；簡單／普通的任何時間顯示；單關的最快紀錄；在選單卡片上顯示紀錄；改 `common/family.js`。

## 5. 驗收（全部要實跑，報告附數字）

測試環境：只用 `file://` 開頁，Playwright／Edge 一律 `args: ['--mute-audio']`。**不要**跑 `server.js`／`start.bat`。

**A. 回歸**
- A1 `node tools/regress/logic_regress.js` 對 main 與分支各跑一次並 diff。預期：完全相同；若有差異，每一處都要說明是 LOG_BUILD 或計時造成的，且不出現在非挑戰題。
- A2 `node tools/regress/montessori_regress.js` main vs 分支：完全相同。`montessori_math_game.html`、`index.html`、`common/family.js` 與 main byte-identical（`git diff --stat` 證明）。

**B. 行為（Playwright 腳本，放 `tools/regress/` 以外的 scratch 目錄；用假時鐘或 `page.clock` 控制時間）**
- B1 難度設挑戰、自動調整關：水管接接樂 5 關都答對。每關過關視窗有 `這關花了`；第 5 關有 `5 關總共`＋`第一次的挑戰紀錄`；`localStorage` 的進度裡 `bestTimes.pipes.ms` 等於 5 關 `activeMs` 加總（從學習紀錄原始資料核對）。
- B2 再玩一輪且每關更快 → 出現 `新紀錄`，有呼叫 `speechSynthesis.speak`（stub 記錄文字）；`bestTimes.pipes.ms` 變小。
- B3 再玩一輪且比較慢 → 只有 `5 關總共`，沒有紀錄相關文字；`bestTimes` 不變。
- B4 難度普通：5 關過關視窗完全沒有 `⏱️`，`bestTimes` 沒有新增。
- B5 挑戰＋自動調整開，第 2 關刻意答錯到降級（照 `applyAdaptOutcome` 的門檻）→ 降級後的題目沒有時間；第 5 關沒有 `5 關總共`；`bestTimes` 不變。
- B6 從錯題本重做一題挑戰題 → 沒有時間。
- B7 第 3 關時切到背景 10 秒（或開家長設定再關）→ 這關顯示的秒數不含那 10 秒（與紀錄的 `activeMs` 一致）。
- B8 `qlogActive` 為 null 的情況（在測試裡於過關前把它設 null）→ 不顯示時間、該輪無整輪時間、過關流程照常（星星 +3、可以進下一關）。
- B9 匯入合併：本機 `bestTimes.pipes.ms=100000`，匯入的 `bestTimes.pipes.ms=200000` → 保留 100000；反過來保留較小者；匯入資料沒有 `bestTimes` → 保留本機。
- B10 家長頁：B1 之後打開，`#bestTimesBox` 有水管的那一行；換到沒有紀錄的孩子顯示 `還沒有紀錄`。
- B11 `fmtDuration` 單元：0→`1 秒`、59400→`59 秒`、59600→`1 分鐘`、200000→`3 分 20 秒`。

**C. 改壞驗紅**：至少下列 6 種，各自讓 B 的某條轉紅，報告列出對應：
`rec.difficulty !== 'hard'` 改成 `=== 'easy'`；拿掉 I2 的 `roundTimer.valid = false`；`recordBestTime` 的 `<` 改 `<=`；`keepLocalSettings` 合併改成直接用匯入值；`count === ROUND_SIZE` 拿掉；朗讀條件拿掉 `!adaptMsg`（B 需有一條覆蓋：挑戰最後一關同時有 adaptMsg 的情況，若做不出來就在報告說明）。

**D. 畫面**：390×844 與 1024×768 各截一張「第 5 關新紀錄」的過關視窗，確認注音不重疊、不超出視窗。截圖放 scratch，不進 repo（之後由指揮官決定是否放 `pr-assets`）。

## 6. 交付
- 一個 commit（或依邏輯拆 2–3 個），訊息格式照 repo 慣例（`feat: …（#53）`）。git 身分 `Arcrek-coder <226868523+Arcrek-coder@users.noreply.github.com>`。
- **不要 push、不要開 PR。**
- 報告：每條驗收的實跑結果、改壞對照表、注音處理方式、所有判斷點（附 file:line），不確定的標「未驗證」。
