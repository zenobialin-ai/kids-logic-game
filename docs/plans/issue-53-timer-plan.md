# #53 過關計時（挑戰等級）— 實作計畫 v2

v2：併入計畫稽核 r1（ACCEPT WITH FIXES：H1、M1–M6、L1–L7）。

範圍：只改 `logic_game.html`。`common/family.js`、`montessori_math_game.html` 不動（byte-identical）；`index.html` 只允許 `build_zhuyin.py` 重寫後**仍 byte-identical**。
行號是 main 8a3573a 的值，會漂移：**動手前先 grep 函式名確認位置**。
`logic_game.html` 是 **CRLF**：用保留換行的編輯方式，不要用 Git Bash `sed -i`。

## 1. 規格（對應 #53 的預設選項）

| 名詞 | 定義 |
|---|---|
| 挑戰題 | 這一題的學習紀錄 `rec`（`qlogActive`，在 `qlogClose` **之前**抓）滿足：`rec.difficulty === 'hard'`（= 開題時的 `getActiveDifficulty()`，:3831，含自動調整升上來的）、`rec.source` 是 `'first'` 或 `'repeat'`、且不是錯題重做（`retryMistakeId === null`）。 |
| 單關時間 | `rec.activeMs`（`qlogClose → qlogSummarize` 設定，:2904-2918；已扣背景／彈窗／護眼鎖）。 |
| 整輪時間 | 同一輪（`startModule` 到第 5 關過關）5 關**都是挑戰題**，且第 5 關過關當下 `getActiveDifficulty() === 'hard'`（第 5 關途中沒被降級）時，5 個單關時間相加。 |
| 最快紀錄 | 每位孩子 × 每個小遊戲（`currentModule`）一筆整輪時間。比較用**整秒** `Math.round(ms/1000)`，嚴格小於才算新紀錄。 |

不算挑戰題、會讓這一輪作廢的情況：
- **齒輪答錯後換的題**（`source === 'afterDemo'`，:7249-7250 先 `qlogClose('replaced')` 再 `qlogOpen('afterDemo')`）：答錯前想的時間在被換掉的那筆裡，只算新那筆會讓「答錯反而變快」。所以這一關不顯示時間，這一輪作廢。
- 簡單／普通題、錯題重做（`source === 'retry'`）、`rec` 為 null、`activeMs` 不是有限數字或 < 0。

顯示：
- 挑戰題過關：`#modalMsg` 下方加一行 `⏱️ 這關花了 42 秒`。
- 整輪成立（第 5 關）：再加 `⏱️ 5 關總共 3 分 20 秒`，接著：
  - 之前沒有紀錄：`🏅 第一次的挑戰紀錄！`
  - 比紀錄快：`🎉 比上次更快了！新紀錄！`，並**朗讀**「比上次更快了！新紀錄！」
  - 沒有比較快：不加任何話。
- 第 5 關途中被降級：單關時間照常顯示，沒有整輪那幾行。
- 簡單／普通、錯題重做、齒輪換題：完全不顯示時間。
- 家長頁：學習紀錄區下方加「⏱️ 挑戰最快紀錄」區塊（§3.5）。

時間格式 `fmtDuration(ms)`：`s = Math.max(1, Math.round(ms / 1000))`；`s < 60` → `${s} 秒`；`s % 60 === 0` → `${s/60} 分鐘`；否則 `${Math.floor(s/60)} 分 ${s%60} 秒`。

## 2. 不變式

- **I1** 計時相關程式（`challengeTiming`、`triggerVictory` 裡 append DOM 與朗讀那段、`recordBestTime`、家長頁區塊、存檔合併）全部包在 try/catch；任何失敗只會「不顯示時間／不更新紀錄」，不能改變過關、給星、自動調整、下一關的行為。
- **I2** 只要有一關不符合挑戰題，`roundTimer.valid = false`；作廢的一輪不能顯示整輪時間，也不能寫紀錄。
- **I3** 最快紀錄只會變小，不會因為載入、匯入、同步、**多分頁同時存檔**而變大或消失（§3.4）。例外（已知限制）：舊版頁面匯入同步碼會整包換成匯入內容（L2）；刪除孩子會一起刪掉。
- **I4** 非挑戰題的畫面與朗讀跟 main 完全一樣（§5-A1）。

## 3. 改動

### 3.1 狀態（`let qlogRoundId = '';` 約 :3736 附近）
```js
// #53：這一輪的挑戰計時（只在記憶體；重新整理或中途離開就作廢）
let roundTimer = { id: '', ms: 0, count: 0, valid: false };
let lastTiming = null;          // { roundId, level, lines }：同一題又觸發一次 triggerVictory 時沿用
let pendingTimingSpeak = '';    // 齒輪示範完才念
```
`startModule()`（:4133）在設定 `qlogRoundId` 之後：`roundTimer = { id: qlogRoundId, ms: 0, count: 0, valid: !mistake }; lastTiming = null; pendingTimingSpeak = '';`

### 3.2 `triggerVictory()`（:4216）
- 第一行 `qlogEvent('c', null);` **之前**：`const rec = qlogActive;`（family.js 全域，嵌入在 :2679）。
- `qlogClose('correct')` 之後：`const timing = challengeTiming(rec, isLastLevel);`
- 在 `adaptMsg` 的 note 之後、`modal.classList.add('active')` 之前，整段包 try/catch：
  - `timing` 不是 null → `timing.lines` 每行 append 一個 `<div class="time-note">`（樣式仿 `.adapt-note` :1437）到 `#modalMsg`。
  - `timing.speak` 有值且這次沒有 `adaptMsg` → `pendingTimingSpeak = timing.speak; speakText(timing.speak);`
- **齒輪**（:7222-7226）：triggerVictory 之後馬上 `speakText("答對了！我們一起看看齒輪怎麼轉！")` 會把破紀錄那句 cancel 掉。把 `runGearDemo` 的 callback 改成：modal 出現後，若 `pendingTimingSpeak` 有值就 `speakText(pendingTimingSpeak)`。所有念完／不念的路徑都把 `pendingTimingSpeak` 清成 `''`（`startModule`、`nextQuestionOrFinish`、齒輪 callback 念完後）。

### 3.3 `challengeTiming(rec, isLastLevel)`（新函式，放在 `triggerVictory` 前）
```
try {
  // M2：同一題又觸發一次（例如對已 focus 的答案鈕再按 Enter；main 原本就會重複給星，不在範圍內）
  if (!rec && lastTiming && lastTiming.roundId === qlogRoundId && lastTiming.level === currentLevel)
    return { lines: lastTiming.lines, speak: '' };
  if (retryMistakeId || !rec || rec.difficulty !== 'hard' ||
      (rec.source !== 'first' && rec.source !== 'repeat')) { roundTimer.valid = false; return null; }
  const ms = rec.activeMs;
  if (!Number.isFinite(ms) || ms < 0) { roundTimer.valid = false; return null; }
  const lines = ['⏱️ 這關花了 ' + fmtDuration(ms)];
  let speak = '';
  if (roundTimer.id === qlogRoundId) { roundTimer.ms += ms; roundTimer.count++; }
  else roundTimer.valid = false;
  if (isLastLevel && roundTimer.valid && roundTimer.count === ROUND_SIZE && getActiveDifficulty() === 'hard') {
    lines.push('⏱️ ' + ROUND_SIZE + ' 關總共 ' + fmtDuration(roundTimer.ms));
    const r = recordBestTime(currentModule, roundTimer.ms);   // 'first' | 'better' | 'same' | null(失敗)
    if (r === 'first') lines.push('🏅 第一次的挑戰紀錄！');
    if (r === 'better') { lines.push('🎉 比上次更快了！新紀錄！'); speak = '比上次更快了！新紀錄！'; }
  }
  lastTiming = { roundId: qlogRoundId, level: currentLevel, lines };
  return { lines, speak };
} catch (e) { console.warn('challengeTiming', e); return null; }
```
`count === ROUND_SIZE` 與 `valid` 是重複的防線（任一關沒算到時 `valid` 已是 false），保留兩者。

### 3.4 最快紀錄的儲存
- 位置：`userProgress.bestTimes = { [module]: { ms, at } }`（per-child，同 `childKey(SAVE_KEY, id)`）。`defaultProgress()`（:3334）**不加**這個欄位。
- `normBestTimes(x)`：不是 plain object（null、陣列、字串…）→ `{}`；每個 entry 不符合 `Number.isFinite(e.ms) && e.ms > 0` 就丟掉（比照 :4361 `adaptiveTier` 的正規化）。
- `mergeBestTimes(a, b)`：兩邊各自 `normBestTimes` 後，每個 module 取 `ms` 較小的那筆。
- `recordBestTime(mod, ms)`：先 `userProgress.bestTimes = mergeBestTimes(userProgress.bestTimes, 存檔裡的 bestTimes)`；比較 `Math.round(ms/1000)` 與既有 `Math.round(old.ms/1000)`；沒有既有 → `'first'`；嚴格小於 → `'better'`；否則 `'same'`。first／better 時寫入 `{ ms: Math.round(ms), at: Date.now() }` 再 `saveToLocalStorage()`。
- **多分頁（I3）**：`saveToLocalStorage()`（:3366）在 `JSON.stringify` 之前，讀存檔裡的 `bestTimes` 與記憶體 `mergeBestTimes`，結果放回 `userProgress.bestTimes`（兩邊都空就不新增欄位）。只合併 `bestTimes`，其他欄位維持「整包後寫者勝」。
- **匯入／同步**：`keepLocalSettings(imported, childId)`（:3983）在 adaptive 那行之後：`const m = mergeBestTimes(local.bestTimes, imported.bestTimes); if (Object.keys(m).length) imported.bestTimes = m;`
- 舊版頁面讀新資料：`readProgressForChild`（:3482-3487）回傳整個物件、`saveToLocalStorage` 整包 stringify（:3371），欄位會保留（稽核 P6 已實證）。舊版頁面**匯入**同步碼會整包換掉 → 已知限制（I3 例外）。
- 目前沒有「清空進度」的功能（:2430 只是說明文字）；`deleteChild`（:3597-3599）刪 key 時紀錄一起刪掉，預期行為。

### 3.5 家長頁
`#learningLogBox`（:2435）之後加：
```html
<div class="parent-note" id="bestTimesBox" data-no-zhuyin style="white-space:pre-wrap;"></div>
```
`renderLearningLog()`（:7863）最後（自己的 try/catch），用 `normBestTimes(readProgressForChild(logViewChildId).bestTimes)` 填：
```
⏱️ 挑戰最快紀錄（挑戰等級 5 關都完成才會記）
水管接接樂：3 分 20 秒（10/23）
```
依 `MODULE_INFO`（:5294）的順序、名稱用 `MODULE_INFO[mod].title`，只列有紀錄的；沒有任何紀錄時第二行為 `還沒有紀錄`。

### 3.6 LOG_BUILD 與注音
- 有新增朗讀 → `LOG_BUILD` 3 → 4（:3723），註解 `// #53：挑戰計時（破紀錄會朗讀）`。
  - 暫停中的 `feat/chain`（#52，origin 24e6986，計畫 :126 寫 3→4）恢復時要改成 5；連鎖機關走 `triggerVictory`，會自動有計時，它的驗收要加一條挑戰計時。實作報告要提醒，**不要**動 feat/chain。
- 過關視窗會自動加注音（不在 SKIP 清單，:8009）。字典缺「**花**」「**更**」（稽核以頁面內嵌 DATA 檢查），**一定要跑** `tools/build_zhuyin.py`：照 `docs/plans/issue-50-topview-plan.md` 第 21 步（moedict clone 到 scratchpad，不進 repo）。
  - `更` 要是 ㄍㄥˋ（更快）；不對就在腳本的 `MANUAL` 加 `'更快': 'ㄍㄥˋ ㄎㄨㄞˋ'`。
  - DATA diff 只能新增；`index.html` 必須 byte-identical；新增字後比對既有 UI 文字的注音前後是否一致（同 #50 第 21 步的做法）。

## 4. 不做

數學樂園；簡單／普通的任何時間顯示；單關最快紀錄；選單卡片顯示紀錄；改 `common/family.js`；修 main 既有的「重複 triggerVictory 多給星」（報告要提到）。

## 5. 驗收（全部要實跑，報告附數字）

測試環境：只用 `file://` 開頁，Playwright 一律 `args: ['--mute-audio']`，最多同時一個瀏覽器。**不要**跑 `server.js`／`start.bat`。這台機器 Playwright 用 msedge channel（`PW_CHANNEL=msedge`）。

**A. 回歸**
- A1 `node tools/regress/logic_regress.js` main vs 分支，**逐情境比對**。預期差異只有：所有紀錄的 `build` 3→4；情境 3（`pipes hard solved`）的 modalMsg 多出時間那行。main 上本來就失敗的情境（稽核在這台機器看到 9、10、11 timeout）在分支上必須以同樣的錯誤失敗。
- A2 `node tools/regress/montessori_regress.js` main vs 分支：完全相同。`git diff --stat main` 只能出現 `logic_game.html` 與本計畫檔。

**B. 行為**（Playwright 腳本放 scratch 目錄；`page.clock` 控制時間；`speechSynthesis` 用 stub 記錄念的文字）
- B1 挑戰、自動調整關：水管 5 關都答對。每關有 `這關花了`；第 5 關有 `5 關總共`＋`第一次的挑戰紀錄`；`bestTimes.pipes.ms` = 5 筆紀錄 `activeMs` 加總（從學習紀錄原始資料核對）。
- B2 再一輪、每關更快 → `新紀錄`，stub 收到「比上次更快了！新紀錄！」；`bestTimes.pipes.ms` 變小。
- B2g 齒輪版：挑戰 5 關先建立紀錄，再一輪更快 → 示範結束、modal 出現後 stub 最後念的是「比上次更快了！新紀錄！」。
- B3 再一輪比較慢 → 只有 `5 關總共`；`bestTimes` 不變。
- B3b 假時鐘讓兩輪加總**整秒相同** → 第二輪沒有 `新紀錄`。
- B4 普通：5 關都沒有 `⏱️`；`bestTimes` 沒有新增。
- B5 挑戰＋自動調整開：自動調整的連錯計數只在記憶體，**第 1、2 關都要錯到門檻**（各錯 2 次再答對；齒輪與分類錯 1 次就算，照 `applyAdaptOutcome` 實際門檻確認）→ 第 3 關起是普通、沒有時間；第 5 關沒有 `5 關總共`；`bestTimes` 不變。
- B5b 挑戰＋自動調整開，先設 `adaptStreaks[mod] = {correct:0, wrong:1}`，第 5 關錯 2 次再答對 → 第 5 關有 `這關花了`、沒有 `5 關總共`；`bestTimes` 不變。
- B6 錯題本重做一題挑戰題 → 沒有時間。
- B7 第 3 關切到背景 10 秒（或開家長設定再關）→ 顯示秒數不含那 10 秒（與紀錄 `activeMs` 一致）。
- B8 過關前把 `qlogActive` 設 null → 不顯示時間、該輪沒有整輪時間、星星 +3、能進下一關。
- B9 匯入合併：本機 100000／匯入 200000 → 100000；反過來 → 100000；匯入沒有 `bestTimes` → 保留本機；本機 `bestTimes` 是字串、匯入有效 → 用匯入值。
- B10 家長頁：B1 後 `#bestTimesBox` 有「水管接接樂：…」；換到沒紀錄的孩子顯示 `還沒有紀錄`。
- B11 `fmtDuration`：0→`1 秒`、59400→`59 秒`、59600→`1 分鐘`、200000→`3 分 20 秒`。
- B12 挑戰＋齒輪：第 1 關答錯 → 示範 → 換題答對 → 這關沒有 `⏱️`；第 5 關沒有 `5 關總共`；`bestTimes` 不變。
- B13 挑戰題答對後，對已 focus 的答案鈕再按一次 Enter → 時間那行還在；在第 5 關做 → 整輪照常成立、紀錄只寫一次。
- B14 多分頁：同一個 browser context 開兩頁（同一孩子）。A 頁寫入 `bestTimes.pipes`；B 頁（記憶體沒有這欄）執行會存檔的動作（例如 `addStars(1)`）→ 存檔裡的 `bestTimes.pipes` 還在。
- B15 `bestTimes` 損壞成字串或陣列時，挑戰 5 關 → `第一次的挑戰紀錄`，且存檔被修正成正常物件。

**C. 改壞驗紅**（每條要讓列出的 B 轉紅，報告附對照表）
① `rec.difficulty !== 'hard'` → `=== 'easy'`（B4）；② `const rec = qlogActive` 移到 `qlogClose` 之後（B1）；③ `startModule` 不重設 `roundTimer`（B2）；④ 比紀錄 `<` → `<=`（B3b）；⑤ `keepLocalSettings` 直接用匯入值（B9）；⑥ 拿掉 `rec.source` 檢查（B12）；⑦ 拿掉 `getActiveDifficulty() === 'hard'`（B5b）；⑧ 拿掉 `lastTiming` 分支（B13）；⑨ `saveToLocalStorage` 不合併（B14）；⑩ 齒輪 callback 不補念（B2g）。
`count === ROUND_SIZE` 與 I2 的 `valid = false` 互為重複防線，單獨拿掉是**等價突變**，報告註明即可。

**D. 畫面**：390×844 與 1024×768 各截一張「第 5 關新紀錄」的過關視窗，確認注音不重疊、不超出視窗。截圖放 scratch。

## 6. 交付
- commit 訊息照 repo 慣例（`feat: …（#53）`），git 身分 `Arcrek-coder <226868523+Arcrek-coder@users.noreply.github.com>`，結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **不要 push、不要開 PR。**
- 報告：每條驗收的實跑結果、改壞對照表、注音處理、所有判斷點（附 file:line），不確定的標「未驗證」；提到 main 既有的重複給星問題與 #52 LOG_BUILD。
