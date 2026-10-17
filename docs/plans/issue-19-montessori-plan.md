# 實作計畫：數學樂園的多位孩子、共用護眼與學習紀錄（#19）

owner 在 #19 要求：「在新加入的數學樂園，一樣要有排除小朋友用蒙的機制」。
這份計畫把邏輯遊戲已經完成的三件事（R1 多位孩子、R2/R3 學習紀錄＋家長頁）帶到 `montessori_math_game.html`，並讓兩個遊戲**共用**孩子名單、護眼計時和家長頁。
跟 `issue-19-plan.md` 一樣，**第一階段只記錄、不下判定**；判定門檻（第二階段）要等兩個遊戲都有實際資料後再訂。

**基準**：origin/main **822e1ed**。行號只是方便找，**實作時一律先 grep**。
輪次用 **M0、M1a、M1b、M1c、M1d、M2a、M2b、M2c、M3、M4**，不會跟邏輯遊戲的 R1～R3 混淆。
這份計畫（v5）經過 4 輪獨立審查；各輪的處理對照在第 9 節。

**給實作 agent**：先讀第 7 節和「給實作者：每輪細節」的共通規則，再只讀你負責那一輪的小節。一次只做一輪，一輪一個 PR。

---

### 0. 數學樂園目前的狀況（為什麼不能直接加紀錄）

| 項目 | 現況 | 對紀錄的影響 |
|---|---|---|
| 孩子 | 7 個 key（`montessori_mistakes`、`_analytics`、`_diff`、`_stars`、`_stickers`、`_wardrobe`、`_checkin`）全家共用；其中 4 個是物件上固定的 `key:` 屬性（`MistakeBook`、`AnalyticsBook`、`Wardrobe`、`CheckinBook`） | 紀錄分不出是誰 |
| 畫面 | 沒有選單頁，畫面上永遠有一題；啟動時直接 `switchMode(1)`（約 6487 行） | 「開題」「換題」的時間點要自己定；紀錄關掉後題目還在畫面上 |
| 題目狀態 | 沒有 `currentQuestion`，每個題型各自用全域變數；只有挑戰（mode 6）有 `currentChallengeData` | 要寫每個題型的「題目快照」 |
| 作答 | 7 個題型都是 4 選 1；天平（mode 7）另外有 +1／−1 調整，每調一下就自動判斷 | 天平調整的路徑不會記錯題 |
| 答對 | 答對的按鈕**不會停用**：250ms 內連點兩下會記兩次答對、拿兩顆星；過關視窗在答對後 250～500ms 才出現 | 紀錄會重複算；護眼鎖可能在這段空檔觸發 |
| 答錯 | 加減乘除、銀行：答錯的選項會停用。挑戰（mode 6）和天平（mode 7）的選項**不會停用**，挑戰也沒有錯誤音效 | 重複點同一個錯的選項會灌水 |
| 挑戰 mode 6 | 錯題本存的題目文字**已經填好答案**；直式提示會直接露出答案 | 提示要算「直接演出答案」 |
| 錯題本「再練一次」 | `retryMistake(modeId)` 只收題型，出的是**同題型的新題目**，不是同一題 | 跟邏輯遊戲的「再挑戰同一題」意義不同 |
| 語音 | 刻意完全停用（約 3837 行），沒有朗讀 | 不需要語音欄位 |
| 提示訊息 | 沒有 `showToast`；小熊的對話泡泡在每次 `switchMode` 都會被清掉 | 護眼提醒要另外做顯示的地方 |
| 家長 | 沒有家長設定、沒有家長算式；孩子可以清空錯題本 | 家長頁沒有地方放 |
| 生命週期 | 沒有任何 `addEventListener`：沒有 `visibilitychange`、`pagehide`、`storage` | 離開畫面時間、多分頁、離開頁面都要從頭做 |
| 彈出視窗 | 用 `style.display` 開關（不是 `.active`）；貼紙簿、衣帽間、打卡、錯題本、學習分析、過關視窗都放在 `.classroom-work-area` 裡面 | 點擊範圍、離開畫面時間都不能沿用邏輯遊戲的寫法 |
| 注音 | 自己的 `zy()` 和 `ZhuyinMap`（約 690 字，有字串和陣列兩種寫法），`build_zhuyin.py` 刻意排除它 | 新增的中文要自己補進 `ZhuyinMap`；**不可以**把邏輯遊戲的自動注音搬進來（會重複加注音） |
| 護眼 | 沒有 | 邏輯遊戲被鎖住後可以改玩數學樂園 |

---

### 1. 共用程式：`common/family.js`，用 build script 嵌進兩個遊戲

兩個遊戲需要**同一份**：孩子名單、`safeSetItem`、護眼狀態的讀寫與合併、家長算式的出題與檢查、紀錄核心。

- 原始碼放 `common/family.js`（單一來源）。
- `tools/build_common.py` 把它嵌進 HTML 的 `<!-- FAMILY:START -->`～`<!-- FAMILY:END -->` 之間（整段換新），**每個 HTML 仍然單檔可離線開**。嵌入區塊開頭註明「由 tools/build_common.py 產生，請勿手動修改」。
  - 嵌入的 `<script>` 要放在遊戲主程式的 `<script>` **前面**。
  - 要保留原檔的 CRLF，以及數學樂園檔尾沒有換行的狀態，不能造成整檔變動。
- **`family.js` 的規則**：
  - 只放不依賴任何一個遊戲的程式：不碰 DOM、不放畫面文字。畫面由各遊戲自己畫，數學樂園的文字要經過 `zy()`。
  - 兩個 `<script>` 共用同一個全域範圍：**從 `logic_game.html` 搬走的每一個 `let`／`const`／`function` 都要刪掉原本的那一份**，重複宣告會讓整頁變成空白。每輪都要跑「名稱衝突檢查」：把 `family.js` 所有最上層的名稱拿去 grep 兩個 HTML，不可以有重複的 `let`／`const`，也不可以有同名 function 被默默蓋掉。
  - 遊戲才有的東西用 **hook** 接，`family.js` 自己提供不做事的預設值，例如 `familyHooks.freeSpace = () => {}`（數學樂園在 M2c 之前沒有紀錄，`safeSetItem` 寫入失敗時呼叫它不能出錯）。
  - 不呼叫 `Math.random()` 做初始化（會改變載入時亂數的呼叫順序，回歸比對會不一樣）。
  - 原始檔用 LF 存；build 嵌入時轉成目標 HTML 的 CRLF。
- **建置順序**：先 `python tools/build_common.py`，再 `python tools/build_zhuyin.py`（後者需要 pypinyin 和 moedict 資料，沒有的話先問使用者）。
- **檢查**：repo 沒有 CI。每個 PR 都要在說明裡附上「重新 build 後 `git diff --exit-code` 沒有差異」的結果（手動步驟）。

**取捨**（不採用的做法）：
- `<script src="common/family.js">`：比較簡單，但單獨下載一個 HTML 就不能用，跟 #29 的「單頁、離線」原則衝突。
- 兩邊各自複製：會有兩份不同步的程式，之後修 bug 要修兩次。

---

### 2. 孩子與 key

- **孩子名單**：沿用 `little_logic_profiles_v1`（兩個遊戲共用）。寫入一律走 `saveProfiles(mutator)`（讀最新 → 改 → 寫回）。
- **每位孩子的 key**：沿用 slot 規則 `childKey(base, id)`：`c0` 用原本沒有後綴的 key，其他孩子加 `__<id>`。
  - 所以現有的數學樂園進度會變成 c0 的，不用搬資料；退回舊版也還讀得到 c0 的資料（除非家長用了 QM8 的「移給別人」）。**c0 不一定是實際玩數學樂園的那位孩子**，見 QM8。
  - 7 個 key 全部改成每位孩子各一份。4 個物件上固定的 `key:` 屬性改成 getter（`get key() { return childKey('montessori_mistakes', activeChildId); }`）。
- **key 清單集中管理**：`family.js` 裡放 `FAMILY_CHILD_KEYS`，列出兩個遊戲所有「每位孩子一份」的 key base（slot 規則），和 `FAMILY_ID_KEYS`（一律用 ID 的紀錄 key base：`little_logic_qlog_v1`、`montessori_qlog_v1`；跟其他 base 一樣**不含底線**，用的時候一律 base ＋ `'__'` ＋ id）。
  - **掃描順序要保留**：重建掃描的表要維持邏輯遊戲現在的順序（存檔、錯題本、齒輪說明、紀錄，約 2657 行），數學樂園的 key 接在後面。順序會影響重建時 emoji 的分配，改了順序回歸比對就會不一樣。
  - `readProfiles()` 的重建掃描、`deleteChild()` 的清除都改用這兩張表，這樣在邏輯遊戲刪掉孩子，數學樂園的資料也會一起刪掉。
  - 退回舊版網頁時，舊版的 `deleteChild` 和重建掃描不認得 `montessori_*__<id>`，刪孩子會留下沒人用的資料（不影響遊戲，只佔空間）。
- **新增／改名／刪除孩子**：**只在邏輯遊戲的家長設定做**（QM2）。數學樂園只能「換孩子」。
- **目前是誰**：`p.active` 兩個遊戲共用。在一個遊戲換孩子，另一個遊戲**下次載入**才跟著換；已經開著的頁面維持記憶體裡的 `activeChildId`。
- **換孩子的順序（數學樂園）**：先關掉進行中的紀錄（`replaced`）→ 改 `activeChildId` → 把記憶體裡的進度**全部重設成預設值**：`userStars=0`、`unlockedStickerIds=[]`、`currentDifficulty='normal'`、`window.userBonusStars`、`stampedStickers`（`loadDifficulty`、`loadRewardData` 只在 key 存在時才賦值，不重設的話，換到沒有資料的孩子會沿用上一位的難度和貼紙，下一次存檔還會把上一位的貼紙寫進新孩子的 key）→ 重新載入（`loadRewardData`、`loadDifficulty`、`Wardrobe.applyToMascot`、`MistakeBook.updateBadge`、`CheckinBook.updateBadge`）→ `switchMode(currentMode)` 出新題目。
- **別的分頁刪掉目前這位孩子**：數學樂園的 profiles `storage` listener 用上面同樣的順序換人（跟邏輯遊戲一樣：先用名單的 `p.active`，不在名單上才用第一位），但進行中的紀錄用 `abandoned` 關（跟邏輯遊戲一樣）。寫入前一律檢查 `childOnList`。
- **什麼時候出題（`switchMode`）**，所有路徑統一：
  - 啟動：護眼鎖著 → 先鎖，解鎖後才往下；「誰要玩？」開著 → 先問，**選好孩子之前不出題、不開紀錄**；最後才 `switchMode(1)`（目前啟動時直接 `switchMode(1)`，要移到最後）。
  - 換孩子（頭像、家長設定、別的分頁刪掉）：照上面的順序，最後 `switchMode(currentMode)`。
  - 離開太久（`away`）：關紀錄 → 顯示「誰要玩？」→ 選好（就算選同一位）才 `switchMode(currentMode)`。
  - 解鎖（這一頁的家長解鎖，或別的分頁解鎖、`storage` listener 收到）：`switchMode(currentMode)`。

---

### 3. 紀錄：同一份格式，分開存

- **schema**：沿用 `issue-19-plan.md` 第 2 節的 schema v1。
  - 數學樂園的紀錄加 `game:'montessori'`。**邏輯遊戲的紀錄不加這個欄位**（沒有 `game` 就是邏輯遊戲），所以邏輯遊戲的紀錄格式完全不變。
  - `build`：**每個遊戲各自一個**（`qlogConfig.build`）。邏輯遊戲維持 2；數學樂園從 1 開始，之後只有改到數學樂園出題、作答的 PR 才 +1。
- **key**：數學樂園的紀錄存 `montessori_qlog_v1__<id>`，**不可以**放進 `little_logic_qlog_v1__*`。key 的組法跟邏輯遊戲的 `qlogKey` 一樣：base（`little_logic_qlog_v1`／`montessori_qlog_v1`，不含底線）＋ `'__'` ＋ id。
- **紀錄的「格式表」放在 `family.js`，依 key 查，不依目前在哪個遊戲查**：

```js
QLOG_GAMES = {   // 只有資料；每個遊戲的上限也放這裡，是唯一的來源
  little_logic_qlog_v1: { game: 'logic',      modules: [...], subs: [...], maxPerSub: 30, total: 1000000, perChild: 400000 },
  montessori_qlog_v1:   { game: 'montessori', modules: [...], subs: [...], maxPerSub: 30, total: 400000,  perChild: 150000 },
}
```

  邏輯遊戲原本的 `QLOG_SUBS`、`MODULE_INFO` 的 key 清單、`QLOG_KEY_BASE`、`QLOG_TOTAL_BUDGET`、`QLOG_MAX_PER_CHILD` 改成從這裡取（例如 `const QLOG_SUBS = QLOG_GAMES.little_logic_qlog_v1.subs`），因為搬進 `family.js` 的 `isValidLogRecord`、`qlogEvict`、`qlogBudget` 都要讀它們。

  `qlogLoad(base, id)` 一律用那個 base 的格式表檢查。否則在邏輯遊戲執行 `freeSpaceHook`（兩個遊戲的紀錄都砍一半）時，會用邏輯遊戲的規則檢查數學樂園的紀錄，全部當成格式錯誤刪掉；家長頁一起看兩個遊戲時也一樣。
- **紀錄核心搬進 `family.js`（M2a）**，遊戲專屬的部分用設定物件接：

```js
qlogConfig = {
  base,                     // 這個遊戲寫入的 key base
  build,                    // 這個遊戲的 LOG_BUILD
  tab,                      // 分頁 id，由遊戲自己產生（logic 維持原本的 qlogTab = Math.random() 位置）
  buildOpen(source),        // 回傳這一題的 module/sub/qk/summary/form/nOptions/p/difficulty 等
  isOff(),                  // 目前是否算「離開畫面」
  actionsTemplate,          // 例如 logic {submits,resets,rotations,commands}、montessori {steps}
  countAction(type, data),  // x 事件要累加哪個欄位
  onAnswerEvent(r, type),   // 答題事件的遊戲專屬處理（logic：answeredDuringPrompt 用 speechSpeaking；montessori：不做事）
}
```

  `qlogEvent` 目前直接讀邏輯遊戲的 `speechSpeaking`（約 3259 行），在數學樂園會丟例外，那一筆事件就記不進 `ev`；所以要改成透過 `onAnswerEvent`。
- **M2a 搬什麼、留什麼**（實作時以這張表為準）：

| 搬進 `family.js` | 留在 `logic_game.html`（組成 logic 的 `qlogConfig`） |
|---|---|
| `QLOG_MAX_EV`、`QLOG_RECOVER_MS`、`QLOG_HEARTBEAT_MS`、`QLOG_SOURCES`、`QLOG_OUTCOMES`、`QLOG_EVENT_TYPES`、`QLOG_GAMES`（取代 `QLOG_KEY_BASE`、`QLOG_MAX_PER_SUB`、`QLOG_TOTAL_BUDGET`、`QLOG_MAX_PER_CHILD`） | `LOG_BUILD`、`QLOG_SUBS`（從 `QLOG_GAMES` 取）、`QLOG_HINT_GRADE`、`MODULE_INFO`（模組的圖示、名稱；key 清單要跟 `QLOG_GAMES` 的 `modules` 一致） |
| 狀態：`qlogActive`、`qlogOff*`、`qlogEvicting`、`qlogWriteFailed` | `qlogTab` 的產生（`Math.random()`，位置不動）、`qlogRoundId` |
| `fnv1a`、`qlogId`、`qlogKey(base, id)`、`qlogLoad`、`qlogBudget`、`qlogEvict`、`qlogSave`、`qlogSaveRecord`、`qlogFreeSpace`、`qlogOffTick`、`qlogIsOff`（改呼叫 `isOff()`）、`qlogEvent`、`qlogCountAction`、`qlogGameWrong`（M3 數學樂園也要用）、`qlogSummarize`、`qlogClose`、`qlogRecover`、`qlogHeartbeat`、`isValidLogRecord`（改用 `QLOG_GAMES[base].modules`／`subs`，不再讀 `MODULE_INFO`） | `qlogOpen` 讀遊戲狀態的部分（→ `buildOpen`）、`qlogFirstSeen`、`qlogSub`、`qlogForm`、`qlogNOptions`、`qlogChance`、`qlogMinActions`、語音相關（`speechCurrent`、`getZhVoices`、`qlogZhVoiceCount`、`qlogSpeechEvent`、`cancelSpeech`） |
| | click／pointerdown capture、`MutationObserver`、`pagehide`／`pageshow` 的掛法（各遊戲的 DOM 不同） |

  表上沒列到的符號，實作時先 grep 看依賴，依「有沒有讀遊戲狀態」歸類，並在 PR 說明列出來。
  - `qlogLoad(childId)` 改成 `qlogLoad(base, childId)`，`qlogBudget`、`qlogEvict` 也要知道 base。**所有呼叫處都要改**（邏輯遊戲目前約 3155、3167、3198、3293、7143、7245 行，實作時 grep `qlogLoad(`），PR 說明逐一列出改了哪些呼叫。
- **`module` 欄位**：數學樂園用 `add`、`sub`、`mul`、`div`、`bank`、`challenge`、`balance`。

- **數學樂園的子題型（10 組）與題目識別 `qk`**：

| sub | 題型 | `qk`（再經過 `qlogId` 雜湊） |
|---|---|---|
| `add` | ➕ 加法 | `add:<addA>+<addB>` |
| `sub` | ➖ 減法 | `sub:<subTotal>-<subTake>` |
| `mul` | ✖️ 乘法 | `mul:<mulNum>x<mulCount>` |
| `div` | ➗ 除法 | `div:<totalBeads>/2` |
| `bank.add`、`bank.sub` | 🏛️ 銀行（依 `bankOperation`） | `bank:<A>op<B>`；`bankCarrying` 記在 `difficulty` |
| `challenge.add`、`challenge.sub`、`challenge.muldiv` | 🏆 挑戰（依 `currentChallengeData.category`：萬以內加法 → add、萬以內減法 → sub、千位乘法／千位除法 → muldiv；實作時先 grep 確認實際的 category 字串） | `challenge:<formulaText>` |
| `balance` | ⚖️ 天平 | `balance:<左邊各部分>=<右邊底數>+?` |

- **第一次遇到（`first`）**：同一位孩子、同一組在保留的紀錄裡沒有相同 `qk`；有的話是 `repeat`。
- **從錯題本「再練一次」**：出的是新題目，所以 source 照樣用 `first`／`repeat`，另外記 `via:'mistakeBook'` 和 `mistakeId`。（不用 `retry`，因為邏輯遊戲的 `retry` 是「再做同一題」，意義不同，第二階段統計會混在一起。）`retryMistake` 要改成收 mistake id，透過一個暫存變數（像邏輯遊戲的 `retryMistakeId`）傳給下一次開題。
- **開啟／結束**：

| 開啟 | 結束 → outcome |
|---|---|
| 每個 `init*` 出題完成時，在函式結尾呼叫同一個 helper（`qlogBeginQuestion()`）：如果還有開著的紀錄，先用 `replaced` 關掉（跟邏輯遊戲約 3205 行一樣），再開新的。銀行切加減／進位、挑戰切類型會直接呼叫 `init*`、不經過 `switchMode`，所以 helper 一定要放在 `init*` 裡 | 答對（第一次）→ `correct` |
| | 切題型、換難度、銀行切加減或進位、挑戰切類型、按「再來一題」時紀錄還開著 → `replaced` |
| | 換孩子 → `replaced` |
| | 護眼時間到被鎖 → `locked` |
| | 離開太久回來（「誰要玩？」開著、而且有 2 位以上孩子，跟邏輯遊戲的條件一樣）→ `away` |
| | 分頁被關掉或按「回遊戲大廳」離開 → `pagehide` 只存檔不關；下次載入復原成 `unload`（跟 R2 一樣） |

  - **已經關閉的紀錄再關、再記事件都不做任何事**（R2 的通用規則）。
  - **數學樂園沒有選單頁**：除了答對以外，每一種「關閉」之後都要出新題目（會開新紀錄），時間點照第 2 節「什麼時候出題」：解鎖後、換孩子後、`away` 後選好孩子時。否則題目還在畫面上，孩子作答卻沒有被記錄。
- **答錯**：記 `w`。
- **`p`（純猜答對的機率）與 `form`**：
  - 7 個題型第一次作答都是 4 選 1 → `p = 1/4`、`form` 不設、`nOptions:4`。`p` 只看第一次作答，之後選項變少不影響。
  - 天平：`firstAnswer` **只看選項點擊**，另外記 `firstAnswer.stepsBefore`（第一次點選項之前按了幾次 +1／−1）。
    - `buildOpen` 開題時先設 `p:0.25`；第一次點選項時才知道 `stepsBefore`，那時候再覆寫 `p`。
    - `stepsBefore > 0` 時 `p:null`：按 +1／−1 會看到天平往哪邊倒，調到答案時數字還會變綠色（約 4640 行），這時候再點選項就不是純猜，1/4 會高估。
    - 完全只用 +1／−1 調到平衡：`firstAnswer:null`、`form:'stepper'`、`p:null`。這部分在 **M2b 就要做**（不然 build 1 的天平紀錄會把「調出來的答案」記成 `p:0.25` 的答對）；調整次數 `actions.steps` 在 M3 才記。
- **輔助（`aids`）**：
  - 點串珠數數（`onBeadTouch`）→ `beadCount`。這是蒙特梭利**本來就要孩子做的操作**，不是提示；第二階段不能把它當成扣分的輔助。要記在 `onBeadTouch` 開頭，因為音效關掉時它會直接 return（約 3922 行）。
  - 挑戰的直式提示 → `verticalHint`（分級 `r`：直接露出答案），只在「隱藏 → 顯示」時記一次（換題時已經會重設成隱藏，約 5587 行）。
- **點擊 `t`**：capture 階段 `click`，範圍是 `#gameContent`（天平的 +1／−1 也在裡面）。**不可以**用 `.classroom-work-area`，因為貼紙簿、衣帽間等視窗都在它裡面。
- **離開畫面時間 `offMs`**：切到背景＋彈出視窗（`#modalOverlay` 顯示中）＋護眼鎖住。用 `MutationObserver` 監看 `#modalOverlay` 的 `style` 屬性和鎖定畫面，不要用每秒輪詢。
- **上限**：
  - 數學樂園的紀錄：每組 30 筆；所有孩子合計 **400K 字元**；每位孩子 `min(150K, 400K ÷ 孩子數)`。數學樂園一筆約 0.5～0.8K，10 組存滿約 210K，所以會先碰到容量上限、從筆數最多的那一組刪最舊的。
  - 邏輯遊戲維持 1M。兩個遊戲的紀錄合計 1.4M；加上邏輯遊戲錯題本（≤400K）和數學樂園其他資料（每位孩子每年約 30K）→ **約 2.0M 字元以內**，仍在保守估計的 2.5M（Safari 以 UTF-16 bytes 計）之內，但餘裕變小（QM6）。
  - `freeSpaceHook` 改成兩個遊戲的紀錄都砍一半（各自用自己的格式表檢查，見上面）。
- **只有數學樂園會復原數學樂園的紀錄**：別的分頁還開著、或還沒被復原的 `outcome:null` 紀錄，家長頁跟 R3 一樣只算在「進行中」。

---

### 4. 護眼與家長設定（數學樂園）

- **共用護眼狀態**：`little_logic_eyecare_v1`，讀寫、跨分頁合併都用 `family.js` 的同一份程式。目前的 `mergeStoredEye` 會直接改全域變數（`eyeState`、`eyeOverSince`、`eyeWarned`），搬進 `family.js` 時改成純函式 `mergeEye(local, stored) → { state, reset }`，由各遊戲自己更新自己的變數。兩個遊戲加起來算時間；任何一邊鎖住，另一邊也鎖住（兩邊都有 `EYE_KEY` 的 `storage` listener）。
  - 兩個遊戲**同時**顯示在螢幕上（分割畫面）時，合併規則取兩邊的最大值，算的是「看螢幕的實際時間」，這是合理的。
  - 預設是**開啟、20 分鐘**，而且邏輯遊戲現有的設定會直接套用到數學樂園（QM7）。
- **「離開時間」key 共用**：`little_logic_last_seen_v1` 是整台裝置共用的。`markSeen`、`lastSeenAt` 搬進 `family.js`，數學樂園在切到背景時也要呼叫 `markSeen()`（M1d），不然孩子玩數學樂園超過 10 分鐘再回到邏輯遊戲，會被誤判成「離開太久」。
- **什麼時候算時間**：頁面在前景、`#modalOverlay` 沒有顯示、沒有鎖住。數學樂園沒有選單頁，所以只要在題目畫面就算。
- **時間到**：跟邏輯遊戲一樣有寬限期（讓孩子做完這一題）。寬限期滿後，要等「沒有在等過關視窗」才鎖：
  - 新增 `successPending` 旗標：答對時設成 true，過關視窗關掉時設回 false。過關視窗在答對後 250～500ms 才出現，只看視窗會漏掉這段空檔，計時器可能先鎖住，接著過關視窗又跳出來、還多給一顆星。
  - 過關視窗有三種關法（「再來一題」、✕、點背景，約 2422、2611 行），都要把 `successPending` 設回 false。可以在 `closeModal()` 裡重設這個旗標，但 **`closeModal()` 不可以呼叫 `switchMode`**（`switchMode` 會呼叫 `closeModal`，會無窮遞迴）。
  - 鎖的順序：關掉進行中的紀錄（`locked`）→ `closeModal()` → 顯示鎖定畫面。解鎖後 `switchMode(currentMode)` 出新題目。
- **鎖定畫面**：沿用邏輯遊戲的樣式（HTML、CSS 複製一份到數學樂園，文字經過 `zy()`）和家長算式。`setPageInert` 的範圍改成數學樂園的區塊（`header`、`.nav-tabs`、`.classroom-work-area`、`.teacher-bear-station`）。
- **提醒方式**（QM1）：只顯示文字、不朗讀。數學樂園要新增一個簡單的提示框（像邏輯遊戲的 `#toastBox`），不要用小熊的對話泡泡（換題時會被清掉）。
- **家長設定**（新的 ⚙️ 按鈕，放在頂端按鈕列）：先過家長算式，裡面有：
  - 護眼時間開關與分鐘數（跟邏輯遊戲共用同一個設定）
  - 換孩子（下拉選單）＋「新增或刪除孩子請到小小邏輯探險家的家長設定」
  - 「清空錯題本」（QM5：從孩子那邊的錯題本移過來，只清目前這位孩子）
  - 📊 學習紀錄（M4）
- **注音**：新增的中文（鎖定畫面、孩子選單、提示框）要補進 `ZhuyinMap`。用一段 script 檢查：把新程式碼裡傳進 `zy()` 的中文字全部抽出來，確認都在 `ZhuyinMap` 裡（要考慮字串和陣列兩種寫法；`zy("…" + x)` 這種組字串的，固定的部分也要檢查）。孩子的自訂名字不經過 `zy()`。家長設定整區不用注音。

---

### 5. 不在這份計畫範圍（另外開 issue）

- 天平的難度標籤跟實際範圍不符（「普通」寫 10 以內，實際出 11～19；簡單、挑戰也不準）。標籤是加減乘除和天平共用的，要改成依題型顯示。
- 每日打卡沒有上限（每年約 16K）。
- 打卡送的 2 顆獎勵星只存在記憶體，重新整理就不見，也不會被花掉。
- 學習分析的貼紙數讀到不存在的變數（`userUnlockedStickers`），顯示的是估計值。
- 音效開關只管串珠的聲音。
- 數學樂園的進度不能跨裝置同步（邏輯遊戲可以）。

---

### 6. 回歸測試工具（這個 PR 一起提供）

M1a 和 M2a 會改動邏輯遊戲現有的程式，必須證明行為完全不變；M1b 以後會改動數學樂園現有的程式。之前 R1～R3 的測試 script 都放在 repo 外面，已經不存在，所以這次把回歸工具放進 repo，**跟這份計畫放在同一個 PR，M1a 開始前就要 merge**。

- `tools/regress/logic_regress.js`（Node + Playwright）：
  - 每個情境都用 `page.clock.install({ time: 固定值 })`，用 `runFor`／`fastForward` 推進時間，`Date.now` 和 `performance.now` 都是固定的；`Math.random` 換成固定種子的亂數。
  - 跑 12 個固定情境（見下），每個情境結束時把所有 `localStorage` 讀出來。
  - 所有 id（孩子、紀錄、`round.id`、錯題本的 id 和紀錄裡的 `mistakeId`、`tab`）依第一次出現的順序換成固定代號。時鐘是固定的，所以時間欄位**預設不遮**（可以抓到計時改變）；`REGRESS_MASK=1` 才遮。
  - 假的語音會觸發 `onstart`／`onend`（依文字長度），`cancel()` 會觸發 `interrupted`，所以「朗讀中作答」的路徑也有測到。
  - 輸出一個 JSON。比對方式：用 `git worktree` 把 main 放到另一個資料夾，兩邊各跑一次，`diff` 兩個 JSON 必須完全相同。同一個檔案連跑 3 次結果也要完全相同。
- 12 個情境：
  1. 規律題答錯兩次再答對；換難度；自動調整升級
  2. 齒輪：提示、示範換題、再挑戰答錯
  3. 迷宮和水管（含漏水）
  4. 錯題本：再挑戰一題
  5. 新增第二位孩子、切換、在第二位孩子玩一題、刪除第二位孩子
  6. 護眼：用 `addInitScript` 種入 `limitMin:10`、`usedMs` 差 5 秒到 10 分鐘（護眼時間只能設 10／15／20／30 分鐘），推進時間到鎖住（含 3 分鐘寬限期）、家長解鎖
  7. 沒有孩子名單、只有孩子的資料 key 時，重建名單
  8. 儲存空間快滿時答一題（`freeSpaceHook` 把紀錄砍一半）
  9. 兩個分頁：一邊鎖住另一邊也鎖、一邊解鎖另一邊也解鎖
  10. 分頁關掉後，由新分頁把那一筆紀錄復原成 `unload`
  11. 一個分頁刪掉另一個分頁正在用的孩子（被刪的孩子先拿到星星，確認另一個分頁換人後有重新載入進度）
  12. 4 位孩子、一位孩子某一組有 35 筆紀錄（超過每組 30 筆和每位孩子的容量），答一題後看刪掉幾筆
  兩個分頁之間的 `storage` 事件不跟著假時鐘走，工具會等到事件生效再往下；情境 8 的結果跟瀏覽器的容量有關，main 和分支要用同一個瀏覽器比對。
  另外情境 4 會在題目中打開視窗、切到背景（`offMs`），情境 5 的第二位孩子會先留下錯題和齒輪說明的 key 再刪除。
- `tools/regress/montessori_regress.js`（**M0 建立**）：數學樂園的回歸，一位孩子，7 個題型各答錯一次、答對一次，加上貼紙、換裝、打卡、錯題本再練一次；輸出所有 `montessori_*` key（遮掉時間）。M0 merge 後的結果就是之後 M1b～M3 的比對基準。
- 用法寫在檔案開頭的註解。工具本身不進遊戲、不影響網頁。
- **讀結果的方法**（輸出約 290KB，相當於 9 萬 tokens，比整個 context 的一半還多）：**不要 `cat` 整個 JSON**。先 `cmp main.json branch.json`；有差異才 `diff main.json branch.json | head -40` 看前面幾行。
- **它能證明什麼、不能證明什麼**：審查時故意改壞了 15 個地方（刪孩子漏刪 key、護眼合併、離開時間、空間不足、重建名單、朗讀中作答、復原、離開畫面時間、紀錄上限等），工具全部抓得到（清單在 PR 說明）。它涵蓋的是上面這些情境；天平、積木、推理、摺紙、瑞文、找不同沒有涵蓋，改到這些題型時要另外測。

---

### 7. 輪次總覽與合併順序

| 輪 | 內容 | 改哪些檔 | 依賴 | 預估 tokens |
|---|---|---|---|---|
| **M0** | 數學樂園修正（答對後全部停用、挑戰／天平答錯停用、挑戰錯題本不存答案、錯題本數字）＋建立 `tools/regress/montessori_regress.js` | montessori、tools | 計畫 PR | 約 35K |
| **M1a** | 建立 `common/family.js`、`tools/build_common.py`；搬入孩子名單、`safeSetItem`、key 表、護眼狀態讀寫（`mergeEye` 純函式）、家長算式的出題與檢查；`familyHooks`。紀錄核心這輪不搬。邏輯遊戲行為完全不變 | common、tools、logic | 計畫 PR（可以跟 M0 同時做：兩輪改的檔案不重疊） | 約 55K |
| **M1b** | 數學樂園：7 個 key 每位孩子一份、啟動流程（`switchMode(1)` 移到最後）、換孩子的順序、profiles listener | montessori | M0、M1a | 約 40K |
| **M1c** | 數學樂園：孩子頭像、「誰要玩？」、⚙️ 家長設定（家長算式、換孩子、清空錯題本、QM8 移給別人）、補注音 | montessori | M1b | 約 40K |
| **M1d** | 數學樂園：護眼（計時、寬限、`successPending`、鎖定畫面、提示框、解鎖、兩邊互鎖、`visibilitychange`、家長設定裡的護眼設定） | montessori | M1c | 約 45K |
| **M2a** | 紀錄核心搬進 `family.js`（第 3 節的搬／留表、`QLOG_GAMES`、`qlogConfig`）。邏輯遊戲的紀錄格式和行為完全不變 | common、logic | M1a | 約 55K |
| **M2b** | 數學樂園紀錄（一）：`qlogConfig`、10 組子題型、題目快照、`qlogBeginQuestion`、所有開啟／結束、答錯、答對、`p`／`form`、`via:'mistakeBook'` | montessori | M1d、M2a | 約 45K |
| **M2c** | 數學樂園紀錄（二）：點擊 `t`、`offMs`（`MutationObserver`）、`pagehide`、復原、心跳、上限、`freeSpaceHook` | montessori、common | M2b | 約 40K |
| **M3** | 紀錄細節：串珠數數、直式提示、天平 +1／−1 和 `stepsBefore`；數學樂園 `build` +1 | montessori | M2c | 約 30K |
| **M4** | 家長頁：兩個遊戲的紀錄放在同一個報告（依遊戲分段），兩個遊戲的家長設定都看得到 | common、兩個遊戲 | M3 | 約 40K |

每一輪都照 R1～R3 的流程：實作 → 沒有上下文的獨立審查 → 修正 → 再審查 → merge。
任何一輪做到一半超過 65K tokens，就停下來把剩下的部分拆成下一輪，在 PR 說明寫清楚做到哪裡。

### 8. 待決問題（請 owner 拍板；先照建議的預設值動工）

- **QM1 數學樂園的護眼提醒要不要朗讀？** 建議**不要**，只顯示文字：數學樂園原本就刻意停用語音。代價：孩子不識字時要靠家長說明。
- **QM2 新增、刪除孩子要不要兩個遊戲都能做？** 建議**只在邏輯遊戲做**，數學樂園只能換人。代價：家長要到另一個遊戲管理名單；好處是少一份要維護的畫面。
- **QM3 難度要不要每位孩子各自記？** 建議**要**：哥哥姊姊和弟弟妹妹適合的難度不同。
- **QM4 每日打卡要不要每位孩子各自記？** 建議**要**。
- **QM5 「清空錯題本」移到家長設定？** 建議**要**：目前孩子可以自己清掉錯題本，紀錄和錯題本就對不起來。
- **QM6 兩個遊戲合計的紀錄上限 1.4M 字元可以嗎？** 建議可以；如果之後 #29 再加新遊戲，要再檢討總量（`zenobialin-ai.github.io` 底下所有 repo 共用同一份儲存空間）。
- **QM7 護眼時間：**
  - (a) 兩個遊戲一起算，而且直接套用邏輯遊戲現有的設定（預設開啟、20 分鐘）？建議**是**。代價：只玩數學樂園的家庭會第一次看到護眼鎖；原本設 20 分鐘的家庭，現在是兩個遊戲合計 20 分鐘。
  - (b) 在衣帽間、貼紙簿裡的時間要不要算？建議**不算**，跟邏輯遊戲一樣「有彈出視窗時不算」。代價：孩子一直待在衣帽間就不會被鎖。
- **QM8 現有的數學樂園進度要給哪位孩子？**
  - 預設給名單上的第一位（c0），不跳出任何詢問，孩子自己玩時不會被擋住。
  - ⚙️ 家長設定裡放一個「把數學樂園的進度移給…」按鈕：選一位孩子，把 **7 個 key 全部**（星星、貼紙、換裝、錯題本、學習分析、難度、打卡）從目前這位搬過去。
  - 目標孩子已經有數學樂園的資料時，不合併，要先確認「會覆蓋 ○○ 的進度」。「有資料」的意思是星星 > 0、或有貼紙、錯題、打卡紀錄（第一次載入自動產生的預設值不算）。
  - 學習紀錄（`montessori_qlog_v1__<id>`）**不搬**：每一筆都記著當時的 `childId`。
  - 搬的時候如果另一個數學樂園分頁正開著 c0，它下次存檔會把星星寫回 c0。所以搬完要顯示「請關掉其他開著數學樂園的分頁」。
  - 搬過去之後，退回舊版的網頁就看不到這些進度了（舊版只讀 c0 的 key）。
  - 建議用這個做法，不在啟動時詢問。
- **QM9 關掉過關視窗（✕）後要不要直接出下一題？** 建議**不要**，維持現在的樣子（可以回頭看一下剛剛的題目）。M0 讓答對後所有選項停用，已經擋住重複答對。

### 9. 審查處理對照

- **audit1 → v2**：抽共用程式和數學樂園各拆成兩輪；回歸測試寫成可以執行的規格；非答對的關閉之後要出新題；啟動時「誰要玩？」之前不出題；`successPending`；兩個遊戲各自的 `build`；邏輯遊戲的紀錄不加 `game`；點擊範圍改成 `#gameContent`；錯題本再練一次改記 `via:'mistakeBook'`；新增 QM7～QM9；天平只看選項點擊；`qk` 逐組寫清楚；家長頁要處理 `outcome:null`。
- **audit2 → v3**：回歸工具改用 `page.clock`、護眼情境改用 10 分鐘、所有 id 換成固定代號；紀錄格式表依 key 查（避免一個遊戲刪掉另一個遊戲的紀錄）；`qlogEvent` 不再直接讀 `speechSpeaking`，改用 `onAnswerEvent` 等 hook；M2a 列出搬／留表；`familyHooks.freeSpace` 預設值、`mergeEye` 純函式、名稱衝突檢查；統一「什麼時候出題」；`qlogBeginQuestion` 放在每個 `init*` 結尾；天平 `stepsBefore`；M1b、M2b 再各拆一輪；QM7 加上衣帽間時間、QM8 改成家長設定裡的按鈕；數學樂園回歸工具；`closeModal` 可以重設旗標但不能出題；別的分頁刪掉孩子用 `abandoned`。

- **audit3 → v4**：回歸工具補上離開畫面時間、朗讀中作答、重建名單、空間不足、兩個分頁、刪孩子時的錯題和齒輪說明 key（審查時改壞的 10 個地方都要抓得到），時間欄位預設不遮；`QLOG_GAMES` 成為上限和子題型的唯一來源，`qlogLoad` 等改簽名要列出所有呼叫處；換孩子時把記憶體裡的進度重設成預設值；「離開時間」key 搬進 `family.js`；`parseEyeState` 的依賴補齊；讀回歸結果不要整個印出來；改到 `common/` 的輪次兩個回歸工具都要跑；天平的 stepper 判斷提前到 M2b；QM8 補上「有資料」的定義、紀錄不搬、多分頁提醒。

- **audit4 → v5**：回歸工具再補上「離開時間」key、紀錄上限與每組 30 筆、換孩子時重新載入進度（審查時新改壞的 5 個地方也要抓得到）；家長算式只搬純邏輯（`gateNew`、`gateCheck`），`onclick` 叫到的函式不改名；數學樂園的「離開太久」放進 M1d；紀錄 key 表不含底線、掃描順序保留；`isValidLogRecord`、`qlogGameWrong` 明確列入搬移；M2c 不重寫上限程式。

---

## 給實作者：每輪細節

**共通規則**
- 整個 context window 約 131K；每輪目標 ≤80K tokens。**不要讀整個檔案**：先 `grep -n`，再用 `sed -n` 讀需要的範圍。
- **搬程式碼一律用 `sed -n '起,迄p'` 之類的指令整段搬**，不要重新打一遍。
- 測試用 Node 寫 Playwright script，一次跑完一個情境、只回傳 ≤500 字的 JSON；點擊用 `locator.click()`。**瀏覽器一律加 `args: ['--mute-audio']`**（不然遊戲音效會從喇叭放出來）。這一輪專用的測試 script 放在 repo 外面；回歸工具在 `tools/regress/`。要安裝任何東西前先問使用者。
- 改了 `common/family.js` 一定要重新 build，並把重新嵌入的 HTML 一起 commit；PR 說明附上「重新 build 後 `git diff --exit-code` 沒有差異」和「名稱衝突檢查」的結果。
- 數學樂園新增的中文要補 `ZhuyinMap`（並跑第 4 節的檢查）；邏輯遊戲新增的中文要重跑 `tools/build_zhuyin.py`。
- 檔案是 CRLF 換行，改完確認沒有整檔變動。
- 改到邏輯遊戲**或 `common/`** 的輪次跑 `logic_regress.js`；改到數學樂園或 `common/` 的輪次（M1b 起）跑 `montessori_regress.js`；跟 main 比對，PR 說明附上差異（預期內的差異要逐項說明）。讀結果照第 6 節的方法，不要整個印出來。

### M0 — 數學樂園修正（montessori、tools）

**要讀的範圍**：每個題型的答對／答錯分支（`grep -n "recordAnswer" montessori_math_game.html`）、`setBalanceGuess`、`adjustBalanceGuess`、`initChallengeMode` 的選項 onclick、`MistakeBook.record` 的呼叫處、init 那一段。

**要改的**
- 每個題型答對時，**所有選項立刻停用**（天平的 +1／−1、清除也停用），直到下一次出題。
- 挑戰 mode 6：答錯的選項停用、播 `Sound.wrong()`、小熊難過，跟其他題型一致。
- 天平 mode 7：答錯的**選項**停用（+1／−1 不受影響）。
- 挑戰錯題本的題目文字：直接用 `formulaText`（裡面本來就有「❓」），不要把答案填進去。
- init 時呼叫 `MistakeBook.updateBadge()`。
- **不改** `closeModal()`。
- 建立 `tools/regress/montessori_regress.js`（第 6 節），寫法參考 `logic_regress.js`。

**驗收**
1. 每個題型答對後連點正確選項 3 次：星星只 +1，學習分析的答對數只 +1。
2. 答對後按 ✕ 關掉過關視窗：選項都還是停用的，不能再答。
3. 挑戰、天平答錯：那個選項停用；挑戰有錯誤音效；錯題本裡的挑戰題看不到答案。
4. 重新整理後錯題本數字正確。
5. 星星、貼紙、換裝、打卡、天平 +1／−1 答對的行為跟之前一樣。
6. `montessori_regress.js` 連跑 3 次結果完全相同。

### M1a — 建立共用程式（common、tools、logic）

**要讀的範圍**：`tools/build_zhuyin.py` 的嵌入寫法；logic 的 `PROFILES_KEY`～`saveProfiles`、`safeSetItem`、`freeSpaceHook`、`childKey`、`deleteChild`、`EYE_KEY`～`saveEyeStateAsParent`、`newParentGate`～`checkParentAnswer`（都用 grep 找）。

**依賴要一起處理**（不然搬過去會讀不到）：
- `readProfiles` 用到 `SAVE_KEY`、`MISTAKE_KEY`、`GEAR_INTRO_KEY`、`DEFAULT_EMOJI`、`CHILD_EMOJIS`：重建掃描改用 key 表後，前三個不再需要；兩個 emoji 常數搬進 `family.js`。
- `parseEyeState` 用到 `isNum`、`isStr`、`todayKey`、`EYE_LIMITS`（和其他 `EYE_*` 常數）；`markSeen`、`lastSeenAt`、`AWAY_KEY`、`AWAY_MS`：搬進 `family.js`，並刪掉 logic 原本的宣告（logic 其他地方繼續用 `family.js` 的版本）。
- `safeSetItem` 呼叫 `freeSpaceHook`：改成呼叫 `familyHooks.freeSpace()`，logic 設成 `qlogFreeSpace`。
- `mergeStoredEye` 改成 `family.js` 的純函式 `mergeEye(local, stored)`，logic 用回傳值更新 `eyeState`、`eyeOverSince`、`eyeWarned`。
- **家長算式只搬「純邏輯」**：`checkParentAnswer` 會碰 DOM、有畫面文字（「請等…秒再試一次」）、呼叫 `soundError()`，不能整個搬。
  - 搬進 `family.js`：`gateNew()`（出題，呼叫 `randInt` 的次數和順序要跟現在完全一樣）、`gateCheck(gate, value, now)` → `'ok'`／`'wait'`／`'wrong'`／`'reroll'`、`GATE_COOLDOWN_MS`、`randInt`。
  - 留在 logic：`newParentGate`、`checkParentAnswer`、`parentGates`、`setGateMessage`，改成呼叫上面兩個純函式。
- **HTML 的 `onclick` 叫到的函式一律不改名**（例如 `checkParentAnswer('…')`）。回歸工具是點畫面上的按鈕，改名會讓工具在分支上點不到；M2a 也一樣。

**要改的**
- `common/family.js`、`tools/build_common.py`（這輪 TARGETS 只有 `logic_game.html`）。
- `logic_game.html`：刪掉搬走的宣告，改用嵌入的版本。
- `readProfiles` 的重建掃描、`deleteChild` 的清除改用 key 表（包含數學樂園的 7 個 base 和兩個紀錄 key）。

**驗收**
1. **回歸**：`logic_regress.js` 在 main 和這個分支各跑一次，12 個情境的 JSON 完全相同。
2. 刪除孩子 c1 時，`montessori_*__c1` 和 `montessori_qlog_v1__c1` 也被刪掉（先手動寫入假資料再刪）。
3. 重新 build 後 `git diff --exit-code` 沒有差異；名稱衝突檢查通過；頁面開啟沒有任何 console error。

### M1b — 數學樂園：每位孩子一份 key（montessori）

**要讀的範圍**：`grep -n "localStorage\|key: *'montessori" montessori_math_game.html`、`loadRewardData`、`loadDifficulty`、init 那一段、`switchMode`。

**要改的**
- `tools/build_common.py` 的 TARGETS 加入數學樂園。
- 7 個 key 改用 `childKey(base, activeChildId)`（4 個物件的 `key:` 改 getter），寫入改用 `safeSetItem`，寫入前檢查 `childOnList`。
- 啟動流程：讀孩子名單 → 載入這位孩子的進度 → 最後才 `switchMode(1)`（「誰要玩？」和護眼的等待在 M1c、M1d 才接上，這輪先留好位置）。
- 換孩子的函式（第 2 節的順序），這輪先只給 profiles listener 用。
- profiles 的 `storage` listener（別的分頁刪掉目前這位孩子）。

**驗收**
1. 只有 1 位孩子時：`montessori_regress.js` 跟 M0 之後的 main 比對完全相同；舊的星星、貼紙、換裝、錯題本、打卡都還在。
2. 用 console 呼叫換孩子，換到一位**完全沒有數學樂園資料**的孩子：星星 0、沒有貼紙、難度是預設、換裝是預設、錯題本空的；在他那邊答對一題後換回來，原本那位的資料都還在、沒有被改；新孩子的 key 裡沒有上一位的貼紙。打卡獎勵星不會帶到另一位。
3. 邏輯遊戲刪掉 c1 → 數學樂園的 c1 資料一起消失；數學樂園開著時會換成名單上的其他孩子，畫面是新的一題。

### M1c — 數學樂園：孩子選單與家長設定（montessori）

**要讀的範圍**：header HTML、`closeModal`、錯題本的清空按鈕、`ZhuyinMap` 的格式；logic 的家長算式 HTML（只讀，複製後改）。

**要改的**
- 頂端加孩子頭像（2 位以上孩子時才顯示，點了換人）。
- 「誰要玩？」：開關開著時啟動先問，選好之前不出題。
- ⚙️ 家長設定（家長算式、換孩子、清空錯題本、QM8 的「把數學樂園的進度移給…」）。錯題本視窗裡的清空鈕拿掉。
- 補 `ZhuyinMap`，跑第 4 節的檢查。

**驗收**
1. 只有 1 位孩子時，畫面只多了 ⚙️；`montessori_regress.js` 的差異只有錯題本清空鈕的位置（如果有用到）。
2. 2 位孩子：頭像出現、點了可以換人；「誰要玩？」開著時，選好之前畫面上沒有題目。
3. 家長設定要先過家長算式；清空錯題本只清這位孩子的。
4. QM8：把 c0 的進度移給 c1 → 7 個 key 都搬過去、c0 變成空的；c1 已經有資料時會先確認。
5. 注音檢查 script 通過。

### M1d — 數學樂園：護眼（montessori）

**要讀的範圍**：logic 的 `eyeTick`、`lockEyes`、`setPageInert`、`startEyeExercises`、`showEyeUnlock`、`unlockEyes`、`hideEyeLock`、`#eyeLock` 的 HTML 和 `.eye-lock` CSS、`#toastBox`（只讀，複製到數學樂園後改）；數學樂園的 `showSuccess`、各題型答對分支、`closeModal`。

**要改的**
- 每秒計時（用 `family.js` 的狀態讀寫合併）、寬限期、`successPending`、鎖定畫面、護眼操文字、家長算式解鎖、提示框。
- 啟動時護眼鎖著 → 先鎖，解鎖後才問「誰要玩？」／出題。
- `EYE_KEY` 的 `storage` listener（別的分頁鎖住／解鎖，解鎖後出新題）、`visibilitychange`：切到背景時 `markSeen()`、存護眼狀態；回到前景時檢查**離開太久**（`lastSeenAt`，條件同邏輯遊戲：「誰要玩？」開著、2 位以上孩子、超過 10 分鐘）→ 顯示「誰要玩？」，選好才 `switchMode(currentMode)`（M2b 會在這裡加上關紀錄 `away`）。
- 家長設定加護眼開關和分鐘數。

**驗收**
1. 在數學樂園玩到時間 → 寬限期內做完這一題才鎖；同時開著的邏輯遊戲分頁也鎖住。
2. 在邏輯遊戲被鎖 → 打開數學樂園也是鎖住的；家長在任一邊解鎖，兩邊都解鎖，數學樂園是新的一題。
3. 答對後過關視窗出現前那 250～500ms 剛好時間到 → 先出過關視窗，關掉後才鎖；星星只 +1。
4. 開著彈出視窗、切到背景時不算時間。
5. 2 位孩子、「誰要玩？」開著：切到背景超過 10 分鐘再回來 → 出現「誰要玩？」，選好後是新的一題；只切走 1 分鐘不會問。在數學樂園玩 15 分鐘後打開邏輯遊戲，不會被當成離開太久。
6. 注音檢查 script 通過；`logic_regress.js` 跟 main 相同。

### M2a — 紀錄核心搬進 family.js（common、logic）

**要讀的範圍**：logic 的 `LOG_BUILD`～`qlogHeartbeat`、`isValidLogRecord`（grep 找；約 500 行，只讀函式開頭和跟遊戲相關的部分，搬移用 sed 整段搬）。

**要改的**
- 照第 3 節的「搬什麼、留什麼」表；`QLOG_GAMES` 格式表；`qlogConfig` 和 hook（`onAnswerEvent`、`actionsTemplate`、`countAction`）。
- logic 寫入的紀錄不加 `game` 欄位；`build` 維持 2；`qlogTab` 的產生位置不動。
- `familyHooks.freeSpace` 改成 `family.js` 的 `qlogFreeSpace`（兩個遊戲的紀錄各自用自己的格式表）。

**驗收**
1. **回歸**：`logic_regress.js` 在 main 和這個分支各跑一次，12 個情境的 JSON 完全相同（包含學習紀錄）。
2. 家長頁（R3）的報告文字跟 main 一樣（同一份種下的紀錄）。
3. 在 `montessori_qlog_v1__c0` 種一筆數學樂園格式的紀錄，在邏輯遊戲觸發 `freeSpaceHook` → 那一筆不會被當成格式錯誤刪掉（只會被「砍一半」的規則處理）。
4. 重新 build 後 `git diff --exit-code` 沒有差異；名稱衝突檢查通過；沒有 console error。

### M2b — 數學樂園紀錄（一）：開題、結束、作答（montessori）

**要讀的範圍**：7 個 `init*` 的出題和答對／答錯分支、`switchMode`、`nextQuestion`、`setChallengeType`、`setBankOp`、`toggleBankCarrying`、`setDifficulty`、`retryMistake`、`generateChallengeProblem` 裡的 category 字串。

**要改的**
- 數學樂園的 `qlogConfig`：`base:'montessori_qlog_v1'`、`build:1`、`buildOpen()`（題目快照、第 3 節的 `qk`、`module`、`sub`、`summary`、`p`、`nOptions`、`difficulty`）、`isOff()`（這輪先只看 `#modalOverlay` 和鎖定畫面）、`actionsTemplate:{steps:0}`、`onAnswerEvent` 不做事。
- `qlogBeginQuestion()` 放在 7 個 `init*` 的結尾。
- 第 3 節的所有結束路徑；第 2 節「什麼時候出題」。
- `retryMistake` 改收 mistake id，下一次開題記 `via:'mistakeBook'`、`mistakeId`。
- 答錯記 `w`；答對記 `c`；天平的 `firstAnswer.stepsBefore`；完全只用 +1／−1 答對時 `form:'stepper'`、`firstAnswer:null`、`p:null`。

**驗收**
1. 每個題型第一次答對：`correct`、`first`、`p` 0.25、`game:'montessori'`、`build:1`、`childId` 正確。
2. 答錯兩次再答對：`wrongCount` 2、`firstAnswer.ok` false。
3. 答對後連點、關掉視窗：紀錄不會被改。
4. 切題型、換難度、銀行切加減或進位、挑戰切類型、按「再來一題」、換孩子時紀錄還開著 → `replaced`（別的分頁刪掉孩子 → `abandoned`），而且馬上有一筆新的開著。
5. 從錯題本再練一次 → `via:'mistakeBook'`、有 `mistakeId`、source 是 `first` 或 `repeat`。
6. 護眼鎖住 → `locked`，解鎖後有新的一筆；離開超過 10 分鐘（條件同邏輯遊戲）→ `away`，選好孩子後有新的一筆。
7. 天平先按 +1 再點選項答對 → `p:null`、`stepsBefore` 1；只用 +1／−1 調到答對 → `form:'stepper'`、`firstAnswer:null`、`p:null`。
8. 數學樂園的紀錄不會出現在 `little_logic_qlog_v1__*`；`logic_regress.js` 跟 main 相同；`montessori_regress.js` 除了新增的紀錄 key 以外跟 main 相同。

### M2c — 數學樂園紀錄（二）：離開畫面、復原、上限（montessori、common）

**要改的**
- 點擊 `t`：capture 階段 `click`，範圍 `#gameContent`。
- `offMs`：`MutationObserver` 監看 `#modalOverlay` 的 `style` 和鎖定畫面；`visibilitychange` 記 `o`／`n`。
- `pagehide` 只存檔；`pageshow` 繼續；載入時 `qlogRecover`；心跳。
- 數學樂園這邊的上限設定（`QLOG_GAMES.montessori_qlog_v1`）和 `familyHooks.freeSpace` 的接法。上限、砍一半的程式本身在 M2a 已經搬進 `family.js`，這輪不重寫。

**驗收**
1. 打開貼紙簿 2 秒 → `offMs` 約 2000；在貼紙簿裡點擊不會記成 `t`。
2. 按「回遊戲大廳」離開或關分頁 → 下次載入那一筆變成 `unload` + `recovered`。
3. 上限：每組 30 筆；4 位孩子時每位 100K；邏輯遊戲的紀錄不受影響。
4. 寫入失敗時遊戲照常玩，星星、錯題本照常存。
5. `logic_regress.js` 跟 main 相同（這輪改到 `common/`）。

### M3 — 紀錄細節（montessori）

**要改的**
- 串珠數數 → `a:'beadCount'`（記在 `onBeadTouch` 開頭；每題第一次記事件，之後只計數）。
- 挑戰直式提示 → `a:'verticalHint'`、`gameReasons` 加 `verticalHint`（分級 `r`），只在「隱藏 → 顯示」時記。
- 天平：+1／−1 記 `x`（`actions.steps`）；調整過程不記答錯（`stepper` 的判斷在 M2b 已經做了）。
- 數學樂園 `build` +1。

**驗收**
1. 數串珠後答對：`aids` 有 `beadCount`，`wrongCountGame` 0；音效關掉時也有記到。
2. 看了直式提示才答對：`gameReasons` 有 `verticalHint`。
3. 天平只用 +1／−1 調到答對：`form:'stepper'`、`firstAnswer:null`、`actions.steps` 正確、沒有 `w`。先點錯一個選項、再用 +1／−1 調對：`firstAnswer.ok` false、`wrongCount` 1。

### M4 — 家長頁（common、兩個遊戲）

**要改的**
- R3 的 `learningLogText` 的統計部分搬進 `family.js`（不含畫面），兩個遊戲各自畫：「🚀 小小邏輯探險家」「🧮 蒙特梭利數學樂園」兩段，各自列子題型。讀兩個遊戲的紀錄時，各自用自己的格式表。
- 兩個遊戲的家長設定都有「📊 學習紀錄」，內容一樣。
- 數學樂園的動作數只列天平的「調整」；`p` 只在有值時列；`beadCount` 標成「數串珠」，不歸在「提示」底下。
- 複製報告、複製原始資料、清空（要 confirm）可以選「這個遊戲」或「兩個遊戲」。

**驗收**
1. 兩個遊戲的家長頁顯示同一份報告；數字跟原始紀錄一致（每個遊戲至少 3 組對照）。
2. 只有邏輯遊戲的紀錄時，數學樂園那段顯示「還沒有紀錄。」；反之亦然。
3. 數學樂園 `outcome:null` 的紀錄只算在「進行中」。
4. 沒有判定字眼；邏輯遊戲整區 `data-no-zhuyin`，數學樂園不經過 `zy()`。
5. 清空只影響選到的孩子和遊戲。
6. `logic_regress.js`、`montessori_regress.js` 跟 main 比對：localStorage 完全相同（家長頁只讀不寫）。
