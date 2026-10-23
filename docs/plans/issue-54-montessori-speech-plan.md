# 實作計畫：數學樂園加回朗讀、先聽題再拿教具、點珠計數、除法自己分珠子（#54）

**v2**：併入計畫稽核 r1（H1、H2、M1–M7、L1–L10）與指揮官決定 Q1、Q2（2026-10-24）。

需求來源：#54（owner 已勾選）、#48 最後 5 則討論。
**基準**：main **8a3573a**。Branch `feat/m-speech`，worktree `D:/CodeWork/Other/klg-mspeech`。
行號都是 8a3573a 的，**一開始改就會漂移，實作時一律先 grep 錨點文字**。
輪次用 **S1、S2、S3**（不跟 #19 的 M*、邏輯遊戲的 R* 混淆）。一輪一個 PR，PR 標題註明合併順序（例：`[#54 S1/3]`）。

**給實作 agent**：先讀第 0～2 節和第 6 節（共通規則），再只讀你負責那一輪的小節。

---

## 0. 現況（實際讀過的程式）

| 項目 | 現況 | 位置 |
|---|---|---|
| 數學樂園朗讀 | `speakText`、`speakCurrentInstruction` 是空函式；載入時 `speechSynthesis.cancel()` | montessori_math_game.html:5181-5203 |
| 朗讀稿 | `setInstruction(text, speechText = "")`：存 `currentRawInstruction`、`currentQuestionSpeech = speechText \|\| text`，畫面用 `zy(text)` | :5205-5210 |
| `setInstruction` 呼叫 | 12 處：天平 :5817、挑戰 :7110、加法 :7237/:7241、減法 :7324/:7328、乘法 :7417、除法 :7500、銀行 :7709/:7713/:7719/:7723。只有乘法、除法給了第二個參數；其餘的朗讀稿 = 畫面文字，含 emoji 和 `<strong>`、`<span class="carry-badge">` 等 HTML | 同左 |
| 出題完成的時間點 | 7 個 `init*` 最後都呼叫 `qlogBeginQuestion()`（:5787、:7212、:7296、:7398、:7483、:7576、:7877），恰好 7 處 | 同左 |
| 題型 | `switchMode(modeId)` 1～7（:5666-5698）：1 加法、2 減法、3 乘法、4 除法、5 銀行、6 挑戰、7 天平。銀行另有 `setBankOp`／`toggleBankCarrying`（:7623-7633）直接呼叫 `initBankGame`；挑戰的 `setChallengeType`（:6914-6918）直接呼叫 `initChallengeMode` | 同左 |
| 點珠 | `onBeadTouch(el, index)`（:5261）：先 `qlogBeadTouch()`，**音效關掉就直接 return**（:5263）——叮噹聲、彈跳、數字氣泡全部不出現；氣泡顯示 `index`（珠子位置） | :5261-5295 |
| 點珠的呼叫端 | `createBeadBarsForQuantity`（:4371，減法用；十珠棒＋散珠，`index` 跨棒連號，變淡的珠子也能點）、`createBeadBar`（:5149，加法、乘法；**每根棒都從 1 開始**）、除法盤子（:7539/:7545，兩個盤子各自從 1 開始）、銀行 `fillItems`（:7798-7812，每一組各自從 1 開始） | 同左 |
| 天平 | 托盤珠子是 SVG `<circle>`，不能點（:5935-5990）；操作是 +1／−1 和 4 個選項 | 同左 |
| 挑戰 | 沒有教具；有「直式提示」按鈕（會露出答案，紀錄記 `verticalHint`） | :7105-7213 |
| 除法 | 開題就把 `divPerPerson` 顆分別放進兩個盤子（:7533-7547），畫面上只有 `➗ 2 🟰`，沒有完整算式 | :7490-7577 |
| 學習紀錄 | `MONTESSORI_LOG_BUILD = 3`（:4473）；`qlogBuildOpen` 沒有任何語音欄位，`onAnswerEvent: () => {}`（:4570）；`soundOn` 有記（:4552） | :4469-4572 |
| 點珠紀錄 | `qlogBeadTouch`：每筆紀錄第一下記 `a:beadCount`，之後只加 `aidCounts.beadCount`（每一下都加，重複點同一顆也加） | :4668-4676 |
| 家長頁 | 數學樂園家長設定沒有朗讀速度（:3040-3075） | 同左 |
| 音效開關 | `toggleSound()` 只切 `isSoundOn`（:5188-5195）；目前只有點珠叮噹聲看它 | 同左 |
| 邏輯遊戲朗讀引擎 | `SPEECH_RATES`／`SPEECH_RATE_KEY='little_logic_speech_rate'`／`speechRate`（logic_game.html:3234-3240）、`speechKindOf`（:3243-3248）、`speakText(text, kind)`（:3250-3291，`lang='zh-TW'`、`rate`、`pitch=1.2`）、`speechCurrent`／`speechSpeaking`／`isZhTw`／`getZhVoices`／`qlogZhVoiceCount`／`qlogSpeechEvent`／`cancelSpeech`／`voiceschanged` 監聽（:3888-3947）、`onAnswerEvent`（answeredDuringPrompt，:3751-3757）、紀錄的 `speech`／`promptSpeech`／`answeredDuringPrompt*`（:3838、:3844）、`setSpeechRate`／`previewSpeech`（:7839-7850）、朗讀鈕 `speakCurrentPrompt(manual)`（:4182-4214，manual 記 `a:read`） | 同左 |
| **更正 brief** | 邏輯遊戲**沒有**挑選 zh-TW 聲音：只設 `utterance.lang = 'zh-TW'`，`getZhVoices` 沒有呼叫端（註解 :3895 自己寫了），紀錄的 `voiceURI`／`voiceName` 一律 null（:3838）。所以「共用聲音挑選」= 共用 `lang='zh-TW'` 交給瀏覽器挑，S1 不新增挑聲音的邏輯 | logic_game.html:3895-3899、:3838 |
| 注音 | 數學樂園用自己的 `zy()`＋`ZhuyinMap`（728 字）＋`ZhuyinWords`，`build_zhuyin.py` 刻意排除它（tools/build_zhuyin.py:26）；缺字 `zy()` 會原樣輸出、沒有注音（:4339-4363） | 同左 |
| 回歸工具 | `logic_regress.js` 有假 speechSynthesis（tools/regress/logic_regress.js:111-150，`speak` 後 0ms onstart、字數×150ms onend、`cancel()` 觸發 `error:'interrupted'`）；`montessori_regress.js` **沒有**假語音（只假 `Sound`），也沒有點珠子 | 同左 |

**實測（scratchpad，Edge＋Playwright、`--mute-audio`、file://）**：
- `getVoices()` 等 1.5 秒仍回傳 0 個，但 `speak()` 照樣觸發 onstart／onend → **不能用「有沒有 zh-TW 聲音」決定要不要等朗讀**。
- 沒有使用者手勢時 `speak()` 也成功（headless 第一句 onstart 延遲約 2.3 秒）。一般 Chrome 沒手勢時可能回 `not-allowed`，**未驗證**（Playwright 可能放寬了 autoplay）。
- 17 個字的句子，rate 1 約 4.7 秒（約 275 ms／字）。

---

## 1. 分輪與合併順序

| 輪 | 範圍 | 規模估計 | 依賴 |
|---|---|---|---|
| **S1** | 朗讀核心從 logic 搬到 `common/family.js`；數學樂園接上自動朗讀＋🔊 再聽一次＋家長頁語速（共用設定）；紀錄加語音欄位；`montessori_regress.js` 加假語音 | family.js +~130、logic −~110／+~10、montessori +~120、regress +~45。約 #50 的六成 | #53 先合併（見第 5 節） |
| **S2** | B 先聽題再拿教具（每個題型的處理見 §3.2 表）＋A 點珠計數改成「數到第幾顆」＋音效關掉時氣泡照樣出現 | montessori +~170／−~30，family.js 不動 | S1 |
| **S3** | 除法重做：大字算式、籃子點一下發一顆、發完才出現答案按鈕；紀錄 `actions.deals` | montessori +~200／−~60、family.js +~10（報告） | S2（用到 S2 的教具閘門與計數範圍） |

**為什麼這樣切**：S1 的風險在「搬程式不能改到邏輯遊戲」，要用 logic_regress 證明一字不差，不能跟數學樂園的行為改動混在一起審。S2 依賴 S1 的「念完通知」（`onDone`）。A 和 B 都改 `onBeadTouch`／教具顯示，放同一輪才不會兩個 PR 改同一段。S3 重寫整個除法畫面，獨立一輪才審得動；它沿用 S2 的閘門和計數範圍，所以排在 S2 之後。

---

## 2. 共通設計

### 2.1 朗讀核心介面（S1 放進 family.js）

```js
// family.js（S1）
const SPEECH_RATES = { slow: 0.7, normal: 0.85, fast: 1 };   // 原樣搬
const SPEECH_RATE_KEY = 'little_logic_speech_rate';          // 原樣搬：兩個遊戲共用、每台裝置一份
let speechRate = 'slow';  /* + 原本的 localStorage 讀取 */
let speechCurrent = null, speechSpeaking = null;
familyHooks.speechKindOf = (text, kind) => kind || 'other';  // logic 換成自己的 speechKindOf
function speakText(text, kind, opts)   // opts 可省略：{ onDone(why) }
function cancelSpeech()
function speechSetRate(rate)            // 驗證 → speechRate=rate → qlogEvent('s', { kind:'rate', ph:'rate', rate: SPEECH_RATES[rate] }) → 存 localStorage；回傳 true/false
                                        // （事件的 rate 是數字，跟 logic 現在的 setSpeechRate 一字不差，logic_game.html:7842）
function speechInfo()                   // 回傳 speech 物件 { available, rateSetting, rate, voiceURI:null, voiceName:null, voiceLang:null, zhVoices, source:'tts' }
function speechPromptFields()           // 回傳 { promptSpeech:null, answeredDuringPrompt:false, answeredDuringPromptRate:null }
                                        // 拆成兩個：logic 紀錄裡 speech 在 soundOn 前面、另三個欄位在後面（logic_game.html:3838、:3844），各自展開在原位置才保得住欄位順序
function qlogSpeechAnswerEvent(r, type) // 原 logic onAnswerEvent 的內容，兩個遊戲共用
// isZhTw、getZhVoices、qlogZhVoiceCount、qlogSpeechEvent、voiceschanged 監聽：原樣搬
// 新增：storage 監聽 SPEECH_RATE_KEY → 另一個分頁改了語速，這個分頁的 speechRate 跟著改（值不合法就不理）
//       這是 S1 對 logic **唯一新增的行為**（logic_regress 沒有多分頁情境，測不到），S1 PR 說明要列出來
```

`speakText(text, kind, opts)` 的虛擬碼（**沒傳 opts 時，行為必須跟現在的 logic 一字不差**：不建立任何計時器、不多呼叫任何 API）：

```
if !('speechSynthesis' in window): if opts?.onDone → setTimeout(() => onDone('unavailable'), 0); return
cancelSpeech()
k = familyHooks.speechKindOf(text, kind); recId = qlogActive?.id ?? null
u = new SpeechSynthesisUtterance(text); u.lang='zh-TW'; u.rate=SPEECH_RATES[speechRate]; u.pitch=1.2
cur = { recId, kind:k, done:false, cut:false, rateSetting:speechRate, u, onDone:opts?.onDone||null, timers:[] }
   // u 掛在 cur 上：防 Chrome 把 utterance 回收掉、onend 永遠不來
speechCurrent = cur; （promptSpeech 照原樣寫）
onstart: 原樣；另外若有 onDone → 清掉「等開始」計時器、設「等念完」計時器 T_end
onend:   原樣；另外 finish(cur,'end')
onerror: 原樣；另外 finish(cur, err 是 interrupted/canceled ? 'cut' : 'error')
speak(u)
若有 onDone：設「等開始」計時器 T_start = 5000ms → 到了還沒 onstart → finish(cur,'timeout')
finish(cur, why): 若 cur.finished 就 return；cur.finished=true；清掉 cur.timers；try { cur.onDone && cur.onDone(why) } catch {}
cancelSpeech(): 原樣；另外對 speechCurrent 呼叫 finish(cur,'cut')（在 speechSynthesis.cancel() 之前）
```

- **T_end** = `min(30000, 2000 + speechUnits(text) * 450 / SPEECH_RATES[speechRate])`。`speechUnits`：每個漢字 1、每個阿拉伯數字 2（「2345」念成七個音節）、其他字元 0。依據：實測 rate 1 約 275 ms／字，乘 1.6 倍餘裕。
- 計時器只用 `setTimeout`（regress 的假時鐘控制得到）。`timeout` 只是讓等待的人不會卡住，**不**取消正在念的句子。
- **不變式 SP1**：每一次帶 `onDone` 的 `speakText` 呼叫，`onDone` 剛好被呼叫一次（`end`／`error`／`cut`／`timeout`／`unavailable` 其中之一），而且在呼叫後最多 `T_start + T_end` 毫秒內。
- **不變式 SP2**：沒帶 `onDone` 時，不建立任何計時器；logic_regress 輸出跟 main 一字不差。
- **不變式 SP3**：`onDone` 丟例外不能影響朗讀或紀錄（包 try/catch）。

搬移規則（沿用 #19 計畫第 1 節）：
- logic 搬走的每一個 `let`／`const`／`function` 都要刪掉原本那一份。
- **數學樂園原本的 `function speakText`（:5197）一定要刪**。後面 `<script>` 的同名 function 宣告會默默蓋掉 family.js 那一份，結果整個朗讀靜靜地不出聲。驗收 S1-A1 會檢查這一點。
- family.js 新增的程式**不放中文字串字面值**（註解可以），這樣 `build_zhuyin.py` 算 logic／index 的注音資料不會變。
  - **例外：報告標籤**（`aidLabel.read = '朗讀'`、S3 的 `actionLabel.deals = '分珠'`）。條件：每個字都必須已經在 logic 的 ZHUYIN DATA 裡（8a3573a 實查：朗、讀、分、珠都在），S1-A14 的「logic 可見漢字集合前後相同」照樣要過。
- 不在載入時呼叫 `Math.random()`。

留在各遊戲的：logic 的 `speechKindOf`（掛到 `familyHooks.speechKindOf`）、`speakCurrentPrompt`、`setSpeechRate`（改成呼叫 `speechSetRate` 再 `renderParentSettings(); previewSpeech();`）、`previewSpeech`；數學樂園的 `speechPlain`、`speakCurrentInstruction`、教具閘門（S2）。

### 2.2 數學樂園的朗讀稿：`speechPlain(text)`（S1，放在數學樂園）

把畫面文字轉成朗讀稿（順序照下面；v2 依稽核 H1 改）：
0. 去掉 HTML 標籤，`&nbsp;` 換成空白；然後刪掉**開頭的**運算 emoji 和後面的空白：`/^\s*(➕|➖|✖️?|➗)\s*/u`。
   - 原因：加法、減法的畫面文字以 ➕／➖ 開頭（montessori:7242「`➕ 請數數看：…`」、:7329「`➖ 請數數看：…`」），v1 會念成「加 請數數看…」。
1. 運算符號轉字，**只轉在數字或 ❓ 之間的**（用捕捉群組，不用 lookbehind：舊版 iPad Safari 不支援）：
   - `/(\d|❓)\s*➕\s*(?=\d|❓)/gu` → `'$1 加 '`；`➖`→「減」、`✖️`／`✖`（寫成 `✖️?`）→「乘以」、`➗`→「除以」、`🟰`→「等於」同樣寫法；
   - 最後才把 `❓`→「多少」（前面的 pattern 要靠 ❓ 判斷位置）。
   - 不在數字或 ❓ 之間的運算 emoji 不轉，交給第 3 步刪掉。例：困難題 :7238「`…滿十進一</span> ➕ 請數數看`」、:7325「`…借位退位</span> ➖ 原本有`」——去掉 HTML 後開頭是 ✨／⚡，第 0 步刪不到這個 ➕／➖，靠的是這一步不轉、第 3 步刪。
2. （v1 的「去 HTML」已移到第 0 步。）
3. 去掉其他 emoji：`/\p{Extended_Pictographic}|\uFE0F|\u200D/gu`；
4. 連續空白合成一個，去頭尾。

例：`➕ 請數數看：3 顆珠子加上 4 顆珠子…` →「請數數看：3 顆珠子加上 4 顆珠子…」；挑戰 `56 ➖ 16 🟰 ❓` →「56 減 16 等於 多少」（中文字之間會留一個空白；驗收用 `/等於\s*多少/` 比對，見 S1-A2）。

`setInstruction` 改成 `currentQuestionSpeech = speechPlain(speechText || text)`。
- 為什麼不放 family.js：它含中文字面值（見 §2.1 規則），而且 logic 用不到。

### 2.3 什麼時候念

- 新函式 `onQuestionShown()`：放在 7 個 `qlogBeginQuestion();` 的**下一行**（先開紀錄，`recId`、`promptSpeech` 才會綁在這一題的紀錄上）。
  - S1：`speakCurrentInstruction(false)`。
  - S2：再加教具閘門（§3.2）。
  - `awaitingPick` 或護眼鎖著時不念（`switchMode` 本來就會 return；`qlogBeginQuestion` 鎖著時也只關不開，這裡同樣判斷：`awaitingPick || eyeLockShown()`，同 montessori:4628）。S2 起這個分支也要處理教具閘門，見 §3.2 的 `onQuestionShown`。
- `speakCurrentInstruction(manual)`：`manual` 時先 `qlogEvent('a', 'read')`（跟 logic 的 `speakCurrentPrompt` 一樣），再 `speakText(currentQuestionSpeech, manual ? 'manual' : 'prompt', opts)`。
- 🔊 按鈕放在 `.instruction-bar` 裡、`#instructionText` 前面：`<button class="action-btn speak-btn" id="speakBtn" onclick="speakCurrentInstruction(true)" aria-label="再聽一次題目">🔊 <span id="speakBtnText"></span></button>`。文字 `zy('再聽一次')` 在 `renderNavigation` 裡設（跟 `reloadBtnText` 同一個地方，:5602-5607）；這四個字 ZhuyinMap 都有（實測）。
- **要先停掉朗讀的時機**：
  - `lockEyes`：在 `qlogClose('locked')` **之前** `cancelSpeech()`，cut 才會記進這一題，跟 logic 的 `goHome` 同一個順序（logic_game.html:4112-4113）；
  - `handleAway`：在 `qlogClose('away')` 之前；
  - 換孩子（`applyChildSwitch`）：在關紀錄之前；
  - 答對：在 `qlogAnswer(true, …)`／`qlogBalanceChoice`／`qlogBalanceStepperCorrect` **之後**。先記 `c`，`answeredDuringPrompt` 才算得到；cut 因為紀錄已經關了會被丟掉，可以接受。
- **不停**：
  - 打開貼紙簿、錯題本等彈窗時繼續念，跟 logic 一樣：logic 開彈窗時也不停；
  - 答錯時不停；
  - 切到背景時不停：logic 也不停，各瀏覽器行為不同，交給 `T_end` 兜底。
- S1 **只念題目**，不念答對、答錯、過關的回饋（owner 只要求讀題；想念回饋可以之後另開票）。

### 2.4 紀錄（與 logic schema 對齊）

- `qlogBuildOpen` 加上 `speech: speechInfo()` 和 `...speechPromptFields()`（位置比照 logic：`speech` 放在 `soundOn` 前面，另三個放在 `aids` 前面）。欄位名稱和 `speech` 的 key 要跟 logic 完全相同：`available, rateSetting, rate, voiceURI:null, voiceName:null, voiceLang:null, zhVoices, source:'tts'`，再加 `promptSpeech`、`answeredDuringPrompt`、`answeredDuringPromptRate`。
- montessori `qlogConfig.onAnswerEvent = qlogSpeechAnswerEvent`。
- `isValidLogRecord`（family.js:226）不檢查這些欄位，所以還開著的舊版分頁不會把新紀錄當成格式錯誤；舊紀錄沒有這些欄位，報告用 `r.answeredDuringPrompt` 的真假判斷，不受影響。
- 報告：family.js `QLOG_REPORT.montessori_qlog_v1.aidLabel` 加 `read: '朗讀'`。「題目還在朗讀時就作答」那一行（family.js:582、:601、:641-644）是共用的，**不用改**就會出現在數學樂園的段落。
- **`MONTESSORI_LOG_BUILD`**：
  - S1：3→4（開題會念題目，`firstAnswer.dt` 的意義變了，也開始有 `s` 事件）；
  - S2：4→5（教具延後出現、氣泡改成數到第幾顆、新欄位 `aidGate`）；
  - S3：5→6（除法流程不同、新欄位 `actions.deals`）。
  - 每一輪都會改到出題或作答，所以每輪都 +1（MONTESSORI_LOG_BUILD 註解 :4471 的規則）。
- **logic 的 `LOG_BUILD` 三輪都不動**：S1 對 logic 是純搬移，行為不變（見第 5 節）。
- **報告「第一次作答前的時間」中位數（family.js:581）不看 build**：build 3（不念）、4（念題）、5（念完才出教具）、6（除法要先分完）會混在一起算。**決定：接受混算，不加 build 篩選**。
  - 理由：要依 build 篩，得在 family.js 加新的報告設定（類似 §3.3 的 `actionMinBuild` 依欄位），S1 會多改 family.js 的報告邏輯、擴大「logic 一字不差」要證明的範圍；混算只會讓數字在過渡期逐步變長，方向跟實際一致（念題、分珠本來就花時間），不會誤導成「變快」。
  - 代價：上線後一段時間內，這個中位數介於新舊之間，不能拿來比較改版前後。S1、S2、S3 的 PR 說明各寫一句提醒。
  - 不採用的選項：只算 `build >= 6`。數字乾淨，但 S3 上線前的紀錄全部不算，而且要多一個設定欄位。

---

## 3. 每輪細節

### 3.1 S1：朗讀核心搬家＋數學樂園接上朗讀

**改動清單**

| # | 檔案:行（8a3573a） | 做什麼 |
|---|---|---|
| 1 | logic_game.html:3232-3291 | `SPEECH_RATES`、`SPEECH_RATE_KEY`、`speechRate` 讀取、`speakText` 搬到 family.js。`speechKindOf` 留下，改名或掛上 `familyHooks.speechKindOf = speechKindOf` |
| 2 | logic_game.html:3888-3947 | `speechCurrent`、`speechSpeaking`、`isZhTw`、`getZhVoices`、`qlogZhVoiceCount`、`qlogSpeechEvent`、`cancelSpeech`、`voiceschanged` 監聽搬到 family.js |
| 3 | logic_game.html:3751-3757 | `onAnswerEvent` 的內容搬成 family.js `qlogSpeechAnswerEvent`，這裡改成 `onAnswerEvent: qlogSpeechAnswerEvent` |
| 4 | logic_game.html:3838、:3844 | `speech: {…}` 改成 `speech: speechInfo()`（:3838，留在 `soundOn` 前面）；`promptSpeech… answeredDuringPromptRate` 改成 `...speechPromptFields()`（:3844，留在 `aids` 前面）。**欄位在物件裡的順序要維持**：regress 有 sortKeys 不受影響，但匯出的原始資料會看得到順序；所以拆成兩個函式、各自放在原本的位置，不能一次展開 |
| 5 | logic_game.html:7839-7846 | `setSpeechRate` 改成 `if (!speechSetRate(rate)) return; renderParentSettings(); previewSpeech();` |
| 6 | common/family.js | 新增 §2.1 全部內容；`QLOG_REPORT.montessori_qlog_v1.aidLabel.read = '朗讀'` |
| 7 | montessori:5176-5203 | 刪掉 :5181-5186 的 cancel 區塊（或保留，無害）、刪 `speakText` 空函式；`speakCurrentInstruction(manual)` 照 §2.3 實作 |
| 8 | montessori:5205 | `setInstruction` 改用 `speechPlain` |
| 9 | montessori 7 處 `qlogBeginQuestion();` | 下一行加 `onQuestionShown();` |
| 10 | montessori:2815-2818 | 加 🔊 按鈕；CSS 讓它在 ≤768px（:804 那段 column 版面）也排得下，最小 44×44 |
| 11 | montessori:8377 `lockEyes`、`handleAway`（:8497）、`applyChildSwitch`（`switchChild` :7911 與別的分頁刪孩子的 storage 監聽都走它；在它關紀錄之前） | §2.3 的 `cancelSpeech()` |
| 12 | montessori 7 個答對分支（`scheduleSuccess(` 呼叫處：天平 :6039（+1／−1 與選項兩條路徑都走這裡，:6035）、挑戰 :7187、加法 :7278、減法 :7380、乘法 :7468、除法 :7561、銀行 :7859） | 答對後 `cancelSpeech()`。建議直接在 `scheduleSuccess`（:4454）開頭呼叫：上面 7 處都是先記 qlog 再呼叫 `scheduleSuccess`，這是最少改動的位置 |
| 13 | montessori:4546-4570 | 紀錄欄位、`onAnswerEvent`、`MONTESSORI_LOG_BUILD = 4`（註解寫 `// #54 S1：開題朗讀`） |
| 14 | montessori 家長設定 :3040-3075、`renderParentSettings`（:8126） | 加一列「🔈 朗讀速度」：慢／普通／快三個按鈕（`data-rate`，樣式沿用 `.parent-btn`，選中的加 `active`＋`aria-pressed`）。旁邊註明「跟小小邏輯探險家共用；每台裝置各自記住」。`setSpeechRate` 照 logic 的寫法：`speechSetRate` → `renderParentSettings` → 試聽 `speakText('小朋友，我們一起來玩數學樂園吧！請仔細聽題目喔！', 'other')`。家長頁不加注音（沿用現況）。<br>**關閉家長頁時 `cancelSpeech()`**（logic :7812 `closeParentSettings` 也這樣做）。位置：數學樂園的家長頁沒有自己的關閉函式，✖ 用共用的 `closeModal()`（:3028 → :5637），點遮罩也是（:2606）。在 `closeModal()` 裡、呼叫 `hideModals()` **之前**判斷 `document.getElementById('parentModal').style.display === 'flex'`（家長算式畫面或設定畫面都算，跟 logic 一樣不分），是才 `cancelSpeech()`。**不要放進 `hideModals()`**（:5643）：貼紙簿、錯題本、過關視窗、護眼鎖、離開太久都走它，放進去會把關貼紙簿也變成 cut 掉題目（違反 §2.3「彈窗繼續念」）。註：`switchMode` 也會呼叫 `closeModal()`（:5671），家長在設定裡做會換題的操作時題目會被 cut，緊接著新題重念，無害 |
| 15 | tools/regress/montessori_regress.js | `initScript` 加上跟 logic_regress 一樣的假語音（照抄 :111-150，`getVoices` 回傳 []），輸出加 `speech[]`；檔頭說明同步更新 |
| 16 | `python tools/build_common.py` | 兩個 HTML 都重嵌、都 commit |

**數學樂園各題型念什麼**（S1 決定朗讀稿；畫面文字不變）：

| 題型 | 朗讀稿 |
|---|---|
| 1 加法 | 預設（畫面文字經 `speechPlain`，例：「請數數看：3 顆珠子加上 4 顆珠子，合起來一共有幾顆？」） |
| 2 減法 | 預設 |
| 3 乘法 | 已有第二參數，不變 |
| 4 除法 | 已有第二參數，不變（S3 改） |
| 5 銀行 | 預設（`carry-badge` 的「滿十進一」也會被念到，可以接受） |
| 6 挑戰 | **改**：畫面說明是通用文字「純題目算術大挑戰：脫離實體教具…」，念它對孩子沒有幫助。朗讀稿改成 `'請算算看：' + speechPlain(q.formulaText)`，例：「請算算看：3456 加 1234 等於 多少」（`speechPlain` 會在「等於」「多少」之間留一個空白，見 §2.2）。實作時在 `currentChallengeData` 產生後才呼叫 `setInstruction`，目前順序是先 `setInstruction` 再產生題目（:7110-7114），要對調 |
| 7 天平 | **改**：朗讀稿 = 畫面說明 + 算式，例：「天平兩邊一樣重才會完全水平！請在右盤放上足夠的珠子，讓天平平衡喔！8 等於 3 加多少？」，困難題是「6 加 7 等於 9 加多少？」。**算式要用 `balanceLeftParts` 組**（:5798-5812 在 `setInstruction` :5817 之前已設好）：左邊 `balanceLeftParts.join(' ➕ ')`，再接 `🟰 ${balanceBaseR} ➕ ❓`，整串經 `speechPlain`。**不能用 `questionDesc(7)`**（:4498 只有和 `balanceWeightL`，困難題會念成「13 等於 9 加多少」） |

**失敗語意（S1）**
- 沒有 `speechSynthesis`：不念、不出錯；🔊 按了沒有反應（不隱藏按鈕，跟 logic 一樣）。紀錄 `speech.available:false`。
- 沒有中文聲音：照樣用 `lang='zh-TW'` 念（跟 logic 一樣，交給瀏覽器）。實測清單可能一直是空的，所以不依它判斷。
- 第一題沒有手勢被瀏覽器擋（`not-allowed`）：`onerror` → 記 `s:error`，孩子可以按 🔊。
- `onend` 沒觸發：S1 沒有東西在等它。紀錄少一個 `s:end`，`speechSpeaking` 會一直留著，`answeredDuringPrompt` 可能高估。這是 logic 現有的行為，S1 不改，PR 說明裡記一筆。
- 快速換題、連按 🔊：每次 `speakText` 都先 `cancelSpeech()`（記 cut），舊句子的事件會被 `speechCurrent !== cur` 擋掉（原有邏輯）。
- 護眼鎖、離開太久、換孩子：先停朗讀再關紀錄。
- 彈窗：繼續念。

**不變式（S1）**
- I1：logic 行為不變。logic_regress 的輸出（含 `speech[]`）跟 origin/main 一字不差；#53 合併後跟當時的 main 比。唯一新增的行為是語速的 storage 監聽（§2.1），logic_regress 測不到，由 S1-A7 驗、PR 說明列出。logic_regress 也沒有語速路徑，由 S1-A15 補。
- I2：數學樂園每一題開題時，`speakText` 只被呼叫一次，kind 是 `'prompt'`，text 等於 `currentQuestionSpeech`。朗讀稿裡沒有 `<`、`>` 和 emoji。
- I3：數學樂園的紀錄 `speech` 物件 key 集合跟 logic 的完全相同。
- I4：鎖住／離開時不會留下還在念的句子（`speechSynthesis.cancel` 有被呼叫）。

**驗收（Playwright，file://，`args:['--mute-audio']`，msedge，假時鐘＋假語音，harness 放 scratchpad）**

假語音沿用 logic_regress 的版本，另外做 4 種變形：`V-none`（刪掉 `window.speechSynthesis`）、`V-noend`（有 onstart、永遠沒有 onend）、`V-nostart`（什麼事件都不觸發）、`V-deny`（`speak` 後 0ms 觸發 `error:'not-allowed'`）。

| 案例 | 步驟 | 預期 |
|---|---|---|
| S1-A1 | 載入數學樂園 | `speakText.toString()` 含 `SpeechSynthesisUtterance`。family.js 頂層名稱在兩個 HTML 的主程式裡沒有重複宣告（名稱衝突檢查腳本） |
| S1-A2 | 依序切 7 個題型 | 每切一次 `__regressSpeech` 剛好多 1 句；內容等於 `currentQuestionSpeech`，不含 `<`、`>`、`\p{Extended_Pictographic}`。挑戰那句以「請算算看」開頭、符合 `/等於\s*多少/`（`speechPlain` 在中文字之間留空白，不能比對字串「等於多少」）；天平那句含「等於」，困難題含兩個加數；減法困難題不含 `carry-badge` |
| S1-A2b | 加法、減法、加法困難（`isCarry`）、減法困難（`isBorrow`）各開一題 | 朗讀稿不以「加」「減」開頭，不含「加 請」「減 請」（對應 H1：畫面文字開頭的 ➕／➖ 不可以念出來） |
| S1-A3 | 加法開題後 300ms（還在念）答錯一次，再答對 | 紀錄 `build:4`、`answeredDuringPrompt:true`、`answeredDuringPromptRate:'slow'`、`promptSpeech.kind:'prompt'`、`ev` 含 `s` 的 start；答對後 `speechSynthesis.cancel` 被呼叫 |
| S1-A4 | 等念完（`runFor(字數×150+100)`）再答對 | `answeredDuringPrompt:false`、`ev` 含 `s:start`、`s:end` |
| S1-A5 | 按 🔊 → 答對 → 開家長頁報告 | 按下後多 1 句，kind `manual`；`aidCounts.read === 1`；報告的數學樂園段落出現「朗讀 1」。**一定要先答對**：報告只算 `outcome !== null` 的紀錄（family.js:573-576），還開著的那題不算 |
| S1-A6 | 家長頁按「快」 | `localStorage.little_logic_speech_rate === 'fast'`。接著開 logic_game.html（同一個 context）念一題：utterance 的 `rate === 1`。反過來在 logic 設「慢」，數學樂園下一題的 rate 是 0.7 |
| S1-A7 | 兩個分頁：A 是 logic，B 是數學樂園。A 改成「普通」 | B 的 `speechRate === 'normal'`（storage 監聽），不用重新整理 |
| S1-A8 | 題目還在念時護眼鎖住（同 #19 的鎖法：預先寫 eyecare 快到上限） | 紀錄 `outcome:'locked'`，`ev` 最後一個 `s` 是 `cut`；鎖住後 `speechSynthesis.speaking === false` |
| S1-A9 | `V-none` 跑 S1-A2 | 沒有 pageerror；紀錄 `speech.available:false`、`promptSpeech:null`；🔊 按了沒有錯誤 |
| S1-A10 | `V-deny` | 紀錄 `ev` 有 `s:error`，沒有 pageerror |
| S1-A11 | 連按 🔊 5 下（每下間隔 10ms） | 只有最後一句念完；cut 剛好 5 個（第一句和前 4 次重聽各一個）；沒有 pageerror |
| S1-A12 | 回歸 | 見下方「回歸預期」 |
| S1-A13 | 版面 | 360×640、768×1024、1280×900：🔊 ≥44×44、不擋「重新整理」、沒有水平捲動；截圖存 scratchpad |
| S1-A14 | build 衛生 | `build_common.py` 再跑一次 `git diff --exit-code` 沒有東西。logic／index 的 ZHUYIN DATA 沒變：沒有 moedict 就改比對「logic_game.html 可見文字的漢字集合」前後相同，用 build_zhuyin 的 `visible_text` 規則寫一個小腳本 |
| S1-A15 | logic 語速路徑（logic_regress 沒涵蓋：main 的輸出 `"kind":"rate"` 0 次） | logic 開一題，家長頁按「快」。main 與 branch 跑同一個腳本：紀錄 `ev` 都含 `['s',{kind:'rate',ph:'rate',rate:1}]`（`rate` 是數字，不是 `'fast'`）；試聽句內容與 `localStorage.little_logic_speech_rate` 兩邊相同 |
| S1-A16 | 數學樂園題目念到一半，打開貼紙簿再關掉（✖ 與點遮罩各一次） | 朗讀沒有被 cut：`ev` 沒有新的 `s:cut`，那句照樣 `s:end`。再開家長頁、關掉 → 這次有 `s:cut`（對應 S1 改動 #14：cancel 只在關的是家長頁時） |

**改壞清單（S1）**

| 突變 | 會轉紅的案例 |
|---|---|
| 沒刪數學樂園的 `speakText` 空函式 | A1、A2 |
| `onQuestionShown` 放在 `qlogBeginQuestion` 前面 | A3（`promptSpeech` 會寫在上一筆或寫不進去） |
| 忘了接 `onAnswerEvent` | A3 |
| `speechPlain` 沒去 HTML／emoji | A2 |
| 挑戰還是念通用說明 | A2 |
| 答對沒有 cancel | A3 |
| `lockEyes` 先關紀錄再 cancel | A8（cut 記不到） |
| 語速只寫進數學樂園自己的 key | A6 |
| 沒加 storage 監聽 | A7 |
| `aidLabel.read` 沒加 | A5（報告顯示「read 1」） |
| 沒傳 onDone 也建了計時器，或改了 logic 的事件順序 | A12（logic_regress 有 diff） |
| `speechInfo`／`speechPromptFields` 少 key | I3 的檢查（放在 A3 裡比對 key 集合） |
| `speechPlain` 運算符號不分位置一律轉字 | A2b（「加 請數數看」） |
| `speechSetRate` 的事件 `rate` 寫成設定名稱（`'fast'`） | A15 |
| `cancelSpeech()` 放進 `hideModals()` | A16（關貼紙簿也 cut） |

**回歸預期（S1）**
- `logic_regress.js`：branch 和 main 的輸出**一字不差**（含 `speech[]`）。
- `montessori_regress.js`：先在 main 上用**新的** harness 跑一次（main 本來就不念，假語音只會讓 `speech: []` 這個新欄位出現），再跟舊 harness 的輸出比，除了 `speech` 之外要相同。然後比 main 與 branch（都用新 harness），只允許這些差異：
  - `speech[]` 多了每題的朗讀稿；
  - 紀錄 `build: 4`；
  - 紀錄多了 `speech`、`promptSpeech`、`answeredDuringPrompt`、`answeredDuringPromptRate`；
  - `ev` 多了 `s` 事件；
  - harness 開題後很快就作答，所以 `answeredDuringPrompt` 會是 true。
  - PR 裡逐條列出差異路徑。

### 3.2 S2：先聽題再拿教具（B）＋點珠計數（A）

#### B：教具閘門

**每個題型怎麼處理**（逐一讀過 `init*`）：

| 題型 | 教具 | S2 處理 |
|---|---|---|
| 1 加法（:7219） | `#addBarA`、`#addBarB` 兩根串珠棒 | 念完才出現 |
| 2 減法（:7303） | `#subBeadContainer`（含變淡的珠子） | 念完才出現 |
| 3 乘法（:7405） | `#mulArrayHolder` 多根串珠棒 | 念完才出現 |
| 4 除法（:7490） | `#plateA`、`#plateB` 盤子裡的珠子 | 念完才出現（盤子框照樣顯示，只藏珠子）。S3 會整個換成籃子 |
| 5 銀行（:7635） | `.bank-board` 裡 8 個 `.bank-item-group`（🧱🔲🥖🟡） | 念完才出現（藏 8 個 group，欄位標題與 ❓ 結果格照樣顯示） |
| 6 挑戰（:7105） | 沒有教具（直式提示是提示，不是教具） | **不處理** |
| 7 天平（:5780） | SVG 托盤珠子（不能點）、+1／−1 | **不處理**：天平圖本身就是題目（盤子上寫「8 顆」），藏起來題目就看不懂了；+1／−1 是作答方式，不是數數的教具 |

**作法**
- 每個要等的容器加 class `aid-gated`（`visibility:hidden`，保留版面，避免念完時版面跳動）。
- 容器上方放一個提示 `<div class="aid-wait" aria-live="polite">`，內容 `zy('👂 先聽題目，珠子等一下就出來！')`。這些字 ZhuyinMap 都有；「馬上」的「馬」缺字，所以不用。
- 念完時移除 `aid-gated`、加 `aid-reveal`（0.3s 淡入，`prefers-reduced-motion` 時不做動畫），並移除 `.aid-wait`。

```js
let promptSeq = 0;          // 每次 onQuestionShown +1
let promptOwner = null;     // 目前負責這一題閘門的那一句（token）
function onQuestionShown() {
  const seq = ++promptSeq;           // 一律先 +1（含不念的情況），舊題目的回呼才會全部失效
  const gated = document.querySelectorAll('#gameContent .aid-gated');
  aidGateState = { seq, t0: Date.now(), open: gated.length === 0 };
  if (awaitingPick || eyeLockShown()) { revealAids(seq, 'skip'); return; }   // 不念（§2.3）→ 教具直接出現，不留卡住的閘門
  speakCurrentInstruction(false);    // 內部用 speakPromptForGate
}
function speakPromptForGate(kind) {   // speakCurrentInstruction 呼叫
  const seq = promptSeq, token = {};
  promptOwner = token;
  speakText(currentQuestionSpeech, kind, { onDone: why => {
    if (seq !== promptSeq) return;                         // 已經換題（防禦性寫法：promptOwner 與 revealAids 的 seq 比對已經擋住，可以沒有對應案例）
    if (why === 'cut' && promptOwner !== token) return;    // 被同一題較新的題目朗讀（🔊）取代：等新的那句
    revealAids(seq, why);
  }});
}
function revealAids(seq, why) {       // 冪等
  if (seq !== promptSeq || aidGateState.open) return;
  aidGateState.open = true;
  移除 .aid-gated、.aid-wait；
  qlog：if (qlogActive && qlogActive.outcome === null) qlogActive.aidGate = { dt: Date.now() - qlogActive.tOpen, why };
}
```

- 🔊 在等待中按：新的一句成為 `promptOwner`，舊的那句 cut 被忽略，等新的那句結束才出現。教具已經出現後再按 🔊，不會再藏起來。
- 被不是題目朗讀的東西 cut（家長頁試聽、答對、鎖住、離開）→ `promptOwner` 還是原本那句 → 出現（不會卡住）。
- 換題：`promptSeq` 變了，舊題目的 onDone 一律忽略。新題目的 DOM 是重建的，所以舊題目的 reveal 不可能作用在新題目上。
- 沒有 `speechSynthesis`：`onDone('unavailable')` 在下一個 tick → 馬上出現。
- 鎖著、`awaitingPick` 時 `onQuestionShown` 不念，直接 `revealAids(seq, 'skip')`；這時 `qlogBeginQuestion` 沒有開紀錄，所以不會寫 `aidGate`（`why` 的值域因此多一個 `'skip'`，只在這個分支出現）。
- `error`、`timeout` → 出現；`why` 記進 `aidGate.why`。如果是 `error`／`timeout`，🔊 加 class `speak-hint`（脈動 3 次），提醒孩子可以按來聽。
- **答案按鈕不藏**：owner 勾選的是「珠子才出現」。孩子沒聽完題就作答，會記成 `answeredDuringPrompt`。要不要連選項一起延後，列為開放問題 Q3。

**失敗語意（S2 B）**

| 狀況 | 結果 | 最久等多久 |
|---|---|---|
| 沒有 speechSynthesis | 下一個 tick 出現，`why:'unavailable'` | 0 |
| 被瀏覽器擋（`not-allowed`）、引擎出錯 | 出現，`why:'error'` | 收到 onerror 為止 |
| onstart 不來 | 出現，`why:'timeout'` | 5 秒 |
| 有 onstart、沒有 onend（Chrome 已知問題、長句被截） | 出現，`why:'timeout'` | `T_end`，上限 30 秒 |
| 切到背景 | 計時器照走（瀏覽器可能放慢背景計時器，回來後照樣會到期）；回來時可能已經出現 | 同上 |
| 護眼鎖、離開太久、換孩子 | cancel → 出現在即將被換掉的題目上（無害）；解鎖或選好孩子後出新題、重新等 | — |
| 彈窗開著 | 朗讀繼續；念完照樣出現在彈窗後面 | — |
| 快速換題 | 只有最新一題的 onDone 有作用 | — |
| 重聽競態 | 見上面的 `promptOwner` 規則 | — |

**不變式（S2 B）**
- G1：自該題**最後一次**題目朗讀（`prompt`／`manual`）呼叫 `speakText` 起，`T_start + T_end(該題)` 毫秒內教具一定出現（失敗一律往「顯示」走）。等待中重按 🔊 會重新計時，這是刻意設計（要等孩子重聽的那句念完）；所以 G1 **不是**「開題後固定上限」——原型實測每隔 `T_end − 1000` 按一次 🔊，65.7 秒後教具仍藏著，符合這個定義。不念的分支（鎖著、`awaitingPick`）在 `onQuestionShown` 當下就出現。
- G2：教具只會被同一個 `promptSeq` 的回呼打開。
- G3：教具打開後，同一題裡不會再被藏起來。
- G4：挑戰、天平的畫面跟 S1 完全一樣，不會出現 `.aid-wait`。

#### A：點珠計數改成「數到第幾顆」

**定義**
- **計數範圍（scope）**：一組一起數的珠子，各自有一個計數器。

| 題型 | scope |
|---|---|
| 加法 | 整題一個（兩根棒連續數，數完 = 和） |
| 減法 | 整題一個，**只算亮的珠子**（數完 = 剩下幾顆，就是答案） |
| 乘法 | 整題一個（所有棒連續數） |
| 除法 | S2：每個盤子各一個；S3 見 §3.3 |
| 銀行 | 每一位（千、百、十、個）各一個，A、B 兩組合在一起數；減法時變淡的那組不算 |

- **點一下沒數過的珠子**：該 scope 計數 +1，這顆珠子記住自己的號碼（`data-count-n`，加 class `counted`，淡淡的外框），氣泡顯示這個號碼。
- **點已經數過的珠子**：計數不加，氣泡再顯示一次它自己的號碼，用淺色的氣泡（class `bead-count-bubble repeat`）。所以同一顆點兩次不會多算，每顆都點到才會數到總數。
  - 不採用「每點一下都 +1」：連點同一顆就能點到總數，又回到 #48 指出的問題。
- **變淡的珠子**（減法、銀行減法）：不計數，不出氣泡，只有輕輕的搖晃（class `bead-nope`）。理由：題目問的是剩下幾顆。另一個選項見開放問題 Q4。
- **換題重置**：計數器存在 DOM 上，每次 `init*` 重建 DOM 就自動歸零（新題、換難度、換題型、重新整理、錯題本再練一次、銀行切加減與進退位、挑戰換分類都會重建）。不另外留全域狀態，所以不會有殘留。
- **數到總數時**：不另外慶祝、不提示答案。氣泡就是數字，跟現在一樣。
- **音效關掉時**：計數、彈跳、氣泡**照樣出現**，只有叮噹聲看 `isSoundOn`。現在音效關掉時連氣泡都沒有（:5263），等於關掉了數數功能，這是 bug。這個改法跟之後「音效開關管全部音效」那一輪相容：叮噹聲仍然受開關控制。
- **叮噹聲**音高改用計數號碼（`chimeNotes[(n-1) % 6]`），重複點的用同一個音。

**介面**

```js
// 所有點珠呼叫端改成 onBeadTouch(el)；scope 從 DOM 找：el.closest('[data-count-scope]')
// createBeadBarsForQuantity／createBeadBar 不再自己決定編號；init* 在對應容器上加 data-count-scope
function onBeadTouch(el) {
  qlogBeadTouch();                                     // 每一下都記（含重複），語意不變
  if (el.classList.contains('removed')) { nope(el); return; }
  const scope = el.closest('[data-count-scope]'); if (!scope) return;
  let n = Number(el.dataset.countN) || 0; const repeat = n > 0;
  if (!repeat) { n = (Number(scope.dataset.countNext) || 0) + 1; scope.dataset.countNext = n; el.dataset.countN = n; el.classList.add('counted'); }
  if (isSoundOn) chime(n);
  bounce(el); bubble(el, n, repeat);
}
```

- 每顆珠子的 `title`（例：「第 3 顆珠子」）會洩漏位置編號。改成不含號碼的「珠子」「金色十珠棒的珠子」，`title` 不用 zy。

**紀錄（S2）**
- `beadCount` 語意不變：每點一下就加（含重複點和變淡的珠子）。家長報告「數串珠：N 次」不變。
- 新增 `aidGate: { dt, why } | null`（挑戰、天平一律 null）。
- `MONTESSORI_LOG_BUILD` 4→5，註解 `// #54 S2：念完才出教具、點珠改數第幾顆`。
- 不新增「數到總數沒有」的欄位：family.js 報告不動，S2 只改數學樂園一個檔。

**注音（S2）**：新字串只有 `.aid-wait` 那一句（字都在 ZhuyinMap，實測）。實作時若改了措辭，跑 §6 的缺字檢查。

**驗收（S2）**

| 案例 | 步驟 | 預期 |
|---|---|---|
| S2-A1 | 加法開題，念的途中查教具 | `#addBarA` 的 computed `visibility === 'hidden'`、`.aid-wait` 存在；`runFor(字數×150+50)` 後 visible、`.aid-wait` 消失；紀錄 `aidGate.why === 'end'`、`aidGate.dt ≈ 字數×150`（±50） |
| S2-A2 | 2、3、4、5 題型同 A1 | 各自的教具先藏後出 |
| S2-A3 | 挑戰、天平 | 沒有 `.aid-wait`、沒有 `.aid-gated`；`aidGate === null` |
| S2-A4 | `V-none` | 開題後 `runFor(10)` 教具就出現，`why:'unavailable'` |
| S2-A5 | `V-noend` | 在 `T_end` 前 1ms 還藏著，`T_end` 後出現，`why:'timeout'`，🔊 有 `speak-hint` |
| S2-A6 | `V-nostart` | 5000ms 前藏著、之後出現，`why:'timeout'` |
| S2-A7 | `V-deny` | 下一個 tick 出現，`why:'error'` |
| S2-A8 | 念到一半按 🔊 | 教具仍藏著，直到第二句念完；`aidGate.why:'end'`，`dt` ≈ 按的時間＋第二句長度 |
| S2-A9 | 念到一半連續換題 3 次（點 tab） | 最後一題的教具在它自己那句念完才出現；前兩題的 onDone 沒有作用（中途檢查最後一題仍藏著） |
| S2-A9b | 用 spy 包 `speakText`，抓下第 1 題那次呼叫的 `opts.onDone`；換到第 2 題（還在念），手動呼叫抓到的 `onDone('end')` | 第 2 題的教具仍藏著、`.aid-wait` 還在；第 2 題紀錄沒有 `aidGate`。（專門打 `revealAids` 的 seq 比對） |
| S2-A10 | 念到一半打開家長頁並改語速（試聽 cut 掉題目） | 教具出現，`why:'cut'` |
| S2-A11 | 念到一半護眼鎖住 → 家長解鎖 | 新題目重新等；沒有 pageerror |
| S2-A12 | 加法 3+4，依序點 A 棒 3 顆、B 棒 4 顆 | 氣泡依序 1…7 |
| S2-A13 | 加法：點 B 棒第 1 顆、再點 A 棒第 3 顆、再點 B 棒第 1 顆 | 氣泡 1、2、1（第三下是 repeat、淺色：B 棒第 1 顆第一次點時記住的號碼是 1）；`aidCounts.beadCount === 3` |
| S2-A14 | 加法：直接點最後一顆 | 氣泡是 1（不是 7）。**這一條直接對應 #48 的問題** |
| S2-A15 | 減法 7−3：點一顆變淡的珠子，再點全部亮的 | 變淡的那顆沒有氣泡；亮的數到 4 |
| S2-A16 | 減法困難題（十珠棒＋散珠，`subTotal`>10） | 跨棒連續數，數完亮的 = `remain` |
| S2-A17 | 乘法 3×4 點完全部 | 最後一個氣泡是 12 |
| S2-A18 | 銀行加法：點千位 A 的 2 個、千位 B 的 1 個、再點個位 1 個 | 3 個千位的氣泡是 1、2、3；個位是 1 |
| S2-A19 | 音效關掉（`toggleSound`）後點珠 | 氣泡照樣出現；`Sound.ctx` 的 oscillator 沒有被建立（stub `createOscillator` 計數為 0） |
| S2-A20 | 數到一半換題，回到同題型 | 新題目第一下是 1 |
| S2-A21 | 所有珠子的 `title` | 不含阿拉伯數字 |
| S2-A22 | 回歸 | montessori_regress：只允許 `build:5`、`aidGate` 欄位的差異。harness 不點珠子，所以氣泡改動不會出現在輸出裡。logic_regress：一字不差（S2 不碰 logic，也不碰 family.js） |

**改壞清單（S2）**

| 突變 | 轉紅 |
|---|---|
| 氣泡仍顯示位置 `index` | A13、A14 |
| 重複點也 +1 | A13 |
| 變淡的珠子也計數 | A15 |
| `createBeadBar` 每根各自計數（scope 放在棒上） | A12 |
| 銀行整題一個 scope | A18 |
| 忘了刪 `if (!isSoundOn) return` | A19 |
| `revealAids` 不比對 `seq` | A9b（第 1 題的 onDone 打開第 2 題的教具）。註：v1 的「onDone 沒比對 `promptSeq`」是等價突變——`promptOwner` 比對與 `revealAids` 的 seq 比對已經擋住，沒有案例會轉紅，所以改突變這裡 |
| cut 一律忽略 | A10（永遠不出現：cut 時 `finish` 已經把計時器清掉，不會再有 timeout 兜底） |
| cut 一律出現 | A8（重聽時提早出現） |
| 沒有 timeout 兜底 | A5、A6 |
| 天平也套閘門 | A3 |
| 用 `display:none` 而不是 `visibility:hidden` | A1 的 visibility 斷言 |

### 3.3 S3：除法重做

**畫面**（取代 :7505-7547 的 innerHTML 與盤子填珠）
1. **大字算式** `#divFormula`：`<span>6</span> ÷ <span>2</span> = <span id="divQuestionCard">?</span>`。照 owner 的寫法用 `÷`、`=`、`?`，不用 emoji。樣式沿用銀行的 `.big-formula-display`。
2. 說明列：`zy('🧺 點一下籃子，一人一顆分給小熊和小兔！')`。字都在 ZhuyinMap，不用「發」（缺字）。
3. **籃子** `#divBasket`（`<button>`，aria-label「籃子，點一下分一顆」）：裡面 N 顆 `.bead.bead-10`，用 `aid-gated` 等念完。
4. 兩個盤子 `#plateA`／`#plateB`：一開始是空的。
5. 答案區 `#divChoices`：一開題就把 4 個按鈕產生好（`qlogChoiceCount` 才會是 4，`p:1/4` 不變），但容器用 **`style.display = 'none'`** 藏起來，等全部分完改回 `''`。
   - **不能用 `hidden` 屬性**：`#divChoices` 有 class `choice-area`（:7530），`.choice-area { display: flex }`（:520-526）會蓋掉瀏覽器內建的 `[hidden] { display: none }`，全檔也沒有 `[hidden]` 規則，computed display 仍是 flex、按鈕照樣看得到按得到。
   - 另一個可行寫法：CSS 加 `#divChoices[hidden] { display: none !important; }` 再用 `hidden`。兩者擇一，驗收一律看 computed style（S3-A1、A3、D2）。

**流程**
- `setInstruction` 畫面文字不變。朗讀稿改成 `${N} 除以 2 等於多少？一共有 ${N} 顆珠子，公平分給小熊和小兔，每隻小動物可以分到幾顆呢？`。先念算式，符合 owner 的「朗讀時一起唸」。
- 念完 → 籃子出現（S2 閘門）。
- **點籃子一下**（或點籃子裡任何一顆）= `divDeal()`。**只綁在 `#divBasket` 的 click 上**（事件委派：籃子裡的珠子沒有自己的 onclick，點到會冒泡到籃子）。搬進盤子的珠子離開了籃子，不會再觸發 `divDeal`；它們改綁 `onBeadTouch`（S2 的 A），避免點盤子裡的珠子又分一次：
  - 把籃子裡第一顆珠子搬到 `dealt % 2 === 0 ? plateA : plateB`，然後 `dealt++`；
  - `qlogEvent('x', 'deal')`；叮噹聲看 `isSoundOn`；
  - 動畫只用 CSS（搬到盤子後加 class 跳一下），**不用計時器**，所以沒有競態。
- **分完**（`dealt === N`）：
  - 籃子按鈕停用、顯示「分完了！」；
  - 答案容器 `style.display = ''`（顯示）；
  - 兩個盤子各自變成計數 scope（這時才加 `data-count-scope`），可以點珠子數（S2 的 A）。分珠途中盤子裡的珠子**不能**點著數（沒有 scope，`onBeadTouch` 只記 `beadCount` 就 return），避免跟「分」混在一起。
- **算式什麼時候變成 `6 ÷ 2 = 3`**：**已決定（Q1，2026-10-24 指揮官經使用者確認）：答對時**才把 `?` 換成答案，跟其他題型的 ❓ 卡一樣（例：加法 :7276）。
  - 寫成 `let DIV_RESULT_REVEAL = 'answer';`（**用 `let`**：測試要從 `page.evaluate` 改成 `'dealt'`，top-level `const` 改不了）。另一個值 `'dealt'` = 分完當下就顯示（owner 勾選字面上的「算式同時顯示結果」）。兩個值都要在驗收裡跑過。
  - 這與 owner 勾選字面不同：**S3 的 PR 說明要寫明差異與理由**——分完當下就顯示的話，答案寫在畫面上，4 選 1 只剩照抄；答對才顯示跟其他題型的 ❓ 卡一致。
- 答錯：沿用現有的錯題本、音效、小熊（:7563-7571）。
- `questionDesc(4)`、`qk` 不變（錯題本、紀錄延續）。

**紀錄（S3）**
- montessori `actionsTemplate` **維持 `{ steps: 0 }`**（:4568），`countAction` 加上 `x:'deal'` → 回傳 `'deals'` 即可：`qlogCountAction` 遇到範本裡沒有的欄位會從 0 起算（family.js:482 `(Number(r.actions[field]) || 0) + 1`）。
  - 不在範本加 `deals: 0`：否則天平紀錄會從 `{"steps":9}` 變成 `{"steps":9,"deals":0}`（family.js:480 用範本建 `actions`），回歸多出不必要的差異。除法紀錄的 `actions` 會是 `{ steps: 0, deals: N }`（`steps:0` 來自範本，報告的 `actionFields.div` 只看 `deals`，不受影響）。
- family.js `QLOG_REPORT.montessori_qlog_v1`：`actionLabel.deals = '分珠'`、`actionFields.div = ['deals']`。
- **`actionMinBuild` 要能依欄位給**：現在是整個遊戲一個數字（family.js:543；使用處在 `qlogReportStats`，嵌入後的 montessori :3677）。如果改成 6，天平 build 3～5 的 `steps` 紀錄就不算了；維持 3，除法 build 3～5 的紀錄會被當成 `deals:0`，把中位數拉低。
  - 改法：`actionMinBuild` 可以是數字，或 `{ steps: 3, deals: 6 }`；`qlogReportStats` 依欄位篩。
  - logic 那一份維持數字 2，行為不變。
- `MONTESSORI_LOG_BUILD` 5→6，註解 `// #54 S3：除法自己分珠子`。
- 分完前作答不可能（按鈕藏著），所以除法 `firstAnswer.dt` 一定包含分珠時間；PR 說明裡註明。
- `python tools/build_common.py` 重嵌兩個 HTML。logic 的報告設定只是資料沒變，所以 logic_regress 要一字不差。

**失敗語意（S3）**
- 沒有語音 → 籃子馬上出現（S2）。
- 快速連點籃子：每一下都是同步搬一顆，`dealt` 不會超過 N（`if (dealt >= N) return`）。
- 分到一半換題、鎖住、離開：DOM 重建，狀態全部在這一題的 closure／DOM 裡，不會殘留。
- 鍵盤：籃子是 `<button>`，Enter／Space 也能分。點擊紀錄 `t` 照樣記（`qlogEventTarget`）。
- 錯題本「再練一次」出的是同題型新題目，流程一樣。

**不變式（S3）**
- D1：任何時刻 `|plateA 的珠子數 − plateB 的珠子數| ≤ 1`，而且 A ≥ B。籃子＋兩個盤子 = N。
- D2：`dealt < N` 時答案按鈕看不到，也按不到：`getComputedStyle(#divChoices).display === 'none'`，每個按鈕 `getBoundingClientRect().height === 0`（`display:none` 也讓鍵盤 Tab 碰不到）。不准只看屬性。
- D3：`DIV_RESULT_REVEAL='answer'` 時，答對之前畫面上（含 `title`、aria）找不到答案數字以「= 答案」的形式出現。
- D4：`actions.deals === N` 時才可能有 `firstAnswer`。

**驗收（S3）**

| 案例 | 步驟 | 預期 |
|---|---|---|
| S3-A1 | 除法開題 | `#divFormula` 文字 = `${N} ÷ 2 = ?`；朗讀稿以「${N} 除以 2 等於多少」開頭；盤子空的；`getComputedStyle(#divChoices).display === 'none'` 且每個按鈕 `getBoundingClientRect().height === 0`（不准只看 `hidden` 屬性或 `style`），裡面有 4 個 button；紀錄 `nOptions:4` |
| S3-A2 | 念完前點籃子 | 籃子是 `visibility:hidden`，點不到（Playwright `click` 會等到逾時，改用 `elementFromPoint` 斷言不是籃子） |
| S3-A3 | 念完後點 N−1 下 | 每一下之後都符合 D1；答案仍看不到（同 A1 的 computed display／按鈕高度斷言） |
| S3-A4 | 再點 1 下 | 答案出現；籃子停用；`actions.deals === N`；`'answer'` 模式算式仍是 `?` |
| S3-A5 | 答對 | 算式變成 `${N} ÷ 2 = ${N/2}`；`build:6` |
| S3-A6 | `page.evaluate(() => { DIV_RESULT_REVEAL = 'dealt'; })`（實作是 `let`，見流程）後重開一題除法 | 分完當下算式就顯示結果 |
| S3-A7 | 分完後點小熊盤子的珠子 | 氣泡 1…N/2；點小兔盤子從 1 開始 |
| S3-A8 | 分到一半點小熊盤子的珠子 | 沒有計數氣泡 |
| S3-A9 | 連點籃子 N+3 下（10ms 間隔） | `deals === N`，D1 成立，沒有 pageerror |
| S3-A10 | 鍵盤：focus 籃子按 Enter N 次 | 同 A4 |
| S3-A11 | 分到一半換到加法再回除法 | 新題目，`dealt` 從 0 開始 |
| S3-A12 | 家長頁報告（除法 1 題 + 天平 1 題） | 除法那組出現「動作數（中位數）：分珠 N」；天平那組 `steps` 中位數跟 S2 時相同（`actionMinBuild` 依欄位） |
| S3-A13 | 困難題（N 最大 16） | 360×640 下籃子與兩個盤子不用水平捲動；截圖 |
| S3-A14 | 注音缺字檢查（§6） | 除法畫面跟 main 同一畫面比，**新增的**缺字 0 個 |
| S3-A15 | 回歸 | montessori_regress 的 mode 4 步驟一定會變：harness 不分珠，答案按鈕藏著，`click` 會逾時 → 情境失敗。**S3 要一起更新 harness**：<br>① 假語音加 `window.__regressSpeechFinish()`：**不推進假時鐘**，立刻觸發目前那句的 `onend`（沒有在念就什麼都不做）。mode 4 用它打開籃子，**不准用 `runFor` 等假語音念完**（約 7 秒），否則題型 5～7 的時間戳會全部往後移、整片 diff。<br>② mode 4：`__regressSpeechFinish()` → 點籃子 N 下 → 作答；檔頭「情境」補一句。<br>允許的差異：mode 4 的 `choices`、`build:6`、`actions`（`null` → `{steps:0,deals:N}`）、`ev` 裡的 `x:deal`／`t`／`s:end`，以及念完才作答帶來的 `aidGate`（變成 `{dt, why:'end'}`）、`answeredDuringPrompt`（變 false）／`answeredDuringPromptRate`；其他題型一字不差（天平 `actions` 仍是 `{"steps":…}`，不得多 `deals`）。logic_regress 一字不差 |

**改壞清單（S3）**

| 突變 | 轉紅 |
|---|---|
| 開題就分好 | A1（盤子不是空的） |
| 輪流方向寫反或用亂數 | A3（D1 的 A ≥ B） |
| 答案按鈕一開始就顯示 | A1、A3 |
| 答案按鈕到分完才產生 | A1（`nOptions` 變 null） |
| 分完前就顯示 `= 3` | A4 |
| 沒擋 `dealt >= N` | A9 |
| `actionMinBuild` 直接改成 6 | A12（天平 steps 變了） |
| 盤子分珠途中就能數 | A8 |
| 答案容器用 `hidden` 屬性藏（沒有配 CSS） | A1、A3（computed display 仍是 flex） |
| 每顆珠子各自綁 `divDeal`（搬進盤子後點了又分一次） | A7（點小熊盤子的珠子 `deals` 變多、沒有計數氣泡） |
| `actionsTemplate` 加 `deals: 0` | A15（天平 `actions` 多了 `deals`） |

---

## 4. 設計決定（已決定的列理由；需要別人決定的在第 7 節）

| # | 決定 | 選項 | 建議與理由 |
|---|---|---|---|
| D1 | 朗讀核心放哪裡 | (a) family.js 共用 (b) 數學樂園複製一份 | (a)。#54 明寫「不另外複製一份」；語速、紀錄欄位要兩邊一致。代價：S1 要證明 logic 一字不差 |
| D2 | 「念完」怎麼知道 | (a) `speakText` 加 `opts.onDone` (b) 輪詢 `speechSynthesis.speaking` | (a)。事件驅動，假時鐘測得到。(b) 在 Chrome 背景分頁、iOS 上不可靠 |
| D3 | onend 不來怎麼辦 | (a) 依字數估的逾時 (b) 固定 10 秒 (c) 讓孩子點「跳過」 | (a)，上限 30 秒＋5 秒等開始。(b) 長句會被截斷、短句等太久；(c) 會讓 B 形同虛設 |
| D4 | 失敗方向 | 顯示或繼續藏 | 一律顯示（G1）。卡住不能玩比「沒聽完就看到珠子」糟 |
| D5 | 等待時怎麼藏 | `visibility:hidden` 或 `display:none` | `visibility`，版面不跳 |
| D6 | 答案按鈕要不要也等 | 只藏珠子或連選項一起藏 | 只藏珠子（owner 勾的範圍）。另列 Q3 |
| D7 | 有沒有中文聲音要不要影響 | 依 `getVoices` 判斷 | 不判斷。實測清單可能一直是空的，但照樣念得出來 |
| D8 | 計數定義 | 不重複計數或每下 +1 | 不重複計數，重點一顆顯示它自己的號碼。**偏離 owner 字面**（「點了第幾下」），理由：照字面連點同一顆就能點到總數，與同一項勾選的「每顆都點到才會數到總數」矛盾。S2 的 PR 說明要寫明這個偏離與理由 |
| D9 | 計數範圍 | 見 §3.2 表 | 依「這組數完 = 有意義的數」切：加乘整題、除法每盤、銀行每位 |
| D10 | 音效關掉時的氣泡 | 照舊不出現或出現 | 出現。數數是教具功能，不是音效；與之後的音效輪相容 |
| D11 | 挑戰、天平念什麼 | 念通用說明或念算式 | 念算式（挑戰）、說明＋算式（天平） |
| D12 | 念不念回饋 | 只念題目或連回饋一起念 | 只念題目（owner 範圍）；之後要加再開票 |
| D13 | 彈窗開著時朗讀 | 停或不停 | 不停（跟 logic 一致） |
| D14 | 數學樂園家長頁加語速 | 加或不加（只在 logic 設） | 加。寫同一個 key，兩邊顯示同一個值；家長不用切到另一個遊戲才能調 |
| D15 | 跨分頁語速同步 | storage 監聽或每次念都讀 localStorage | storage 監聽。每次讀會在 localStorage 寫入失敗時把家長剛選的值蓋回舊值 |
| D16 | build 號 | 每輪 +1 或最後一次 +1 | 每輪 +1（每輪都改到出題或作答，三輪不一定同一天上線） |
| D17 | 除法算式符號 | emoji ➗🟰❓或 `÷ = ?` | `÷ = ?`（owner 原文） |
| D18 | `actionMinBuild` | 依欄位給或整個遊戲一個數字 | 依欄位，否則天平或除法的中位數有一邊會失真 |

---

## 5. 與 #53（feat/timer）、#52（feat/chain）的關係

已讀過 `feat/timer`（b814a46，worktree `D:/CodeWork/Other/klg-timer`）對 main 的 diff：
- 只改 `logic_game.html` 與它自己的計畫檔；**不改 family.js、不改數學樂園**。
- `LOG_BUILD` 3→4（diff 裡 logic :3723）。
- 朗讀方面只**新增呼叫端**：`speakText(timing.speak)` 不帶 kind，靠 `speechKindOf` 判成 `feedback`；`pendingTimingSpeak`。朗讀核心本身沒動。

所以：
- **合併順序**：#53 → S1 → S2 → S3。S1 在 #53 合併後 rebase 到新的 main。
- **logic 的 LOG_BUILD**：S1～S3 都不動，#53 合併後維持 4。S1 對 logic 是純搬移、行為不變，不需要 +1。萬一 S1 先合併，#53 照它自己的計畫 +1，也不衝突。
- **rebase 會碰到的地方**：
  - #53 在 `Object.assign(qlogConfig, {` 的**前面**插了 4 行（`roundTimer`、`lastTiming`、`pendingTimingSpeak`，diff hunk `@@ -3734`）；S1 改的是同一個物件裡的 `onAnswerEvent`（:3751-3757），相隔約 10 行。git 多半能自動合併，**合併後要人工確認這一段**。
  - #53 在 `goHome`、`startModule` 加了 `pendingTimingSpeak = ''`（hunk `@@ -4115`、`@@ -4143`）。S1 不改 `goHome`（`cancelSpeech()` 名稱不變），不衝突。
  - #53 的 `speakText(text)`（不帶 kind）在 S1 之後一定要照樣判成 `feedback`：`familyHooks.speechKindOf` 要掛的是 logic 原本的 `speechKindOf`。
- **rebase 後的驗證**：`logic_regress.js` 用「#53 合併後的 main」當基準重跑，要一字不差。若 #53 有自己的 harness 案例（看它的計畫檔 `docs/plans/issue-53-timer-plan.md`），在 S1 分支上也跑一次。
- **#52 feat/chain（暫停）**：它的計畫也會動 logic 的 `LOG_BUILD`。恢復時以當時 main 的值 +1；S1 搬走了朗讀核心，它如果有新的 `speakText` 呼叫，介面不變（第三個參數是選用的），不受影響。

---

## 6. 共通規則（每輪）

- **CRLF**：兩個 HTML 都是 CRLF。用保留換行的編輯工具，不用 Git Bash `sed -i`。family.js 用 LF。
- **建置**：改了 family.js 就跑 `python tools/build_common.py`，兩個 HTML 一起 commit；再跑一次 `git diff --exit-code` 沒有變化。數學樂園不跑 `build_zhuyin.py`（被排除）。只有 logic／index 的可見文字變了才需要跑它，而這三輪都不應該讓它們的可見文字變。
- **數學樂園注音缺字檢查**（S2、S3 必跑，S1 跑 🔊 那一處）：
  - 在 harness 裡對 `#gameContent`、`.instruction-bar` 收集所有不在 `.zy-unit` 裡的漢字（canvas、svg 除外），**跟 main 同一畫面比，新增的缺字 0 個**。（v1 寫「必須是 0 個」做不到：main 現況就有不在 `.zy-unit` 裡的漢字。）
  - 缺字照 `tools/build_zhuyin.py` 的讀音規則（教育部《重編國語辭典修訂本》、一不標本調）手動加進 `ZhuyinMap`，必要時加詞到 `ZhuyinWords`。
  - 破音字要人工核對並列在 PR：分（ㄈㄣ）、數（動詞 ㄕㄨˇ，現有預設是名詞 ㄕㄨˋ；數學樂園的 `ZhuyinWords`（montessori:4251）只有「數數」「點數」「慢慢數」「數一遍」，**沒有「數一數」**，其他動詞用法要自己加詞）、和（現有 ㄏㄜˊ，沿用）、一。
  - 已知缺字：馬、發、流（實測），新文字盡量避開。
- **名稱衝突檢查**（S1）：family.js 的每個頂層名稱拿去 grep 兩個 HTML 的主程式，不可以有重複的 `let`／`const`／`function`。
- **瀏覽器**：一律 `args:['--mute-audio']`，一次一個瀏覽器，只開 `file://`，不跑 `server.js`／`start.bat`。
- **harness**：寫在 session scratchpad，不進 repo；例外是 S1／S3 對 `tools/regress/montessori_regress.js` 的更新。
- **commit 身分**：`Arcrek-coder <226868523+Arcrek-coder@users.noreply.github.com>`。不 push，不合併。
- **回報**：harness 路徑、每個案例的 JSON 結果、regress 差異路徑清單、做不到的項目和理由。

---

## 7. 已決定與開放問題

### 7.1 已決定（v2）

| # | 問題 | 決定 | 誰決定 |
|---|---|---|---|
| Q1 | 除法「算式同時顯示結果」：分完當下就顯示 `6 ÷ 2 = 3`（字面上的「同時」），還是答對時才顯示？分完當下就顯示的話，答案就寫在畫面上，4 選 1 只剩照抄 | **答對時才顯示**（`let DIV_RESULT_REVEAL = 'answer'`，`'dealt'` 保留給測試）。不需要再問 owner；**S3 的 PR 說明要寫明與 owner 勾選字面「算式同時顯示結果」的差異與理由**（見 §3.3 流程） | 指揮官，使用者 2026-10-24 確認 |
| Q2 | 音效開關要不要也管朗讀 | **不管**（維持 v1 預設）：朗讀是讀題輔助、有自己的語速設定。#48 第 4 項（2026-10-23T16:23:40Z）owner 已決定「音效開關統一管控全部音效（包含點串珠、答對、答錯、過關）」，沒提到朗讀；這件事不在 #54 範圍，另一輪會處理（連同 #48 第 3、5、7 項）。本計畫只保證相容：S2 的叮噹聲仍看 `isSoundOn`，朗讀完全不看 `isSoundOn` | 指揮官 2026-10-24 |

### 7.2 開放問題

| # | 問題 | 預設（未決定時照這個做） | 誰決定 |
|---|---|---|---|
| Q3 | 答案按鈕要不要也等念完才出現 | 不等（owner 只勾了珠子） | owner |
| Q4 | 減法變淡的珠子要不要也能數 | 不能數（只數剩下的） | 指揮官 |
| Q5 | 要不要念答對、答錯的回饋 | 不念 | owner（可之後另開票） |
| Q6 | 一般 Chrome、iPad Safari 第一題沒手勢時會不會被擋 | 被擋就記 `error`、珠子馬上出現、🔊 脈動提示。**未驗證**，S1 PR 請 owner 在實機上看一次 | 實機驗證 |
