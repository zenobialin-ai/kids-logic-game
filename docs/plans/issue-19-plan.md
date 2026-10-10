# 實作計畫：先做「多位孩子切換」（#1），再做學習紀錄第一階段（#19）

照 owner「啟動A」：**先做多位孩子切換，再做紀錄**。輪次用 **R1、R2、R3**，跟「A 案／B 案」不會混淆。
第一階段只記錄、不下判定；家長頁只列中性事實。判定門檻（第二階段）要等實際玩一兩週再訂，不在這份 plan 範圍，這裡只先保留資料欄位。
**範圍只有邏輯遊戲 `logic_game.html`**；蒙特梭利（`montessori_*` key）不分孩子，也不改。

**基準**：origin/main **20f7b6f**（#21 朗讀快慢已 merge：7a1c4fc + ea53193）。下面的行號都是 20f7b6f 的位置。
這份計畫（v5）前後經過 4 輪獨立 audit（每輪都是沒有上下文的新 agent），最後一輪結論是「沒有 blocker、沒有 major，可以開始 R1」；最後那輪的 7 個 minor 已改進文字，沒有再送第 5 輪。第 7～10 節是各輪 audit 的處理對照，audit 原文沒有放進 repo。

**給實作 agent**：先讀第 6 節和「給實作者：每輪細節」的共通規則，再只讀你負責那一輪的小節。一次只做一輪，一輪一個 PR。

---

### 0. 原 #19 驗收條件改了哪些（給 owner）

| issue 驗收 | 原本 | 現在 |
|---|---|---|
| 1、2、3、4、8 | 🟢／🔴／⚪／🟨 判定、驗證題升級 | **移到第二階段**。第一階段只檢查「該記的有沒有記到、記得對不對」。 |
| 5 | 水管轉 12 下 → 標「試出來的」 | 只記轉了幾下、最少要轉幾下，不貼標籤 |
| 6 | 錯兩次才對 → 嘗試後答對 | 保留，當成事實記下來 |
| 7 | 錯題再挑戰 → 「已學會（線索較弱）」 | 記 `source:'retry'`；標籤留到第二階段 |
| 9 | 資料壞掉／舊格式 → 丟掉那一筆 | 保留 |
| 10 | 超過上限丟最舊、總數對得上 | 保留；上限改成「每位孩子、每個子題型 30 筆，再加容量上限」（不是全部 300 筆） |

上一版 plan 的 F 條列：
- F-6、F-8：第一階段沒辦法測，**移除**
- F-9：改成**存空值**
- F-10：由 R1 達成
- F-12：改成上表的上限
- F-13：保留

---

### 1. 多位孩子（profiles）

**原則：孩子用固定 ID 識別，不用名字。ID 只存在這台裝置的孩子名單裡，不放進 `userProgress`，也不放進同步碼。**

| 項目 | 做法 |
|---|---|
| 孩子名單 | `little_logic_profiles_v1` = `{ v:1, active, askOnOpen:false, children:[{ id, emoji, name, slot, createdAt }] }`。**第一位孩子固定是 `c0`、`slot:''`，不能刪**（家長只能清空他的進度）。新增的孩子用隨機 ID，`slot:'__'+id`。最多 4 位，圖示不能重複。 |
| 進度 | key 是 `little_logic_save_v1` 加上 slot。`c0` 沿用原本的 key，不搬資料；退回舊版時，舊版看到的就是 `c0`。星星、難度、自動調整、`adaptiveTier` 都放在 `userProgress` 裡，所以自然變成每位孩子各一份。新增孩子時立刻寫入一份預設進度。 |
| 自適應 | 切換孩子時清空只存在記憶體的 `adaptStreaks`、`pendingAdaptNotice`、`pendingAdaptMsg`、`lastWrong`。 |
| 錯題本 | `little_logic_mistakes_v1` 加上 slot，格式不變；每位孩子各 50 題。 |
| 齒輪說明「看過了」 | `little_logic_gears_intro_v1` 加上 slot，每位孩子各自記。 |
| **跟裝置走的設定** | 護眼計時（Q2）、字體大小、音效、**朗讀快慢（#20 的 `little_logic_speech_rate`）**。朗讀快慢**這次先不分孩子**。R1 之後如果要分，是一個小改動，要改好幾行：現在 `speechRate` 在 script 一載入就讀（約 2340–2344 行），那時還不知道是哪位孩子，所以要在 `switchChild` 時重新讀，還要把舊的整台裝置設定搬過去，家長設定裡「每台裝置各自記住」的說明也要改。 |
| 同步 | 同步碼格式**不變**，內容是一位孩子的 `userProgress`；同步碼裡沒有孩子 ID，所以新舊版本可以互相匯入。匯入規則見下方「啟動流程」。 |
| 名單不見或壞掉 | 從 key 重建名單：先放 `c0`，再掃描 `little_logic_save_v1__*`、`little_logic_mistakes_v1__*`、`little_logic_qlog_v1__*`，從 key 的後綴找回孩子 ID（圖示給預設、名字留空）。**`c0` 只會出現一次**：`little_logic_qlog_v1__c0` 掃到的 `c0` 不再另外加一位。ID 不會變，資料就不會變成沒人認領的孤兒。 |
| 多個分頁 | 每個分頁開啟時決定自己是哪位孩子，之後只寫那位孩子的 key。修改名單一律「先讀、再改、再寫」。透過名單 key 的 `storage` 事件，偵測到自己這位孩子被別的分頁刪掉時 → 回首頁、切到名單上的 `active`、顯示 toast。寫入某位孩子的 key 前，先確認這位孩子還在名單上。 |
| 寫入失敗 | `safeSetItem(key, value)`：寫入失敗時先呼叫 `freeSpaceHook()`（R1 先放空函式，R2 才真的去刪紀錄），然後再試一次。用在進度、錯題本、護眼（`saveEyeState`、`saveEyeStateAsParent`）、孩子名單。名單寫不進去時，就不新增孩子，並顯示 toast。 |

**啟動流程**（解決 audit3 N1：取消匯入或匯入給別的孩子時，進度被洗成空白）

1. 決定 active 孩子，並**一定先讀進他在這台裝置上的進度**。
2. 網址有 `?save=` 時：
   - 只有 1 位孩子 → 跟現在一樣直接匯入。
   - 2 位以上 → **只**跳出「要匯入給誰？」（這次不再問「誰要玩？」）。
     - 選了某位孩子 → 先切換成他（讀他的本機進度），再用匯入的資料覆蓋，`keepLocalSettings` 也讀**他**的 key。被選的孩子就成為目前在玩的孩子。
     - 按取消 → 什麼都不改。
   - 不論哪種情況，都把網址上的 `?save=` 拿掉。
3. 沒有 `?save=`，而且 `askOnOpen` 開著、孩子有 2 位以上 → 跳出「誰要玩？」。
4. 如果護眼鎖住了：上面所有選擇視窗**都延到家長解鎖（`hideEyeLock`）之後**才出現。`hideEyeLock` 要跳出延後的選擇視窗之前，如果 `currentModule` 還有值，先 `goHome()`。
5. 開關開著、離開超過 10 分鐘回來時，**先處理「離開太久」**：如果還在題目中，即使正被別的分頁鎖住，也先用 `away` 結束紀錄並 `goHome()`；之後才決定要馬上跳選擇視窗，還是等解鎖再跳。

`loadSavedProgress` 目前會被呼叫兩次（DOMContentLoaded 一次、script 結尾一次）。**拿掉 DOMContentLoaded 那一次**，只留 script 結尾那一次。
同步視窗裡「貼代碼匯入」一律匯入給**目前這位孩子**，視窗上寫明「匯入給 🐰 小明」。要匯入給別的孩子，請先在選單換人，避免在題目中途換人。

**介面（5～7 歲）**

- 只有 1 位孩子：畫面**完全不變**。
- 2 位以上：選單左上角顯示頭像按鈕（emoji＋名字），點了會跳出大圖示的選擇視窗。**只能在選單換人**。換人後念「換 小明 玩囉！」，名字空白就念圖示的動物名稱。
- **「每次開始先問『誰要玩？』」是家長設定裡的開關，預設關**（owner 已決定）。開啟時：
  - 打開遊戲時問一次（依上面的啟動流程）。
  - 離開頁面超過 10 分鐘再回來時也會問：
    - 如果當時在題目中 → 紀錄用 `away` 結束 → `goHome()` → 跳出選擇視窗。
    - 如果護眼鎖住 → 等解鎖後才跳出。
  - 選擇視窗開著時被護眼鎖住（`lockEyes` 會關掉所有視窗）→ 記下「還沒選」，解鎖後再跳出一次。
- 新增、改名、換圖示、刪除孩子，以及「誰要玩？」開關，都放在「⚙️ 家長設定」裡（沿用家長算式），**加在 #20 朗讀快慢說明的後面**。
  - 不能刪除目前正在玩的孩子，也不能刪 `c0`。
  - 刪除時會一起刪掉這位孩子的進度、錯題本、齒輪說明、學習紀錄 key，刪除前再按一次 `confirm` 確認。
- 名字一律用 `textContent` 顯示，並加上 `data-no-zhuyin`。給孩子看的新文字只用注音資料裡已經有的字；R1 會用 script 檢查。家長頁的新文字加 `data-no-zhuyin`。不重跑 `build_zhuyin.py`。

### 2. 第一階段紀錄的資料契約（schema v1）

題目出現時開一筆紀錄，結束時一定有一個結果（outcome）。**關閉紀錄是通用規則：已經關閉的紀錄再關一次不做任何事；對已關閉的紀錄記事件也不做任何事。**

| 開啟（source） | 結束 → `outcome` |
|---|---|
| `loadCurrentQuestion` → `first` 或 `repeat` | `triggerVictory` → `correct` |
| `startModule` 從錯題本進來 → `retry`（並記 `mistakeId`） | `goHome` → `abandoned` |
| 齒輪示範後換一題 → `afterDemo` | 齒輪換題 → `replaced` |
| 解鎖後繼續同一題 → `resume`（見 m-a） | 齒輪再挑戰答錯 → `retryEnded`（先關紀錄，再 `goHome()`） |
| 保留：`verify` + `variantOf` | 護眼時間到被鎖（`eyeTick` 寬限期滿、`storage` listener）：在呼叫 `goHome()` **之前**關 → `locked` |
| | 「別的分頁已經鎖住」的路徑（`eyeTick` 只呼叫 `lockEyes()`、題目還留在畫面上）：**不關紀錄**，鎖住的時間算進 `offMs`，解鎖後同一筆紀錄繼續記 |
| | 開關開著、離開超過 10 分鐘回來 → `away` |
| | 分頁被關掉或當機 → 下次載入時復原成 `unload`。**`pagehide` 只存檔、不關紀錄**；頁面從 bfcache 還原時，紀錄還是開著、繼續記 |

開新的一筆時，如果上一筆還沒關，先用 `replaced` 關掉。
（`resume` 是保留值：照上表的做法，鎖住時不關紀錄，所以目前用不到；只有之後改成鎖住就關紀錄時才會用。）

**第一次遇到（`first`）**：同一位孩子、同一組子題型，在還保留著的紀錄裡沒有相同的 `qk`。

**子題型分組：14 組**
`pattern`、`balance.swap`（`mode` 不是 `'number'`）、`balance.number`、`blocks`、`maze`、`deduction`、`folding`、`gears`、`raven`、`oddone.odd`（`mode` 沒設或是 `'odd'`）、`oddone.sort`、`oddone.monster`、`pipes.live`、`pipes.hard`。

**欄位**（時間都用 epoch ms；事件記的是相對於 `tOpen` 的毫秒差）

```
{ v:1, id, build, tab, lastWrite,
  childId, module, sub, difficulty, parentDifficulty, adaptive,
  source, variantOf:null, mistakeId:null, round:{ id, level },
  qk, summary, form, nOptions, p, live, minActions,
  speech:{ available, rateSetting, rate, voiceURI, voiceName, voiceLang, zhVoices, source:'tts' },
  soundOn, tOpen, tShown, tClose, outcome, recovered,
  ev:[[dt, type, data], ...], evTruncated,  // 最多 100 筆，超過就設 evTruncated:true
  // 計數在事件發生當下累加；evTruncated 為 true 時 ev 不完整，以計數為準
  firstAnswer, wrongCount, wrongDupCount, wrongCountGame, gameReasons,
  tapCount, keyTapCount, pointerDownCount, offMs, activeMs,
  promptSpeech, answeredDuringPrompt, aids, actions:{ submits, resets, rotations, commands },
  leaks, overRotation }
```

`writeFailed` **不是紀錄本身的欄位**，是這位孩子的 key 的狀態，只存在記憶體裡（存不進去時也無處可存），家長頁會顯示提示。

- **`build`**：常數 `LOG_BUILD`（整數），R2 從 1 開始。**之後每一個改到出題、作答或語音行為的 PR，都把當時的值 +1**（不寫死各輪是多少）。常數旁邊加註解寫明這條規則，owner 自己發的 PR 也要照做。第二階段可以用它把不同版本的資料分開。
- **語音欄位（N3）**：題目開啟時記下：
  - `rateSetting`：`slow`／`normal`／`fast`
  - `rate`：實際傳給 utterance 的數值
  - `voiceURI`／`voiceName`／`voiceLang`：目前沒有指定語音，所以是瀏覽器的預設，記 `null`；#20 之後如果加了語音選擇，就記實際用的那個
  - `zhVoices`：zh-TW 語音的數量（語音清單還沒載入時記 `null`）

  題目進行中家長改了速度 → 記一個 `s` 事件 `{ph:'rate', rate}`。共用的 `getZhVoices()` 會處理 `voiceschanged`（語音清單晚到），之後 #20 做語音選擇時可以直接用。
- R2 寫的紀錄沒有 R3 的欄位，`isValidLogRecord` 要接受這些欄位是 `null` 或不存在。

**事件 type**

| type | 何時記 | data |
|---|---|---|
| `t` 點擊 | document 的 **capture 階段 `click`**，只限 `.game-view.active` 裡面。往上找祖先，第一個符合 `tagName==='BUTTON'` 或 `typeof el.onclick==='function'` 的元素。 | id；沒有 id 就用 class＋文字，最多 12 字；鍵盤觸發的前面加 `k:` |
| （計數）| capture 階段 `pointerdown` **只累加 `pointerDownCount`，不記成事件**。可以跟 `tapCount` 比對，看 iPad 連點時是不是被當成雙擊縮放、少算了點擊（m-i）。 | — |
| `w` 答錯 | `onWrongAnswer` 第一行（在去重之前） | `{ text, dup, hint }` |
| `c` 答對 | `triggerVictory` 第一行 | — |
| `a` 輔助 | 朗讀鈕、透視鏡開／關、齒輪提示、題目中看齒輪範例 | `read`／`xrayOn`／`xrayOff`／`gearHint`／`gearExample` |
| `x` 動作 | 送出、重來 | `submit`／`reset`，可以附數量 |
| `l` 漏水 | 水管挑戰關漏水 | `{ r, c }` |
| `s` 語音 | utterance 的 `onstart`／`onend`／`onerror`。下一次 `cancel()` 之前，如果上一句還沒念完就記 `cut`，之後那一句再來的 end／error 都忽略。**所有 `cancel()` 都改成走同一個 helper `cancelSpeech()`**（`speakText` 裡、`goHome` 約 2632 行、`closeParentSettings` 約 6040 行），這樣每次都會記到 `cut`。如果還是收到 `onerror` 且 `error` 是 `'interrupted'` 或 `'canceled'`，也當成 `cut`。**每個 utterance 都綁著建立它的紀錄 `recordId`；事件只寫進那一筆紀錄，那筆已經關閉就丟掉**（m-c）。 | `{ kind, ph }` |
| `o`／`n` | `visibilitychange`；`MutationObserver` 監看 `.modal-overlay`、`#eyeLock` | `hidden` 或 modal 的 id |

- **語音 `kind`**：
  - `speakCurrentPrompt(manual=false)` → `prompt`；10 個朗讀鈕呼叫時傳 `true` → `manual`。
  - 其他地方呼叫 `speakText` 時：文字等於 `currentQuestion.prompt` → `prompt`；題目進行中 → `feedback`；其他 → `other`。**`previewSpeech` 明確傳 `speakText(text, 'other')`**：家長可能在題目中打開 ⚙️ 試聽（`setSpeechRate` 也會自動試聽），這時不能被算成 `feedback`；試聽打斷題目朗讀時，題目那一句記 `cut`。
- **提示分級**：`d` 有方向性（數字天平、積木、迷宮、水管、分類、怪獸）／`g` 一般鼓勵（規律、換算天平、排排坐、摺紙、瑞文、找不同）／`r` 直接演出答案（齒輪示範）。
- **答錯要跟其他狀況分開**：看範例、用提示、水管轉太多，都記在 `aids`／`overRotation`／`gameReasons`，不算答錯。透視鏡不會動到 `questionWrongAttempts`。
- **`p`（純猜答對的機率）與 `form`（作答方式）**：

| 子題型 | `p` | `form` |
|---|---|---|
| pattern／raven／balance.swap／folding | 1/`options.length` | |
| oddone.odd | 1/`items.length` | |
| gears | 1/2 | |
| blocks | 1/`padMax` | pad |
| balance.number | 能平衡的砝碼組合數 / C(`weights.length`, `slots`) | multiSlot |
| monster | 1/`monsters.length` | eliminate |
| sort | (1/2)^`items.length` | |
| deduction | 1/`houses`! | arrange |
| maze、pipes | `null` | |

  積木和數字天平的 `p` 在第二階段**不拿來做機率判定**。
- **最少動作數**：迷宮用 `solveMaze(q)` 的 `{steps, turns}`；水管用 `solvePipes(q)`。排排坐、分類只記送出次數和重來次數。
- **作答時間**：`offMs` = 切到背景＋任何彈出視窗＋護眼鎖住的時間；`activeMs = tClose − tOpen − offMs`。
- **多分頁與當機復原**：
  - 題目一開就寫一筆 `outcome:null`。
  - 在前景時每 60 秒重寫一次（心跳）；切到背景、`pagehide` 時也寫一次。
  - 每次寫入都是：讀最新的 → 按 `id` 只換掉自己分頁的紀錄 → 套上限 → 寫回。
  - 載入時掃描**所有孩子**的紀錄：`outcome:null`、`tab` 不是自己、而且 `lastWrite` 超過 3 分鐘的 → 改成 `unload` + `recovered:true`。如果原來的分頁之後真的把題目做完了，以它記的結果為準。
- 所有紀錄程式都包在 try/catch 裡，**完全不能改變遊戲行為**。

### 3. 儲存

- **key**：每位孩子一個 `little_logic_qlog_v1__<childId>`（**一律用 ID，不用 slot 規則**；`c0` 的 key 是 `little_logic_qlog_v1__c0`）= `{ v:1, childId, records, dropped:{sub:n}, skipped }`。不放進 `userProgress`、不放進同步碼、不跨裝置。
- **上限**（m-f：總量不會隨著孩子人數線性變多）：
  - 每組（孩子 × 14 組）最多 30 筆。
  - **所有孩子的紀錄合計最多 1,000K 字元**；每位孩子的額度 = min(400K, 1,000K ÷ 孩子數)。1～2 位孩子各 400K、3 位各 333K、4 位各 250K。
  - 超過額度時，從**這位孩子筆數最多的那一組**開始刪最舊的。
  - **每一種刪除都把實際刪掉的筆數加進 `dropped[sub]`**（m-e）。
  - 家長頁顯示實際保留了幾筆。
- **大小估計**：一般題目一筆約 0.9～1.3K 字元；迷宮、水管最多約 3K。一位孩子如果每組都存滿 30 筆約 460K，所以實際上會先碰到容量上限。整個網域加起來：紀錄 ≤1.0M + 錯題本 ≤4×約 100K + 進度等 → **約 1.5M 字元以內**。Safari/WebKit 有可能用 UTF-16 bytes 算上限（約 2.5M 字元），這樣還留有約 1M 給蒙特梭利和其他資料。
  - 注意：`zenobialin-ai.github.io` 底下所有 GitHub Pages repo 共用同一個網域的儲存空間。
- **空間不夠時**：
  - 寫紀錄失敗 → 刪掉這位孩子最舊的 25% 再試一次；還是失敗就只留在記憶體，並標記 `writeFailed`。
  - `freeSpaceHook` = 把每位孩子的紀錄各刪掉一半，讓進度、錯題本、護眼、孩子名單可以優先寫入。
  - 蒙特梭利那邊沒有騰空間的機制，所以靠紀錄合計 1M 的上限保護它（R2 會驗收）。
- **壞掉或舊格式**：
  - 整個 key 讀不出來 → 當成空的。
  - 單筆格式不合 → 丟掉那一筆，`skipped` 加 1。
  - 報告只用格式正確的紀錄，所以總數和明細一定對得上。
- **之後的 #20（語音包、家長錄音）**：音檔**必須放在 IndexedDB（或 Cache Storage），不可以放 localStorage**。IndexedDB 的容量配額比 localStorage 大很多，不會吃掉上面這 5MB 左右的空間，第 3 節的估算也不受影響。如果有人把音檔塞進 localStorage，所有上限都會失效。用錄音時，紀錄的 `speech.source` 要記成 `'recording'`。語音包不放在 public repo。

### 4. 家長頁（第一階段：只列事實）

- 放在「⚙️ 家長設定」的「📊 學習紀錄」，沿用家長算式。可以選看哪位孩子；整區加 `data-no-zhuyin`。
- 每一組顯示：
  - 紀錄題數，以及來源分布（第一次／重複／再挑戰／示範後換題）
  - 結果分布（答對／中途離開／再挑戰沒過／休息鎖定／換題／離開太久／關閉頁面），另外列「進行中」：`outcome:null` 的紀錄（例如別的分頁正在作答，或還不到 3 分鐘、還沒被復原的）只算在這一欄，不算進其他任何數字
  - 第一次遇到的題目中，第一次就答對的有幾題
  - 隨機作答的答對機率（只有選擇題才顯示）
  - 第一次作答前的時間（中位數，已經扣掉離開畫面的時間）
  - 題目還在朗讀時就作答的題數，**旁邊註明當時的朗讀速度**
  - 用了哪些輔助
  - 操作題的動作數，和最少需要的動作數（中位數）
  - 水管漏水次數
  - 保留了幾筆、自動刪掉幾筆、略過幾筆、空間不足的提示
- **不會出現**：判定符號、「蒙」「猜」「可信」這類字眼、跟孩子自己的平均比快或慢。
- 按鈕：複製報告、複製原始資料（JSON）、清空這位孩子的紀錄（要先 `confirm`）。
- 孩子那一端完全看不到這些。

### 5. 待決問題（請 owner 拍板；先照建議的預設值動工）

（「每次問『誰要玩？』」已經決定：做成家長設定的開關，**預設關**。）

- **Q1 換孩子要不要家長算式？** 建議**不要**，新增和刪除孩子才需要。
  - 代價：「誰要玩？」預設關，前一個孩子的身分會一直留著；弟弟妹妹可能用哥哥姊姊的身分玩，紀錄就會混在一起。可以靠選單上醒目的頭像＋名字，或家長打開開關來減少這種情況。
- **Q2 護眼時間：整台裝置共用，還是每位孩子各算？** 建議**先共用**，這樣換人也繞不過休息。
  - 代價：哥哥把時間玩滿後，妹妹當天也要等家長解鎖。
- **Q3 匯入同步進度給誰？** 建議：用網址 `?save=` 匯入、而且有 2 位以上孩子時，跳出「要匯入給誰？」；在同步視窗貼代碼時，一律匯入給目前這位孩子。
- **Q4 上限**：建議最多 4 位孩子；每組 30 筆；紀錄合計 1M 字元。
- **Q6（新增，可以晚點再決定）在題目畫面加 `touch-action: manipulation`？** 建議**先不要**：R2 會先記錄 `pointerDownCount`，等資料顯示 iPad 連點真的被當成縮放、少算了點擊，再決定。
  - 加了的代價：家長在題目畫面就不能用雙擊放大（雙指縮放仍然可以）。

### 6. 輪次總覽與合併順序

**順序：#20 朗讀快慢（PR #21，已 merge 進 20f7b6f）→ R1 → R2 → R3。**
#20 的後續工作（語音選擇、家長錄音）建議放在 R3 **之後**：
- R3 會改 `speakText` 的主體。先做 R3，#20 後續只要在 `speakText` 加上 `utterance.voice`，順便更新紀錄的 `voiceURI` 就好。
- 如果 #20 後續一定要先做：R3 rebase 時要保留 #20 的 rate／voice 設定，再加 kind 和事件。
- 不論哪個先，**R3 開始前都要確認 `speakText` 目前的樣子**。

| 輪 | 內容 | 依賴 | 預估 tokens |
|---|---|---|---|
| R1 | 多位孩子、啟動流程、「誰要玩？」開關、家長管理、多分頁、`safeSetItem` | #20 | 約 44K |
| R2 | 紀錄核心：儲存、上限、開啟／結束、點擊、答錯、離開畫面時間、復原、`p`／`form` | R1 | 約 47K |
| R3 | 紀錄細節（語音、輔助、操作、最少動作數、漏水）＋家長頁 | R2 | 約 50K；做到一半超過 65K，就把家長頁拆成 R4（約 20K） |

---

## 給實作者：每輪細節

**共通規則**

- **預算**：讀檔＋改動＋工具和測試輸出，目標 ≤80K tokens，上限約 100K（整個 context window 約 131K）。估算方式：約 3 bytes 算 1 token，一行程式約 15 tokens。**不要讀整個檔案**（約 90K tokens）。
- **行號**：下面的行號是 main 20f7b6f 的位置（跟 7aac469 比：2242–2336 行之後 +10、2337–6037 行之後 +19、約 6037 行之後 +37）。前一輪改完行號還會再變，所以**一律先 `grep -n "function 名稱"`，再用 `sed -n` 讀需要的範圍**。
- **測試**：用 Node 寫 Playwright script，或用 Playwright MCP 的 `browser_run_code_unsafe` / `browser_evaluate`，一次跑完整個情境，只回傳 ≤500 字的 JSON。
  - **不要**用 navigate／click／snapshot 一步一步操作：每一步都會回傳整頁快照，很快就把預算吃光。
  - 點擊要用 `locator.click()`；`el.click()` 會被記成鍵盤觸發。
  - 先跑 `npx playwright --version` 確認有裝；要安裝 chromium 前先問使用者。
  - 測試 script 放在 repo 外面。
- 新程式碼集中放在一段；在既有函式裡只插入一兩行呼叫。

### R1 — 多位孩子（#1）

**要讀的範圍**（約 12K tokens）
- `SPEECH_RATES` 到 `speakText`：2337–2355（只是確認，不改）
- 存檔／同步：2395–2511；`importSyncCode` 2584–2611；`goHome`／`startModule` 2624–2671
- 自適應全域變數：2785–2849
- 錯題本：3789–3790、3868–3885、3949–3972
- 齒輪說明的 key：5214、5232–5236、5305–5310
- DOMContentLoaded：5761–5764
- 護眼存檔：5835–5848；`lockEyes` 5911–5925；`hideEyeLock` 6021–6025
- HTML：header／選單 1720–1757、同步視窗標題 2122–2135、家長設定（含 #20 那一列）2210–2256
- 家長設定 JS（含 `setSpeechRate`／`previewSpeech`）6027–6076；listener 和初始化 6104–6122（要包含第 6122 行的 `loadSavedProgress()`）
- CSS：用 grep 找 `.parent-row`、`.modal-card`、`.mistake-btn`
- **不要讀**注音資料那一行（約 6169 行）；要檢查新字有沒有注音，用 Node script 查

**要改的**（約 10K tokens）
- **新增** `defaultProgress()`（目前 `userProgress` 是約 2396 行的物件字面值，要抽成函式）
- 名單：`loadProfiles`（搬移舊資料、重建、掃描 key；`c0` 一定存在）、`saveProfiles`（先讀、再改、再寫）、`childKey`、`getActiveChildId`
- `safeSetItem` + `freeSpaceHook`
- `switchChild`（只能在選單呼叫）、`addChild`（立刻寫入預設進度）、`renameChild`、`deleteChild`（不能刪目前這位、不能刪 `c0`）
- `openChildPicker({ title, onPick, cancellable })`：「誰要玩？」和「要匯入給誰？」共用
- **按「啟動流程」重寫 `loadSavedProgress`**；`keepLocalSettings(imported, childId)` 改成讀目標孩子的 key；`importSyncCode` 寫明「匯入給目前這位」
- 拿掉 DOMContentLoaded 的 `loadSavedProgress`
- `askOnOpen` 開關；離開超過 10 分鐘回來的處理（R1 還沒有紀錄功能，所以只做 `goHome` 和跳視窗；R2 再補上 `away`）；護眼鎖住時延後跳視窗，`hideEyeLock` 後再補跳（補跳前 `currentModule` 還有值就先 `goHome()`）；「離開太久」要在決定延後之前先處理（啟動流程第 5 點）
- 名單 key 的 `storage` 事件；寫入某位孩子的 key 前先確認他還在
- `SAVE_KEY`／`MISTAKE_KEY`／`GEAR_INTRO_KEY` 改用 `childKey`；護眼和名單的寫入改用 `safeSetItem`
- UI：選單頭像；家長設定裡的「孩子」區塊和開關，放在 #20 那一列下面

**測試**：約 20K tokens

**驗收**
1. 全新裝置：名單只有 `c0`；畫面跟現在一模一樣。
2. 舊資料（12 顆星、3 題錯題）載入後完全一樣，舊的 key 沒有被改寫。
3. 新增 B：立刻有 B 的進度 key；切到 B 是全新狀態；B 的錯題本、齒輪說明都是分開的；切回 A，A 的資料完好。
4. 開關**關**（預設）：重新整理不會跳出「誰要玩？」。開關**開**、有 2 位孩子：
   - 重新整理只跳一次。
   - 在選單離開 11 分鐘 → 再跳一次。
   - 在題目中離開 11 分鐘 → 回到首頁後才跳。
   - 護眼鎖住時重新整理 → 解鎖後才跳。
   - **別的分頁鎖住了，題目還在畫面上，又離開 11 分鐘** → 先回首頁（R2 之後紀錄是 `away`）；解鎖後才跳選擇視窗，而且一定是在選單上跳出來。
5. 在題目中呼叫 `switchChild` 不做任何事；不能刪目前這位孩子，也不能刪 `c0`。
6. 有 2 位孩子時用 `?save=` 開啟：只跳「要匯入給誰？」，不會再跳「誰要玩？」。
   - **按取消後答對一題：A 的星星 = 原本 + 3，存檔裡其他欄位不變（沒有被洗成空白）**；網址的 `?save=` 已拿掉。
   - 選 B：只有 B 被覆蓋，接著就是 B 在玩；A 的 key 沒變。
7. 名單被刪掉或壞掉：重建後 `c0` 和 B 都在，ID 跟原本一樣。
8. 在分頁 1 刪掉 B，而分頁 2 正在用 B：分頁 2 回到首頁並換人；B 的 key 不會被寫回來。
9. `setItem` 第一次寫護眼 key 失敗：呼叫 hook 之後重試成功。
10. 退回舊版程式：看到的是 `c0` 的資料；蒙特梭利的 key 不受影響；朗讀快慢的設定照舊。
11. 檢查兒童文字缺字的 script：輸出是空的。

**預算**：讀 12K + 改 10K + 測試 20K ≈ **42–44K tokens**

### R2 — 紀錄核心

**要讀的範圍**（約 11.5K tokens）
- R1 的 `childKey`／`safeSetItem`／`freeSpaceHook`／`loadProfiles`／「離開超過 10 分鐘」的 handler（用 grep 找，約 1.5K）
- `goHome`／`startModule` 2624–2671；`triggerVictory` 2717–2783；`onWrongAnswer` 那段 2803–2889；`questionKey`～`loadCurrentQuestion` 2943–2969
- **數字天平**：`isValidNumberBalance` 3142–3153、`placeNumberWeight` 4453–4481（算 `p` 要用，m-g）
- `MODULE_INFO` 3791–3802；`mistakeSummary` 3889–3911
- `checkGearAnswer` 5418–5454
- `eyeTick` 5884–5899；`lockEyes` 5911–5925；`hideEyeLock` 6021–6025；listener 6104–6122（要包含 storage listener 的結尾）
- 需要時再讀 `QUESTION_VALIDATORS` 3811–3861

**要改的**（約 10.5K tokens）
- 紀錄模組：`LOG_BUILD=1`（旁邊加註解寫明 +1 規則）、14 組、`QLOG_HINT_GRADE`、`qlogSubMode`／`qlogForm`／`qlogChance`、`fnv1a`、`isValidLogRecord`、`qlogLoad`、`qlogWrite`（讀 → 合併 → 上限 → 寫）、`qlogBudget()`（min(400K, 1M ÷ 孩子數)）、`qlogEvict`（`dropped += n`）、`qlogFreeSpace`、`qlogOpen`／`qlogEvent`／`qlogClose`（通用的「已關閉就什麼都不做」）、`qlogRecover`、心跳
- 第 2 節列出的所有掛鉤，包括 R1 的「離開超過 10 分鐘」handler 補上 `away`、`pagehide` 只存檔不關
- capture 階段的 `click`（記成事件）＋`pointerdown`（只計數）；`visibilitychange`；`MutationObserver`

**測試**：約 24K tokens

**驗收**
1. 規律題第一次就答對：結果是 `correct`、來源 `first`，`p` 正確，`childId` 正確，`build` 是 1。
2. 用 `locator.click()` 在 1.2 秒內點 3 個錯的、再點對的：記到 `t`×4、`w`×3。在 800ms 內點同一個錯的兩次：`wrongCount` 1、`wrongDupCount` 1、`wrongCountGame` 1。`pointerDownCount` 跟點擊數一樣。
3. 用 div 做成的選項（摺紙、排排坐、迷宮指令標籤）有記到點擊；按 Enter 選擇的記成 `k:`。
4. 錯兩次才答對：`firstAnswer.ok` 是 false。
5. 各種結束方式：
   - 按 🏠 → `abandoned`
   - 齒輪換題 → 先 `replaced`，再開一筆 `afterDemo`
   - 齒輪再挑戰答錯 → `retryEnded`
   - 答對後在過關視窗按回首頁 → 紀錄不會被關兩次
6. 護眼寬限期滿 → `locked`。**別的分頁先鎖住的情況**：紀錄不關；解鎖後繼續作答，答對時結果是 `correct`，鎖住的時間算進 `offMs`。
7. 開關開著、在題目中離開 11 分鐘 → `away`。
8. 兩個分頁同時開：另一個分頁正在作答的紀錄不會被誤改。把 `lastWrite` 改成 4 分鐘前再重新載入 → 變成 `unload` + `recovered`。觸發 `pagehide`（`persisted:true`）後再觸發 `pageshow` → 紀錄還是開著，之後答對時是 `correct`。
9. 切到背景 2 秒、再打開家長設定 1 秒 → `offMs` 約 3000。
10. 上限：
    - gears 已有 30 筆 → 刪掉最舊的，`dropped.gears` = 1。
    - 有 4 位孩子時，每位的額度是 250K。
    - 超過額度時，從筆數最多的那一組開始刪。
    - 刪一半時，`dropped` 加的是實際刪掉的筆數。
11. 4 位孩子的紀錄都塞滿之後，再寫一個 200K 的 `montessori_test` key → 成功。
12. 資料壞掉：遊戲照常玩；`skipped` 數字正確。
13. 紀錄 key 寫入失敗時：遊戲、進度、錯題本、護眼都正常。進度第一次寫入失敗時：先刪掉紀錄，再寫進度就成功。
14. `qlogChance` 用固定題目檢查（包括數字天平的組合數）；`balance` 沒有 `mode` 時歸到 `balance.swap`。
15. 星星、升降級、錯題本的行為跟 R2 之前完全一樣。

**預算**：讀 11.5K + 改 10.5K + 測試 24K ≈ **46–47K tokens**

### R3 — 紀錄細節 + 家長頁

**開始前**：先 `grep -n "function speakText"`，讀它目前的樣子，確認 #20 的後續 PR 有沒有已經改過它。

**要讀的範圍**（約 12K tokens）
- R2 模組的 `qlogEvent`、`qlogClose` 摘要段、`isValidLogRecord`（約 3K）
- `SPEECH_RATES`～`speakText` 2337–2355；`speakCurrentPrompt` 2686–2715；10 個朗讀鈕（只用 grep 看那一行）
- `toggleXray` 4498–4511；迷宮 4667–4694、4723–4731、4777–4785
- 水管 4833–4837、4894–4906、4939–4949、4974–4989
- `checkDeductionAnswer` 5093–5116；齒輪 5253–5310；`checkSort` 5591–5604
- 家長設定 HTML 2210–2256（再加上 R1 新增的那幾列）；`closeParentSettings` 6037–6042；`renderParentSettings`／`setSpeechRate`／`previewSpeech` 6050–6076；`goHome` 2624–2640（裡面有 cancel）；CSS

**要改的**（約 11K tokens）
- `speakText(text, kind)`：
  - **保留 #20 的 `utterance.rate = SPEECH_RATES[speechRate]`**
  - 每個 utterance 記 `recordId`，另外記 `cut`
  - 被 cut 之後的 end／error 忽略
- `cancelSpeech()` helper：`goHome`、`closeParentSettings` 改成呼叫它；`previewSpeech` 傳 `'other'`
- `getZhVoices()`（處理 `voiceschanged`）；開題時記下語音欄位；`setSpeechRate` 被呼叫時記一個 `rate` 事件
- `speakCurrentPrompt(manual=false)`，10 個朗讀鈕改成傳 `true`
- `a`／`x`／`l` 事件、`rotations`、`qlogMinActions`、`overRotation`、`promptSpeech`、`answeredDuringPrompt`
- `LOG_BUILD` 把當時的值 +1
- 家長頁：`renderLearningLog`／`learningLogText`／`copyLearningLog`／`copyLearningLogRaw`／`clearLearningLog`

**測試**：約 24K tokens，用假的 `speechSynthesis`，以及完全沒有 `speechSynthesis` 的情況各跑一次

**驗收**
1. 題目自動朗讀時有 start／end；還沒念完就作答 → `answeredDuringPrompt`；被下一句打斷 → `cut`，之後那句的 end 不會改掉結果。
2. **上一題的語音晚到的 end 事件，不會寫進下一題的紀錄。**
3. `speech.rate` 等於實際傳給 utterance 的值；切換成 `fast` 後再開題，記到的是 1；題目中途改速度 → 有 `rate` 事件。
4. 排排坐、神秘怪獸自動朗讀 → kind 是 `prompt`；按朗讀鈕 → `manual` + `a:'read'`；家長設定的「試聽」（包括在題目中打開 ⚙️ 試聽）→ `other`，而且不算成題目朗讀；試聽打斷題目朗讀 → 題目那一句記 `cut`。按 🏠 或關閉家長設定時題目還在念 → 記 `cut`。
5. 沒有 `speechSynthesis`：`available:false`、`promptSpeech:null`。
6. 只用透視鏡：`wrongCountGame` 是 0。用齒輪提示或看範例：`wrongCount` 0、`wrongCountGame` 1。
7. 水管即時關：`rotations`、`minActions`、`overRotation` 正確，沒有 `w`／`l`；挑戰關漏水 → 有 `l` + `w`。
8. 迷宮、排排坐、分類的動作數正確。
9. R2 寫的舊紀錄可以正常顯示。
10. 家長頁：要先過家長算式；可以選孩子；數字跟原始紀錄一致；有註明朗讀速度；沒有判定字眼；整區有 `data-no-zhuyin`。
11. 複製報告、清空紀錄只影響這位孩子；空的狀態、刪除筆數、略過筆數、空間不足的提示都正確。

**預算**：讀 12K + 改 11K + 測試 24K ≈ **47–50K tokens**；做到一半超過 65K，就把家長頁拆成 R4（約 20K）。

---

### 7. audit1 → plan（v2 已處理，v3、v4 再補強）

| audit1 | 處理 |
|---|---|
| B1 | R1 先做多位孩子，孩子用固定 ID；輪次改用 R 編號 |
| B2 | 題目出現就開紀錄，結束時一定有 outcome（v4 新增 `away`，`resume` 保留備用） |
| M1–M10 | 見第 2、3 節（M2 用 click＋往上找元素，M6 用 1M 合計上限，M8 用 kind、cut、recordId、實際語速和語音） |
| m1–m6 | 已處理 |
| m7 | **延後**：驗證題要不要做，留到第二階段決定；先保留 `verify`／`variantOf` |

### 8. audit2 → plan_v3（摘要）

MJ1–MJ7、m1–m13 都已在 v3 處理。v4 再修正其中三項：m1 的後續（N1）、MJ6／Q5 的後續（N2、owner 的開關決定）、m3 的後續（m-a）。

### 9. audit3 → plan_v4

每一項都先對照程式驗證過。

| audit3 | 驗證 | 處理 |
|---|---|---|
| **N1** `?save=` 會把進度洗掉 | 同意：`loadSavedProgress` 走匯入那條路時完全不讀本機進度；目前沒出事，是因為它被呼叫了兩次 | 「啟動流程」改成**先讀本機進度**；`?save=` 時只問「要匯入給誰？」，選到的孩子就變成目前這位；`keepLocalSettings` 讀目標孩子的 key；同步視窗的貼代碼只匯入給目前這位。R1 驗收 6 加上「按取消後答對一題，進度沒被洗掉」 |
| **N2** 離開 10 分鐘回來、護眼鎖住 | 同意：`lockEyes` 會關掉所有開著的視窗（5911 起），而原本規定在題目中不能換人，兩者衝突 | **owner 已決定：開關預設關**。開關開著時：在題目中 → `away` + `goHome` 後才問；護眼鎖住 → 等 `hideEyeLock` 之後才問；選擇視窗被鎖住關掉 → 解鎖後再問。R1 加讀 `lockEyes`／`hideEyeLock`；驗收 4 涵蓋題目中、鎖住兩種情況 |
| **N3** 跟 #20 的順序、語速資料 | 同意；7a1c4fc 已經把 0.95 改成可以設定的語速 | 基準改成 main + 7a1c4fc；紀錄實際的 `rate`、`rateSetting`、voice 欄位、`zhVoices`，中途改速度也記事件；共用 `getZhVoices()`；`LOG_BUILD` 每個相關 PR 都 +1；寫明合併順序和 R3 開始前要先檢查 `speakText`；朗讀速度暫時不分孩子；語音包和錄音一定放 IndexedDB |
| m-a 只呼叫 `lockEyes` 的路徑 | 同意：`eyeTick` 第 5893 行附近只呼叫 `lockEyes()`，沒有 `goHome` | 採用 audit2 原本的建議：這條路徑**不關紀錄**，鎖住的時間算進 `offMs`；`lockEyes` 裡面不再關紀錄。`resume` 只保留不用 |
| m-b bfcache | 同意 | `pagehide` 只存檔，被關掉的情況改由下次載入時復原；驗收 8 加上 `pageshow` 的情況 |
| m-c 語音事件寫錯題 | 同意 | utterance 綁定 `recordId`；R3 驗收 2 |
| m-d 重複關閉 | 同意 | 寫成通用規則；R2 驗收 5 |
| m-e `dropped` 計數 | 同意 | 改成加實際刪掉的筆數 |
| m-f 容量 | 部分同意：Safari 的配額怎麼算我沒辦法在這裡驗證，所以用保守的方式處理 | 紀錄合計 1M、每位孩子分到的額度跟著人數變少；R2 驗收 11 確認蒙特梭利還寫得進去；註明 github.io 各 repo 共用網域儲存空間 |
| m-g 數字天平 | 同意（3123、4434 起） | R2 加讀這兩段 |
| m-h 刪掉的 `c0` 又復活 | 同意 | `c0` 不能刪，只能清空進度 |
| m-i 雙擊縮放 | 同意：目前只有 `.pipe-tile` 加了 `touch-action`，viewport 可以縮放 | 不改畫面行為，只加 `pointerDownCount` 先觀察；要不要加 `touch-action` 列為 Q6，交給 owner |
| 換人事件延後記錄（MJ6） | audit 同意延後 | 維持延後 |

### 10. audit4 → plan_v5

結論：沒有 blocker、沒有 major，只改文字。

| audit4 | 驗證 | 處理 |
|---|---|---|
| n1：開關打開＋別的分頁鎖住＋離開超過 10 分鐘 | 同意 | 啟動流程第 5 點：先處理「離開太久」（題目中就用 `away` 結束並 `goHome()`，鎖住時也一樣），再決定是否延後跳出選擇視窗。`hideEyeLock` 補跳選擇視窗前，`currentModule` 還有值就先 `goHome()`。R1 驗收 4 新增這個情境。 |
| n2：題目中試聽被算成 `feedback` | 同意：⚙️ 在 header（約 1731 行），題目中也點得到；`setSpeechRate` 會自動呼叫 `previewSpeech`（約 6070 行） | `previewSpeech` 呼叫 `speakText(text, 'other')`。試聽打斷題目朗讀時記 `cut`。R3 驗收 4 已更新。 |
| n3：`speakText` 以外的 cancel | 同意：`goHome` 2632 行、`closeParentSettings` 6040 行直接呼叫 `cancel()` | 所有 cancel 都改走 `cancelSpeech()`；收到 `interrupted`／`canceled` 錯誤也當成 `cut`。R3 的閱讀清單加上 `closeParentSettings` 和 `goHome`。 |
| n4：基準換成 20f7b6f | 同意：已 fetch 20f7b6f，用 grep 逐一比對各函式行號（6037 行之前跟 v4 相同；之後要 +37） | 基準改成 20f7b6f。家長設定 HTML 改成 2210–2256；家長設定 JS 改成 6027–6076；listener 和初始化改成 6104–6122，R1 涵蓋 `loadSavedProgress()`，R2 涵蓋 storage listener 的結尾。m-g 的 3142／4453 已經是新行號。 |
| n5：「改一行就能分孩子」說錯 | 同意：`speechRate` 在 script 載入時就讀（2340–2344 行） | 改成「小改動，要改好幾行」，並列出要改哪些地方。 |
| n6：schema 不一致 | 同意 | 欄位清單補上 `actions.rotations`、`evTruncated`。說明 `writeFailed` 是這位孩子 key 的狀態、只在記憶體裡，不是單筆紀錄的欄位。家長頁的結果分布補上「再挑戰沒過」（`retryEnded`），`outcome:null` 的紀錄另外列成「進行中」。紀錄 key 一律用 ID（`little_logic_qlog_v1__c0`）；重建名單時 `c0` 不會重複。 |
| n7：`LOG_BUILD` 和 `defaultProgress` | 同意：`userProgress` 是約 2396 行的物件字面值 | 規則改成「每個相關 PR 把當時的值 +1」，並在常數旁邊加註解。`defaultProgress()` 標明是「新增」。 |

各輪預算不變：R1 約 42–44K、R2 約 46–47K、R3 約 48–50K tokens（R3 多讀約 0.5K）。
