# 實作計畫：數學樂園設定類修正（#48 第 3、4、5、7 項）

**v2**（2026-10-24）：併入計畫稽核 r1（M1–M4、L1–L16）與指揮官決定（Q1–Q9、Q11、Q12、Q14）。對照表見第 12 節。**Q10、Q13 仍待 owner**（K4a／K4b 開工前必須有回覆，見第 10 節與附錄 A）。
**v1**（2026-10-24，f8e4a87）。需求來源：#48 本文第 3～7 項＋owner 2026-10-23T16:23:40Z 的決定＋我們在 #48 的最後一則回覆（音效開關預設不管朗讀）。
第 6 項（每日打卡上限）owner 決定維持現狀，**本計畫不做**。

**基準**：main **8aa8628**（已含 #53）。Branch `feat/m-settings`，worktree `D:/CodeWork/Other/klg-m48`。
**前提**：#54（S1、S2、S3）**全部合併之後**才開始實作。下面的行號都是 8aa8628 的；#54 會改到同一個檔案好幾百行，**每輪動手前一律先 grep 錨點文字**（每處都附了錨點）。
輪次用 **K1～K4b**（不跟 #19 的 M*、邏輯遊戲的 R*、#54 的 S* 混淆）。一輪一個 PR，PR 標題註明順序（例：`[#48 K1/5]`）。

**給實作 agent**：先讀第 0～3 節，再只讀你負責那一輪的小節；第 9 節（設計決定）與第 10 節（開放問題）是做決定的依據，PR 說明要引用。

---

## 0. 現況（實際讀過、跑過的程式）

| 項目 | 現況 | 位置（8aa8628） |
|---|---|---|
| 難度標籤 | 全部題型共用一列：`🌱 5以內 (基礎)`、`🌿 10以內 (不進位)`、`🔥 20以內 (進退位挑戰)`；天平（題型 7）也顯示這一列 | montessori_math_game.html:2808-2812、`updateDiffButtons` :5237-5253、`switchMode` 只對 5、6 藏起來 :5674-5677 |
| 其他題型怎麼解讀「N以內」 | 「最大的那個數（和、被減數）≤ N」。加法：簡單和 2～5、普通和 ≤9、困難和 11～18（必進位）；減法：簡單被減數 3～5、普通 4～9、困難 11～18（必借位） | 加法 :7221-7234、減法 :7305-7320 |
| 天平出題 | `generateBalanceProblem()`：簡單 L=5～10；普通 L=11～19；困難 `a1,a2∈3～7`、L=a1+a2=6～14。`balanceBaseR = L − balanceTargetAns` | :5790-5814 |
| 天平選項 | `generateOptions(balanceTargetAns, 1, Math.max(balanceWeightL, 15))`；`generateOptions` 的備援分支 `Math.floor(Math.random()*8)+1` **不檢查 min／max** | :5923、:5755-5767 |
| `generateOptions` 的呼叫端 | 天平 :5923、加法 :7265、減法 :7367、乘法 :7455、除法 :7550（**共用**，K1 不能改它） | 同左 |
| 打卡獎勵星 | `doCheckin()` 做 `window.userBonusStars += 2`，**沒有存檔** | :6805-6807 |
| 衣帽間扣星 | `getAvailableStars()` = `userStars + userBonusStars`；`unlock()` 檢查總數夠不夠，但**只扣 `userStars`**（`Math.max(0, userStars − cost)`），打卡星永遠扣不到；`userStars` 不夠時被夾到 0，等於白送 | :6162-6166、:6182-6205 |
| 換孩子 | `resetChildMemory()` 做 `delete window.userBonusStars` | :7885-7891 |
| 星星顯示 | 頂端 `headerStarCount` = `userStars`（:5467）；貼紙簿「目前持有」= `userStars`（:5527）；過關「累計」= `userStars`（:5730）；學習分析「星星總數」= `userStars`（:4872/:4931）；衣帽間 = `getAvailableStars()`（:6689-6691）→ **頂端和衣帽間現在就對不起來** | 同左 |
| 貼紙解鎖 | 依 `lifetimeScore = max(totalCorrect, userStars)`（:5478）；註解寫「以累計答對題數解鎖」 | :5472-5490 |
| 每位孩子的 key | `FAMILY_KEY_GROUPS`（family.js:27-31，嵌入在 montessori :3118-3122、logic :2512-2516）：刪孩子（logic :3616 `familyKeysOfChild`）、QM8 搬進度（montessori :8219 `MONTESSORI_CHILD_KEYS`）、名單重建都用它 | 同左 |
| 音效系統 | `const Sound`（:4969-5065）方法 `click/wrong/snap/correct/cheer`，後來另加 `Sound.fanfare`（:5494-5512）；串珠叮噹直接用 `Sound.ctx`（:5263-5281）。全檔 `createOscillator` 只有這 7 處（:4981、:4998、:5015、:5032、:5054、:5269、:5500）；沒有 `<audio>`／`new Audio` | 同左 |
| 音效開關 | `let isSoundOn = true;`（:5177），`toggleSound()` 只切變數和按鈕外觀（:5188-5195），**沒有存檔**；全檔只有串珠 `if (!isSoundOn) return;`（:5263）會看它，另外紀錄 `soundOn: !!isSoundOn`（:4552） | 同左 |
| 音效呼叫點 | 52 處 `Sound.xxx()`（清單見 §6.1） | grep `Sound\.\(click\|wrong\|snap\|correct\|cheer\|fanfare\)` |
| 邏輯遊戲同步 | 同步碼 = `btoa(unescape(encodeURIComponent(JSON.stringify(userProgress))))`（logic_game.html:4022-4026），只含 `little_logic_save_v1` 那一份（stars、completed、difficulty、adaptive、adaptiveTier、bestTimes、lastUpdated）；**不含**錯題本、學習紀錄、孩子名單。辨識方式只有 `typeof parsed.stars === 'number'`（:3429、:4110）。網址參數 `?save=`，啟動時讀、讀完一律從網址拿掉（:3422-3438）；1 位孩子直接匯入、2 位以上問「要匯入給誰？」（:3444-3447）。貼代碼一律匯入給目前這位（:3539、:4100-4122）。匯入＝整份覆蓋，只保留本機的 `adaptive`（code 沒有時）與 `bestTimes` 取小（:4006-4020）。QR 用外部服務 `api.qrserver.com`，200×200，`onerror` 就藏起來（:4043-4048） | 同左 |
| 數學樂園同步 | 沒有任何同步、匯出、網址參數（grep `URLSearchParams`、`location.search`、`qrserver` 0 筆） | — |
| 學習紀錄 build | `MONTESSORI_LOG_BUILD = 3`，規則「只有改到數學樂園出題、作答的 PR 才 +1」（:4471-4473）。#54 合併後會是 **6**（#54 計畫 §2.4） | 同左 |
| 回歸工具 | `tools/regress/montessori_regress.js`：固定種子、假時鐘、`--mute-audio`；Sound 的方法（`init` 以外）在 DOMContentLoaded 換成只記名字（:93-101）；難度是預設的普通；天平用 +1 微調答對（:269-276，每按一下 `tick(50)`）；打卡 → 衣帽間買 `bunny_ears`（4 顆）；`globals.userBonusStars` 讀的是 `window.userBonusStars`（:197） | 同左 |

### 0.1 實測（scratchpad `plan48/`，都不改產品檔）

| 腳本 | 做什麼 | 結果 |
|---|---|---|
| `balance_dist.js` | 從 HTML 抽出真的 `generateBalanceProblem`＋`generateOptions`，每個難度抽 20 萬題 | 見 §4.1 表（簡單 L 5～10、普通 11～19、困難 6～14；簡單有 25.6% 的選項 > 5） |
| `balance_new.js` | K1 新出題規則的原型（v1 範圍），抽 20 萬題檢查不變式 | 三個難度 invalid 0、選項不合格 0；答案在 4 個位置各約 25%（**v1 數字，已被下一列取代**） |
| `plan48v2/bal_v2.js` | v2 範圍的原型（Q1 普通 6～9、選項上限 9；L2 簡單從 9 種合法組合均勻抽），每個難度 20 萬題 | 見 §4.2 表 |
| `proto_r1.js`＋regress | 在**複本**上套 K1 原型，跑 `montessori_regress.js`，跟 main 比 | 133 個差異路徑，全部落在天平那幾步之後（§4.7） |
| `proto_r2.js`＋regress | 在複本上套 K2 原型，跑 regress | 27 個差異路徑（**舊 harness 的數字，作廢**；新 harness 是 59 條，見 §5.7）；main 的輸出本身就證明了 bug：重新整理後 `userBonusStars` 消失（main step 41） |
| `cross_logic.js` | 用 Playwright 把「數學樂園形狀」的代碼（標準 base64 與 base64url 各一）貼進**現在的** logic_game.html、也用 `?save=` 開 | 4 種情況都拒絕：toast「❌ 代碼格式不正確…」、`little_logic_save_v1` 不變、網址參數被拿掉、0 個 pageerror |
| `sync_size.js` | 用真的 33 件衣服 id 估同步碼大小 | §7.3 表 |
| `golden.js` | 產生 K4a 的黃金向量 | §7.2 |
| `zy_check.js` | 新字串在數學樂園 `ZhuyinMap`（728 字）裡缺哪些字 | 「匯」「效」「份」「按」「搬」缺；新文字避開這些字 |

---

## 1. 分輪與合併順序

| 輪 | 範圍（#48 項目） | 規模估計 | 依賴 | `MONTESSORI_LOG_BUILD` |
|---|---|---|---|---|
| **K1** | 第 5 項：天平照標籤改出題範圍＋選項範圍 | montessori +~45／−~25；regress 不改 | #54 全部合併 | **+1**（6→7） |
| **K2** | 第 3 項：打卡星存起來、可以換衣服 | montessori +~35／−~15、family.js +1 行、兩個 HTML 重嵌、regress 改 1 行 | K1（只是排序；技術上獨立） | 不變 |
| **K3** | 第 4 項：音效開關管全部音效、記住開關 | montessori +~50／−~30 | #54 S2、S3（`onBeadTouch`、除法發珠的叮噹聲） | 不變 |
| **K4a** | 第 7 項（一）：數學樂園同步碼（產生、貼上匯入、驗證）；入口位置依 Q10（建議家長設定） | montessori +~230 | K2（同步碼要帶打卡星）；**Q10 已回覆** | 不變 |
| **K4b** | 第 7 項（二）：同步網址 `?msave=`、QR、開網址時的提示 | montessori +~90 | K4a；**Q13 已回覆** | 不變 |

合併順序：**#54 S1 → S2 → S3 → K1 → K2 → K3 → K4a → K4b**。

**為什麼這樣切**
- K1 是唯一改出題的一輪（要 +1 build、regress 有大片預期差異），單獨審最清楚。
- K2 動到 family.js（要重嵌兩個 HTML、證明 logic 不變），跟 K1 分開。
- K3 跟 #54 S2/S3 改的 `onBeadTouch`、發珠叮噹聲是同一段，放在 #54 之後、也獨立一輪，rebase 衝突只會在這一輪。
- 第 7 項最大，拆兩輪：K4a 是資料格式與匯入（風險在「壞碼不能寫壞資料」），K4b 是網址與啟動流程（風險在啟動順序、護眼鎖、「誰要玩？」）。K4a 合併後就已經能用（複製代碼、貼上），K4b 只是方便。
- K1 與 K2 互不依賴；若 #54 延誤，K1 可以先做（見 §2.3）。

---

## 2. 與 #54 的關係（rebase 注意事項）

已讀過 #54 已稽核計畫（`D:/CodeWork/Other/klg-mspeech/docs/plans/issue-54-montessori-speech-plan.md` v2.1）與 `feat/m-speech` 上 S1 的 diff（`git diff 8aa8628 feat/m-speech`，commit ed3993d）。

### 2.1 #54 改了什麼、跟本計畫哪裡相鄰

| #54 | 改的位置 | 本計畫哪一輪碰到 | 怎麼處理 |
|---|---|---|---|
| S1 | `renderBalanceScaleView` 開頭的 `setInstruction`：朗讀稿用 `balanceLeftParts.join(' ➕ ') + ' 🟰 ' + balanceBaseR + ' ➕ ❓'` 組 | K1 | K1 **不改**這幾個全域變數的名稱和意義（`balanceWeightL`、`balanceLeftParts`、`balanceBaseR`、`balanceTargetAns`），朗讀稿自動跟著新範圍。K1 改的是 `generateBalanceProblem`（S1 沒動）和同一個函式後段的選項那一行（離 S1 改的地方約 100 行） |
| S1 | family.js 大改（朗讀核心）、`closeModal` 加 `cancelSpeech`、家長頁加「🔈 朗讀速度」一列、`MONTESSORI_LOG_BUILD` 3→4 | K2（family.js `FAMILY_KEY_GROUPS`，S1 沒動那幾行）、K4a（家長頁加一個區塊） | K2 只改 `FAMILY_KEY_GROUPS` 一行，再跑 `build_common.py`。K4a 的區塊放在「📦 把數學樂園的進度移給…」那段**後面**、「👀 護眼時間」前面，不跟 S1 的朗讀速度列（S1 放在家長頁裡另一處）搶同一個 hunk；rebase 有衝突時兩段都保留 |
| S1 | `montessori_regress.js` 加假語音（`speech[]` 輸出） | K1 | K1 的 regress 預期差異多一條：天平的 `speech[]` 朗讀稿數字會變 |
| S2 | `onBeadTouch(el)` 重寫：計數、氣泡，`if (isSoundOn) chime(n);`（音效關掉時氣泡照樣出現，只有叮噹聲看開關）；`MONTESSORI_LOG_BUILD` 4→5 | **K3** | K3 把 `isSoundOn` 的判斷收進統一的出口（§6.2），`onBeadTouch` 裡不再需要自己判斷；**氣泡、彈跳、計數一律不受音效開關影響**（#54 S2-A19 要繼續過） |
| S3 | 除法 `divDeal()`：「叮噹聲看 `isSoundOn`」；`actions.deals`；`MONTESSORI_LOG_BUILD` 5→6；regress 加 `__regressSpeechFinish()`、mode 4 改成點籃子 | K3、K1 | K3 一樣收進統一出口。K1 的 build 從 6 開始 +1 |
| S1～S3 | 朗讀完全不看 `isSoundOn`（#54 計畫 §7.1 Q2） | K3 | K3 維持：音效開關**不管朗讀** |

### 2.2 rebase 檢查清單（每輪開工前、PR 前各跑一次）

```
git fetch && git rebase origin/main
grep -n "MONTESSORI_LOG_BUILD = " montessori_math_game.html        # K1：必須是 #54 合併後的值（預期 6），K1 改成 +1
grep -n "isSoundOn\|createOscillator\|Sound\.ctx\|AudioContext" montessori_math_game.html   # K3：逐筆對 §6.1 表，#54 新增的都要納入
grep -n "function generateBalanceProblem\|generateOptions(balanceTargetAns" montessori_math_game.html   # K1 錨點
grep -n "userBonusStars" montessori_math_game.html                  # K2：改完後只能剩 §5 列出的那幾處
grep -n "montessori_checkin'\]" common/family.js                    # K2 錨點
```
- 若 #54 的某一輪沒有照它的計畫做（例如 `chime` 的寫法不同），以**合併後的程式**為準，照本計畫的不變式改，PR 說明列出差異。
- `montessori_regress.js` 的基準：一律用「當時的 origin/main」重跑一次當基準，**不要**拿本計畫 §4.7、§5.7 的數字直接比（那是 8aa8628＋原型的數字，#54 會讓 `speech[]`、mode 4 的步驟都不同）；本計畫給的是**差異的種類**。

### 2.3 如果 #54 延誤

- K1、K2 跟 #54 沒有程式上的依賴，可以先做；先做的那一個把 build +1（K1：3→4），#54 之後每輪照它自己的規則「以當時 main 的值 +1」。PR 說明寫清楚。
- K3 **不能**先做：會跟 S2 改同一段 `onBeadTouch`。
- K4a、K4b 只依賴 K2（程式上）；另外 K4a 要等 Q10、K4b 要等 Q13 的 owner 回覆（第 10 節）。
- **owner 對 Q10／Q13 的回覆不管是什麼，K1～K3 都不受影響**，照常進行。

---

## 3. 共通規則（每輪）

- **CRLF**：兩個 HTML 都是 CRLF，用保留換行的編輯工具，不用 Git Bash `sed -i`。family.js 是 LF。
- **建置**：改了 family.js 就跑 `python tools/build_common.py`，兩個 HTML 一起 commit；再跑一次 `git diff --exit-code` 要沒有變化。數學樂園不跑 `build_zhuyin.py`（被排除，tools/build_zhuyin.py:26）。family.js 新增內容不放中文字串字面值（logic／index 的注音資料才不會變）。
- **數學樂園注音**：孩子看得到的新文字都經過 `zy()`。用 `ZhuyinMap`（montessori :3791 起）檢查缺字；缺字照 `build_zhuyin.py` 的讀音規則手動補，或換字。已知缺字（8aa8628 實查）：匯、效、份、按、搬（另外 #54 計畫記了馬、發、流）。**家長頁不加注音**（沿用現況與 #54 S1 的做法）。`showToast`（:8319）、`Mascot.render`（:5111）都會 `zy()`，所以它們的文字算孩子看得到的。
- **不在載入時呼叫 `Math.random()`**；新程式不可以改變出題的亂數序列（K1 除外，K1 本來就是改出題）。
- **瀏覽器**：Playwright 一律 `args:['--mute-audio']`、msedge channel、一次一個瀏覽器、只開 `file://`；**不跑** `server.js`／`start.bat`。harness 寫在 session scratchpad，不進 repo（例外：K2 對 `montessori_regress.js` 的一行修改）。
- **commit 身分**：`Arcrek-coder <226868523+Arcrek-coder@users.noreply.github.com>`。不 push、不合併。
- **回報**：harness 路徑、每個案例的結果（JSON）、regress 差異路徑清單、做不到的項目和理由。

---

## 4. K1：天平照標籤改出題範圍（第 5 項）

### 4.1 現在的實際範圍（`balance_dist.js` 實測，每個難度 20 萬題）

| 難度 | 標籤 | 左邊 L（= 兩邊總重） | 答案 ❓ | 右邊已知 | 畫面最大的數 | 選項範圍 | 選項超過標籤上限 | 不同題目數 |
|---|---|---|---|---|---|---|---|---|
| 簡單 | 5以內 | **5～10** | 1～8 | 2～9 | 10 | 1～10 | **25.6%** | 33 |
| 普通 | 10以內 (不進位) | **11～19** | 2～16 | 3～17 | 19 | 1～18 | 15.5% | 99 |
| 困難 | 20以內 (進退位挑戰) | **6～14**（a1、a2 各 3～7，三角分布；**60% 的題 L ≤ 10、只有 40% 進位**（L ≥ 11）） | 1～11 | 3～13 | 14 | 1～13 | 0% | 175 |

（困難那格的比例是稽核 r1 用 `audit48/bal_old.js` 抽 20 萬題的實測：L ≤ 10 佔 60.1%，其中 L = 10（個位剛好湊十）佔 19.9%；L ≥ 11 佔 39.9%。v1 寫的「45%」是錯的。）

結論：簡單、普通超出標籤；困難沒有超出 20，但六成題目 ≤ 10、只有四成像加法困難那樣和 ≥ 11，比普通還簡單，跟「進退位挑戰」不符。所有題目都有解（invalid 0）。

### 4.2 新範圍（比照加法、減法對同一個標籤的解讀）

「N以內」= 畫面上出現的每個數（左邊每一項、右邊已知數、答案、四個選項）都 ≤ 該難度的上限 `BALANCE_CAP`。普通的上限依 Q1（已決定）比照加減法的「不進位」定為 **9**（加法普通和 ≤ 9 :7231-7233、減法普通被減數 4～9 :7316-7318），不是標籤字面上的 10。

| 難度 | 左邊 | L | 答案 t | 右邊已知 b = L − t | 上限 `BALANCE_CAP` | 依據 |
|---|---|---|---|---|---|---|
| 簡單 | 一個數 L | **3～5** | **1～L−1** | 1～4 | 5 | 同減法簡單的被減數 3～5（:7306，Q2 已決定從 3 起）。**(L, t) 從 9 種合法組合均勻抽**（L=3 兩種、4 三種、5 四種），不是先抽 L 再抽 t（L2） |
| 普通 | 一個數 L | **6～9**（均勻） | **2～L−2** | 2～7 | **9** | Q1 已決定：比照加減法「不進位」只出到 9；跟簡單不重疊 |
| 困難 | 兩個數 a1 ＋ a2 | a1 = 5～9、a2 = (11−a1)～9，**L = 11～18**（必進位） | **2～min(9, L−2)** | 2～16 | 20 | 抽法跟加法困難一模一樣（:7225-7228「和在 11～18 之間，必然進位」）；答案限個位數，用 +1 微調最多按 9 下 |

原型實測（`plan48v2/bal_v2.js`，由稽核的 `audit48/bal_new.js` 改成 v2 範圍；每個難度 20 萬題）：

| 難度 | L | t | b | 選項最大值 | invalid／選項不合格 | 答案在第 1～4 個位置 | 答案是最小選項 | 答案是最大選項 | 不同題目數 |
|---|---|---|---|---|---|---|---|---|---|
| 簡單 | 3～5 | 1～4 | 1～4 | 5 | 0／0 | 24.9／24.9／25.1／25.0% | **41.7%** | 2.8% | 9 |
| 普通 | 6～9 | 2～7 | 2～7 | 9 | 0／0 | 24.9／25.0／25.2／25.0% | 10.8% | 2.9% | 18 |
| 困難 | 11～18 | 2～9 | 2～16 | 12 | 0／0 | 24.9／25.2／24.9／25.0% | 8.1% | 3.7% | 240 |

- 簡單的分布：L = 3／4／5 各 22.1／33.4／44.4%（= 2/9、3/9、4/9）；t = 1／2／3／4 各 33.4／33.2／22.2／11.2%；9 種組合各約 11.1%。
- **簡單「答案是最小選項」無法完全避免**：選項只能在 1～5 裡挑 4 個，t = 1 時答案一定是最小（佔 1/3 的題），t = 2 時只要 1 被抽中也是最小。v1 的抽法（先抽 L 再抽 t）是 45.1%，改成均勻抽組合後是 41.7%；要再降只能放寬選項範圍（違反 K1-B2），所以不再處理。
- 附帶事實：新的普通 ≈ 舊的簡單（5～10）去掉 5 和 10，新的困難 ≈ 舊的普通（11～19）的範圍，但變成兩個加數。困難題「右邊已知數剛好等於左邊某個加數」（例：`6 ➕ 7 🟰 6 ➕ ❓`）佔 23.3%，Q3 已決定**不排除**（現況也允許）；困難題右邊已知數 b 有 31% 是兩位數（10～16），Q3b 已決定**不限制**。

### 4.3 改動

| # | 位置（8aa8628；錨點） | 做什麼 |
|---|---|---|
| 1 | :5790-5814 `function generateBalanceProblem()` | 依 §4.2 重寫（虛擬碼見下） |
| 2 | 同上，函式前 | 新增 `const BALANCE_CAP = { easy: 5, normal: 9, hard: 20 };`、`const BALANCE_EASY_PAIRS`（載入時用迴圈建好，不呼叫 `Math.random`）、`function balanceRandInt(lo, hi)`、`function balanceOptions(t, lo, hi)` |
| 3 | :5923 `generateOptions(balanceTargetAns, 1, Math.max(balanceWeightL, 15))` | 改成 `balanceOptions(balanceTargetAns, 1, BALANCE_CAP[currentDifficulty] \|\| 9)`。**`generateOptions` 本身不改**（加減乘除共用；它的備援分支不檢查範圍是既有問題，不在本計畫範圍，見第 11 節） |
| 4 | :5794、:5800、:5808 的註解（「5~10 以內」「11~20 以內」） | 跟著改成新範圍 |
| 5 | :4473 `MONTESSORI_LOG_BUILD` | +1（#54 後預期 6→7），註解 `// #48 K1：天平照難度標籤改出題範圍` |

難度標籤、按鈕、說明文字**都不改**（owner 決定改出題範圍，不改標籤）。

```js
const BALANCE_CAP = { easy: 5, normal: 9, hard: 20 };
// 簡單的 9 種合法 (L, t)：L 3~5、t 1~L-1；從這 9 種均勻抽
const BALANCE_EASY_PAIRS = [];
for (let L = 3; L <= 5; L++) for (let t = 1; t < L; t++) BALANCE_EASY_PAIRS.push([L, t]);
function balanceRandInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
function generateBalanceProblem() {
  balanceCurrentGuess = 0;
  if (currentDifficulty === 'easy') {            // 🌱 5以內：L 3~5
    const pr = BALANCE_EASY_PAIRS[balanceRandInt(0, BALANCE_EASY_PAIRS.length - 1)];
    balanceWeightL = pr[0];
    balanceTargetAns = pr[1];
    balanceLeftParts = [balanceWeightL];
  } else if (currentDifficulty === 'hard') {     // 🔥 20以內進位：兩個個位數相加 11~18（抽法同加法困難）
    const a1 = balanceRandInt(5, 9);
    const a2 = balanceRandInt(11 - a1, 9);
    balanceLeftParts = [a1, a2];
    balanceWeightL = a1 + a2;
    balanceTargetAns = balanceRandInt(2, Math.min(9, balanceWeightL - 2));
  } else {                                       // 🌿 10以內不進位：L 6~9（Q1；其他值一律當普通，同現況的 else）
    balanceWeightL = balanceRandInt(6, 9);
    balanceTargetAns = balanceRandInt(2, balanceWeightL - 2);
    balanceLeftParts = [balanceWeightL];
  }
  balanceBaseR = balanceWeightL - balanceTargetAns;
}
// 4 個不重複的整數、都在 [lo, hi]、正確答案剛好一個；先從答案 ±3 內挑，不夠才放寬到整個範圍；最後洗牌
function balanceOptions(t, lo, hi) {
  const pool = []; for (let v = lo; v <= hi; v++) if (v !== t) pool.push(v);
  const near = pool.filter(v => Math.abs(v - t) <= 3);
  const src = near.length >= 3 ? near : pool;
  const picked = new Set([t]);
  while (picked.size < 4) picked.add(src[Math.floor(Math.random() * src.length)]);
  const arr = Array.from(picked);
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
```
- 洗牌用 Fisher–Yates，不沿用 `generateOptions` 的 `sort(() => Math.random() - 0.5)`（有偏差）。
- `while` 一定會結束：`pool` 大小 = hi − lo ≥ 4（最小是簡單 [1,5] 去掉答案剩 4 個），`src` 至少 3 個不同的值、都不等於 t。

### 4.4 不變式

- **K1-B1 一定有解**：`sum(balanceLeftParts) === balanceWeightL === balanceBaseR + balanceTargetAns`，`balanceTargetAns ≥ 1`、`balanceBaseR ≥ 1`。用 +1 從 0 按 `balanceTargetAns` 下一定會平衡（`setBalanceGuess` 的判斷 `balanceBaseR + val === balanceWeightL`，:6026-6027）。
- **K1-B2 符合標籤**：題目產生的每個數 ≤ `BALANCE_CAP[難度]`：`balanceWeightL`、每個 `balanceLeftParts`、`balanceBaseR`、`balanceTargetAns`、4 個選項（孩子用 +1 按出來的猜測值 `balanceCurrentGuess`、以及右盤顯示的 `balanceBaseR + balanceCurrentGuess` 不算：`adjustBalanceGuess` 只夾下限 0（:6000），本來就可以按超過答案）。
- **K1-B3 選項合理**：剛好 4 個、互不相同、都是 [1, cap] 的整數、正確答案剛好出現一次；答案位置均勻。
- **K1-B4 困難必進位**：`balanceLeftParts` 兩項都 ≤ 9、和 ≥ 11。
- **K1-B5 不影響其他題型**：`generateOptions` 一字不改；題型 1～6 的出題與亂數序列不變。
- 每個分支的範圍都不是空的：簡單 L ≥ 3 → [1, L−1] 非空；普通 L ≥ 6 → [2, L−2] 非空；困難 L ≥ 11 → [2, min(9, L−2)] = [2, 9] 非空。

### 4.5 失敗語意

- 出題是純算術，沒有失敗路徑。`currentDifficulty` 是壞值時（`loadDifficulty` 已經擋掉，:5217-5225）走普通分支、`BALANCE_CAP[…] || 9`，跟現況「else 就是普通」一致。
- 錯題本裡舊的天平題（例如普通的 `17 🟰 10 ➕ ❓`）照樣顯示；「立即重練此單元」出的是**新範圍**的新題目（錯題本本來就不重出同一題）。
- 學習紀錄：`summary`、`qk` 的格式不變（:4498、:4523），數值範圍變了，所以 build +1；家長報告依難度分組時，同一個「普通」會混到舊（11～19）與新（6～9）的紀錄（family.js 報告不看 build，跟 #54 計畫 §2.4 同樣的取捨），PR 說明寫一句提醒。

### 4.6 注音

沒有新的文字。

### 4.7 驗收（Playwright，file://、`--mute-audio`、msedge；harness 放 scratchpad）

抽題方法：`page.evaluate` 裡設 `currentDifficulty = d`，迴圈呼叫 `generateBalanceProblem(); renderBalanceScaleView();`（**不要**用 `initBalanceScale`，它每次都開一筆學習紀錄），每次讀全域變數和 `#balanceChoices .choice-btn` 的文字。

| 案例 | 步驟 | 預期 |
|---|---|---|
| K1-A1 | 三個難度各抽 3000 題 | 每題符合 K1-B1、B2、B4；觀察到的 L、t、b 的最小最大值**剛好等於** §4.2 表（簡單 3/5、1/4、1/4；普通 6/9、2/7、2/7；困難 11/18、2/9、2/16）；簡單 9 種、普通 18 種題目全部出現過；**簡單 9 種 (L, t) 每一種的比例都在 9%～13.3%**（均勻抽，期望 11.1%；先抽 L 再抽 t 時 L=3 的兩種各 16.7% 會轉紅） |
| K1-A2 | 同 A1 的選項 | 符合 K1-B3；答案在 4 個位置的比例都在 20%～30% |
| K1-A3 | 困難開一題，看畫面 | `.balance-eq-part` 第一格是 `a1 ➕ a2`；#54 S1 的朗讀稿（`currentQuestionSpeech`）含兩個加數 |
| K1-A4 | 每個難度各答對一題（一次用選項、一次用 +1 微調） | 過關視窗出現；紀錄 `build` = 合併前 main 的值 +1；`summary` 形如 `L 🟰 b ➕ ❓` |
| K1-A5 | 題型 1～6 各抽 500 題（固定種子，main 與 branch 各跑一次） | 兩邊序列一字不差（證明 K1-B5） |
| K1-A6 | 360×640：困難題 L=18、+1 按到 18（右盤 base+guess 最多） | 沒有水平捲動、珠子不溢出 SVG；截圖存 scratchpad |
| K1-A7 | 回歸 | 見下 |

**回歸預期（montessori_regress.js，難度是預設的普通）**：題型 1～6 一字不差；天平那幾步之後才有差異。原型實測（8aa8628＋K1 原型，133 個差異路徑）的種類：
- 天平各步驟的 `choices`（選項數字）、`mistakeCards`、錯題本 `montessori_mistakes[0]` 的 `questionDesc`／`wrongVal`／`correctVal`；
- 學習紀錄每一筆的 `build`；天平紀錄的 `summary`、`qk`、`ev`（選項文字）；
- 「+1 微調」那一步按的次數 = 新答案（harness 按 `balanceTargetAns` 下，每下 `tick(50)`）→ 那一筆的 `actions.steps`、`tapCount`、`pointerDownCount`、`sounds`（click 次數）改變，**之後所有時間戳平移 (新答案 − 舊答案) × 50ms**（原型：少按 6 下、平移 −300ms，連帶 `montessori_checkin` 的 timestamp、`little_logic_last_seen_v1`、`little_logic_eyecare_v1.usedMs` 改變）；
- #54 S1 之後還會有：天平那幾題的 `speech[]` 朗讀稿數字；
- #54 之後還會有：**朗讀稿長度改變造成的時間平移**（新題目的數字不同 → 朗讀稿長短不同 → 假語音結束的時間不同，之後的時間戳跟著平移；跟上面「+1 按的次數」那種平移疊在一起）。
- PR 裡逐條列出差異路徑，並說明每條屬於上面哪一類。
- logic_regress：一字不差（K1 不碰 logic、family.js）。

**改壞清單（K1）**

| 突變 | 會轉紅的案例 |
|---|---|
| 簡單寫成 `balanceRandInt(3, 6)` | A1（L 最大 6 > 5） |
| 普通沿用舊的 11～19 | A1 |
| 普通出到 10（`balanceRandInt(6, 10)` 或 `BALANCE_CAP.normal = 10`） | A1（L 最大 10、t 最大 8；B2 上限 9） |
| 簡單先抽 L 再抽 t（v1 的抽法） | A1（L=3 的兩種組合各約 16.7% > 13.3%） |
| 困難 a2 從 3 起抽（不保證進位） | A1（L 最小 < 11；B4） |
| 答案範圍下限寫成 0 | A1（t 最小 0；B1） |
| 選項還是用 `generateOptions(…, 15)` | A2（簡單的選項 > 5） |
| `balanceOptions` 不洗牌（答案永遠第一個） | A2（位置比例） |
| 用 `Set` 以外的方式收集、可能重複 | A2（互不相同） |
| 順手改了 `generateOptions` | A5（題型 1～6 序列不同） |
| build 沒 +1 | A4 |
| 困難題改名或拿掉 `balanceLeftParts` | A3（朗讀稿少一個加數） |

---

## 5. K2：打卡獎勵星存起來、可以換衣服（第 3 項）

### 5.1 資料流（end-to-end）

| 階段 | 現在 | K2 之後 |
|---|---|---|
| 產生 | `doCheckin()`：`window.userBonusStars += 2`（:6806-6807） | `userBonusStars += 2; saveRewardData();` |
| 存放 | 只在記憶體 | 新 key **`montessori_bonus_stars`**（每位孩子一份，`childKey()`；c0 沒有後綴、其他 `__<id>`），值是非負整數字串，格式同 `montessori_stars` |
| 宣告 | 隱式的 `window.userBonusStars` | 頂層 `let userBonusStars = 0;`，放在 `let userStars = 0;`（:5424）下一行 |
| 讀取 | — | `loadRewardData()`（:5427）：`userBonusStars = Math.max(0, parseInt(localStorage.getItem(childKey('montessori_bonus_stars', activeChildId)), 10) \|\| 0);`，在 `montessori_stars` 那段之後、不管有沒有 stars key 都讀。同時把既有的 `userStars = parseInt(savedStars, 10) \|\| 0;`（:5431）改成 `userStars = Math.max(0, parseInt(savedStars, 10) \|\| 0);`（壞資料 `'-5'` 不再變成負數星星，K2-S1） |
| 寫入 | — | `saveRewardData()`（:5455）多存一個 key（走 `saveChildItem`：被別的分頁刪掉的孩子不寫回） |
| 可用星星 | `getAvailableStars()` = `userStars + userBonusStars`（:6162-6166） | 新函式 `availableStars()` = `Math.max(0, userStars) + Math.max(0, userBonusStars)`；`Wardrobe.getAvailableStars()` 改成回傳它 |
| 扣款 | 只扣 `userStars`，夾到 0（:6194-6197） | **先扣打卡星，不夠再扣答對星**（Q5）：`fromBonus = min(userBonusStars, cost); userBonusStars -= fromBonus; userStars -= (cost − fromBonus); saveRewardData();`。前面已經檢查 `availableStars() ≥ cost`（:6186-6190 不變），所以不會變負數 |
| 顯示 | 頂端／貼紙簿／過關／學習分析顯示 `userStars`，衣帽間顯示總數 | 全部顯示 `availableStars()`（Q6）：:5467 頂端、:5527 貼紙簿「目前持有」、:5730 過關「累計」、:4872 學習分析「星星總數」、:6689 衣帽間（已經是） |
| 貼紙解鎖 | `max(totalCorrect, userStars)`（:5478、:5525） | **不變**：打卡星不算進貼紙進度（K2-S4） |
| 換孩子 | `delete window.userBonusStars`（:7889） | `userBonusStars = 0;`（之後 `loadRewardData` 讀新孩子的 key） |
| 刪孩子 | 沒有 key 可刪 | `FAMILY_KEY_GROUPS` 數學樂園那組加 `'montessori_bonus_stars'`（family.js:29-30）→ logic 刪孩子（logic :3616）一起刪 |
| QM8 搬進度 | — | `MONTESSORI_CHILD_KEYS`（:8219）由 `FAMILY_KEY_GROUPS` 推出來，自動包含新 key；家長頁說明「星星」已涵蓋，不改字 |
| 名單重建 | — | `FAMILY_SCAN_KEYS` 自動包含；只有 `montessori_bonus_stars__<id>` 而名單壞掉時也能重建出那位孩子（跟其他 key 一樣） |
| 同步碼 | — | K4a 的 `bs` 欄位 |

`hasMontessoriData`（:8227-8239）**不改**：會有打卡星就一定有打卡紀錄，`montessori_checkin` 已經會讓它回傳 true。

### 5.2 舊資料相容

- 舊資料沒有 `montessori_bonus_stars` → 0，畫面跟現在重新整理後一樣。
- 以前打卡送的星星**不補發**（Q4 已決定）：那些星星只活在當時那一頁的記憶體裡，有些已經被拿去「白換」衣服（扣不到），無法知道還剩多少；從打卡紀錄回推會一次多出幾十顆。
- `loadRewardData` 在沒有 `montessori_stars` key 時用「答對題數 − 已買衣服的價錢」推算（:5432-5443）。K2 之後若有一部分衣服是用打卡星買的，這個推算會偏低。這條路只在 stars key 不存在、衣帽間卻有資料時才會走（第一次存檔後就有 key；K4a 匯入一定會寫 key），影響可接受，PR 說明記一筆。
- 還開著的舊版分頁：它不認得新 key，不會讀也不會寫；它自己的 `window.userBonusStars` 照舊只在記憶體。兩個分頁同時開著時星星「後寫的贏」是既有行為（`userStars` 也是），K2 不處理，列在第 11 節。

### 5.3 改動

| # | 位置（8aa8628；錨點） | 做什麼 |
|---|---|---|
| 1 | common/family.js:29-30 `'montessori_checkin'], id: ['montessori_qlog_v1']` | 加 `'montessori_bonus_stars'`（放在 `montessori_checkin` 後面）；跑 `build_common.py` 重嵌兩個 HTML |
| 2 | montessori :5424 `let userStars = 0;` | 下面加 `let userBonusStars = 0;` 與 `function availableStars()` |
| 3 | :5427-5453 `loadRewardData`、:5455-5463 `saveRewardData` | 讀寫新 key；`userStars` 的讀取加 `Math.max(0, …)`（§5.1「讀取」） |
| 4 | :5465-5470 `updateHeaderRewardDisplay`、:5527、:5730、:4872 | 顯示改用 `availableStars()` |
| 5 | :6162-6166 `getAvailableStars` | `return availableStars();` |
| 6 | :6192-6198 `unlock` 的扣款 | 先扣打卡星（§5.1）；拿掉 `typeof userStars !== 'undefined'` 的防禦（`userStars` 一定存在） |
| 7 | :6805-6807 `doCheckin` | `userBonusStars += 2; saveRewardData();`（`saveRewardData` 會順便更新頂端數字） |
| 8 | :7889 `resetChildMemory` | `userBonusStars = 0;`，註解改成「打卡星存在 montessori_bonus_stars，換人時重讀」 |
| 9 | tools/regress/montessori_regress.js:197 | `g.userBonusStars = window.userBonusStars …` 改成 `try { g.userBonusStars = userBonusStars; } catch (e) { g.userBonusStars = null; }`（頂層 `let` 不會掛在 `window` 上）；檔頭不用改 |

改完後 `grep -n "userBonusStars"` 只能出現在 #2、#3、#5（透過 `availableStars`）、#6、#7、#8；`grep -n "window.userBonusStars"` 必須 0 筆（regress 檔除外，且 #9 改完後那裡也沒有）。

### 5.4 不變式

- **K2-S1**：`userStars`、`userBonusStars` 都是非負整數；畫面上所有「持有幾顆星」都等於 `availableStars()`。
- **K2-S2 扣款守恆**：`availableStars() ≥ cost` 才會成交，成交後 `availableStars()` 剛好少 `cost`；否則兩個數字都不變。
- **K2-S3 持久**：打卡、買衣服之後，重新整理頁面，`availableStars()` 不變。
- **K2-S4 貼紙不受打卡星影響**：貼紙解鎖只看 `max(totalCorrect, userStars)`；打卡星永遠不進 `userStars`。
- **K2-S5 每位孩子各自一份**：換孩子、QM8 搬進度、刪孩子都照 `FAMILY_KEY_GROUPS` 處理新 key。
- **K2-S6 logic 不變**：logic_regress 一字不差；logic／index 的注音資料不變。

### 5.5 失敗語意

| 狀況 | 結果 |
|---|---|
| `montessori_bonus_stars` 是壞值（`'abc'`、`'-5'`、`'1.5'`） | `parseInt` 失敗或負數 → 0；`'1.5'` → 1。下一次存檔寫回正常值 |
| `montessori_stars` 是負數（`'-5'`） | 當成 0（現況會讀成 −5，頂端顯示負數）；下一次存檔寫回 `'0'` |
| 存檔失敗（容量滿） | `saveChildItem` → `safeSetItem` 先清學習紀錄再試（family.js:36-42）；還是失敗就只在記憶體，重新整理會少（跟 `montessori_stars` 一樣） |
| 被別的分頁刪掉的孩子 | `saveChildItem` 不寫（:4444-4447） |
| 買衣服時打卡星和答對星都不夠 | 跟現在一樣 `setSad` 不夠的提示，兩個數字都不變 |

### 5.6 注音

不新增文字。`doCheckin` 的「獎勵 2 顆星星！」維持原文（字都在 `ZhuyinMap`，實查）。

### 5.7 驗收

| 案例 | 步驟 | 預期 |
|---|---|---|
| K2-A1 | 全新 context，打卡 | 頂端星星 +2；`localStorage.montessori_bonus_stars === '2'`；重新整理後頂端、衣帽間仍是 +2 |
| K2-A2 | 預先寫 `montessori_stars='3'`，打卡（打卡星 2），買 `bunny_ears`（4 顆） | 成交；`montessori_bonus_stars === '0'`、`montessori_stars === '1'`、頂端 1、衣帽間 1。（main 會變成 stars 0、打卡星 2、還能再用：**這條直接對應 bug**） |
| K2-A3 | `montessori_stars='1'`＋打卡星 2，買 4 顆的 | 不成交，`setSad`；兩個 key 都不變 |
| K2-A4 | `montessori_stars='10'`＋打卡星 2，買 4 顆的 | 打卡星 0、stars 8（先扣打卡星） |
| K2-A5 | 兩位孩子：A 打卡 → 換 B → 換回 A | B 的頂端不含 A 的打卡星；回到 A 還在；B 沒有 `montessori_bonus_stars__<B>` 的 2 |
| K2-A6 | A 有打卡星 2，家長頁 QM8 把 A 的進度移給 B | B 的打卡星 2，A 的 key 被清掉 |
| K2-A7 | 開 logic_game.html 家長設定刪掉 B（同一個 context） | `montessori_bonus_stars__<B>` 不見了 |
| K2-A8 | 預先寫 `montessori_analytics.totalCorrect=4`、`montessori_stars='4'`、`montessori_stickers='[1,2]'`，在畫面上按打卡，再答對一題 | `unlockedStickerIds` 仍是 `[1,2]`（lifetime = max(5,5) = 5 < 6，貼紙 3 的門檻是 6，:5412）。突變「打卡加進 userStars」會變成 userStars 7 → 解鎖 id 3。另做一次預先寫 `montessori_bonus_stars='40'` 的版本，結果一樣是 `[1,2]` |
| K2-A9 | 舊資料：只有 `montessori_stars='7'`，沒有打卡星 key | 頂端 7，沒有 pageerror；打卡後寫出新 key |
| K2-A10 | `montessori_bonus_stars` 分別是 `'abc'`、`'-5'`；另一次 `montessori_stars='-5'` | 當成 0（頂端不出現負數），沒有 pageerror |
| K2-A11 | 靜態檢查 | `window.userBonusStars` 在數學樂園 0 筆；`build_common.py` 再跑一次 `git diff --exit-code` 乾淨 |
| K2-A12 | 回歸 | 見下 |

**回歸預期**
- 先用**新的** harness（#9 改過那一行）在 main 上跑，跟舊 harness 的輸出比：要一字不差（main 上打卡之後 `window.userBonusStars` 存在，裸名稱讀得到；打卡之前讀不到 → null，跟舊的一樣）。
- 再用新 harness 比 main 與 branch：除了下列種類，還有 `globals.userBonusStars` 在打卡前每一步（init～checkin: open）與 reload 那一步從 `null` 變成 `0`（branch 有頂層 `let userBonusStars = 0`）；買衣服之後從 `2` 變成 `0`。8aa8628＋原型實測 **59 條**（null→0 共 34 條）。**27 條是舊 harness 的數字，不要拿來比。**（稽核 r1 的 harness：`audit48/regress_old.js`／`regress_new.js`。）種類：
  - 新 key `montessori_bonus_stars`（harness 情境最後是 `0`：打卡 2 顆、買 4 顆的衣服先扣掉那 2 顆）；
  - `montessori_stars` 多 2（原型 5 → 7：衣服有 2 顆是用打卡星付的）；
  - 打卡之後每一步的 `stars`（頂端）多 2、`globals.userStars` 多 2（買衣服之後）；
  - 學習分析卡片的「星星總數」多 2；
  - **重新整理那一步**：main 的打卡星消失（這就是 bug），branch 還在（情境裡已經用完，所以是 0）。
- logic_regress：一字不差。

**改壞清單（K2）**

| 突變 | 會轉紅的案例 |
|---|---|
| 打卡星沒存檔（只改記憶體） | A1（重新整理後不見） |
| 扣款仍只扣 `userStars` | A2 |
| 先扣答對星 | A4 |
| 打卡直接加進 `userStars` | A1（打卡星 key 不是 `'2'`）、A8（多出貼紙 3） |
| 換孩子沒歸零 | A5 |
| `FAMILY_KEY_GROUPS` 沒加 | A6、A7 |
| 留著 `window.userBonusStars += 2` | A1、A11 |
| 頂端仍顯示 `userStars` | A1（頂端沒有 +2） |
| `parseInt` 沒擋負數（打卡星或答對星） | A10 |

---

## 6. K3：音效開關管全部音效（第 4 項）

### 6.1 數學樂園所有發聲點（8aa8628 grep `Sound\.`、`createOscillator`、`AudioContext`；#54 合併後要重跑，見 §2.2）

**發聲出口（真的建立 oscillator 的地方，共 7 處）**：`Sound.click`（:4977）、`Sound.wrong`（:4994）、`Sound.snap`（:5011）、`Sound.correct`（:5028，失敗時退回 `this.snap()`）、`Sound.cheer`（:5048）、`Sound.fanfare`（:5494，在物件定義之後另外加上去的）、串珠叮噹（`onBeadTouch` 內直接用 `Sound.ctx`，:5264-5281）。另外 #54 S3 的除法發珠叮噹（「叮噹聲看 isSoundOn」）合併後也算一處。`AudioContext` 只在 `Sound.init()`（:4971-4976）建立。

**呼叫點（52 處，全部要被開關管；K3 不需要逐一改，因為改的是出口）**：

| 類別 | 呼叫點（行號） |
|---|---|
| 答對 | `Sound.snap()`：挑戰 :7181、加法 :7275、減法 :7377、乘法 :7465、除法 :7560；天平 `Sound.correct()` :6033 |
| 答錯 | `Sound.wrong()`：天平 :6052、挑戰 :7204、加法 :7288、減法 :7390、乘法 :7475、除法 :7568、銀行 :7869、家長算式答錯 :8080 |
| 過關 | `Sound.fanfare()`（拿到新貼紙）:5715、`Sound.cheer()` :5726 |
| 打卡／衣帽間／錯題本 | 打卡 `snap`＋`correct` :6785-6786；買衣服 `correct` :6200；錯題「我學會了」`correct` :4724 |
| 串珠／教具 | 串珠叮噹 :5263-5281（#54 S2 之後在 `chime(n)`）；貼紙貼上畫板 `snap` :5378；天平 +1／−1 `click` :5997 |
| 介面點擊 `Sound.click()` | 換人頭像 :2570（inline onclick）、錯題本清空 :4735、開錯題本 :4799、開學習分析 :4960、戳小熊 :5097、換難度 :5228、貼紙畫板 :5396／:5404、開／關貼紙簿 :5515／:5583、貼紙卡 :5565、裝置教學 :5622／:5630、`closeModal` :5638、衣帽間 :6174／:6183／:6207／:6745、開打卡 :6899、挑戰分類 :6915、直式提示 :6921、銀行 :7624／:7630、「誰要玩？」:8009／:8014、家長設定 :8098、護眼 :8427／:8470／:8478／:8487 |

**不受開關影響**：朗讀（#54 的 `speakText`／`speechSynthesis`，含家長頁試聽）——#48 已回覆 owner「預設不包含朗讀」，Q8 已決定不管朗讀（邏輯遊戲的開關也不管朗讀：`audioEnabled` 只在音效函式裡判斷，logic_game.html :3198、:3215、:3224、:3231、:3236）；彈跳、數字氣泡、計數、彩帶、小熊表情。

### 6.2 作法：一個出口

```js
// 放在 const Sound 前面
const SOUND_KEY = 'montessori_sound_v1';          // 每台裝置一份（不跟孩子、不同步），值 'on' / 'off'
let isSoundOn = readSoundPref();                   // 取代 :5177 的 let isSoundOn = true;（#54 後先 grep 這一行）
function readSoundPref() { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { return true; } }
// 唯一的發聲出口：關掉時回傳 null，而且不建立 AudioContext
function soundOut() {
  if (!isSoundOn) return null;
  Sound.init();
  return Sound.ctx || null;
}
```
- `Sound` 的 6 個方法（含 `fanfare`）把開頭的 `this.init(); if (!this.ctx) return;`（`fanfare` 是 `Sound.init(); if (!Sound.ctx) return;`）改成 `if (!soundOut()) return;`，後面照舊用 `this.ctx`。
- 串珠叮噹（#54 S2 之後的 `chime(n)`）、除法發珠叮噹（S3）：`const actx = soundOut(); if (!actx) return;`；原本的 `if (isSoundOn)` 判斷可以拿掉（留著無害，但只留一個真相來源比較好）。**氣泡、彈跳、計數不能放在這個 return 後面**。
- `soundOut` **不要**做成 `Sound` 的方法：regress harness 會把 `Sound` 的每個方法（`init` 以外）換成只記名字（montessori_regress.js:98-99），如果叮噹聲改成呼叫 `Sound.xxx()`，harness 的 `sounds` 會多出新名字（S3 點籃子那一步就會有 N 筆）。放在外面就跟現在一樣「叮噹聲不出現在 sounds 裡」。
- `toggleSound()`：切換 → `try { localStorage.setItem(SOUND_KEY, isSoundOn ? 'on' : 'off'); } catch (e) {}` → `renderSoundButton()`。不用 `safeSetItem`（失敗時它會去清學習紀錄，為了一個開關不值得）。
- `renderSoundButton()`：把 :5190-5194 的外觀更新抽出來；啟動流程（:8536 起，`renderNavigation()` 附近）呼叫一次，讓記住的「靜音」一打開就顯示 🔕。
- 另一個分頁切換：`window.addEventListener('storage', e => { if (e.key === SOUND_KEY) { isSoundOn = readSoundPref(); renderSoundButton(); } })`。
- 切換時**不**播任何聲音（跟現在一樣）。

### 6.3 要不要記住開關

現在只在記憶體（:5177、:5188-5195），重新整理就變回開。K3 **記住、每台裝置一份**（Q7，指揮官已決定）：
- **PR 說明要寫一句**：邏輯遊戲的音效開關**不記住**（logic_game.html `let audioEnabled = true;` :3186，`toggleAudio()` :3240-3243 只切變數），這一點兩個遊戲不一樣，是刻意的。
- 理由：家長關掉音效，通常是因為場合（晚上、公共場所），重新整理又響起來會被當成 bug；跟邏輯遊戲「字體大小、朗讀快慢每台裝置各自記住，不跟進度同步」同一個分類（logic_game.html:3246、:3306）。
- 不放進 `FAMILY_KEY_GROUPS`（不是孩子的資料）、不放進 K4a 同步碼。
- 學習紀錄的 `soundOn`（:4552）意義不變（開題當下的開關狀態）；記住之後，靜音的紀錄會變多，這是真實情況。

### 6.4 不變式

- **K3-A1**：`isSoundOn === false` 時，任何操作都不會呼叫 `createOscillator`，也不會新建 `AudioContext`。
- **K3-A2**：`isSoundOn === true` 時，§6.1 每一類都照樣發聲（不能整個靜掉）。
- **K3-A3**：開關跟朗讀無關：靜音時開題照樣朗讀、🔊 照樣能按、家長頁試聽照樣念。
- **K3-A4**：靜音時氣泡、彈跳、計數、彩帶、小熊表情、過關視窗都跟有聲時一樣。
- **K3-A5**：開關狀態每台裝置記住，重新整理後一致；另一個分頁改了會跟著改。

### 6.5 失敗語意

| 狀況 | 結果 |
|---|---|
| `localStorage` 讀不到（隱私模式丟例外） | 預設開；切換只在記憶體有效 |
| 寫不進去 | 這一頁照樣切換；重新整理回到上次存成功的值 |
| key 是怪值（不是 `'off'`） | 當成開 |
| 沒有 `AudioContext` | 跟現在一樣不出聲、不出錯 |
| 靜音時第一次互動 | 不建立 `AudioContext`；之後打開音效，下一次發聲時才在使用者手勢裡建立（iOS 要求手勢，跟現在第一次發聲的時機一樣） |

### 6.6 學習紀錄與 build

不改出題、不改作答流程，**build 不變**。

### 6.7 注音

不新增文字（按鈕「🔔 音效」「🔕 靜音」維持原樣、不加注音；「效」不在 `ZhuyinMap`）。

### 6.8 驗收

harness：`addInitScript` 換掉 `window.AudioContext`／`webkitAudioContext`，假的 context 記 `window.__actx`（建立次數）、`window.__osc`（`createOscillator` 次數），oscillator／gain 的方法都是空函式。另外沿用 #54 regress 的假語音（`__regressSpeech`）。

| 案例 | 步驟 | 預期 |
|---|---|---|
| K3-A1 | 一開頁就按 🔔 → 🔕，然後：換難度、7 個題型各答錯一次再答對（含過關視窗）、讓貼紙解鎖一次（預先把答對數設在門檻前一題）、點串珠、加法數珠、除法發珠（#54 S3）、天平 +1、打卡、買衣服、錯題「我學會了」、開關貼紙簿、家長算式答錯 | `__osc === 0`、`__actx === 0` |
| K3-A1b | 先開聲點一次（任何會發聲的按鈕，`__actx` = 1）→ 按 🔔 → 🔕 → 做 A1 的動作 | `__osc` 不增加（`AudioContext` 已經存在時，靜音也要擋住；`__actx` 維持 1） |
| K3-A2 | 同 A1 但音效開著（對照組），每一類動作前後各讀一次 `__osc` | 每一類都 > 0：答對、答錯、過關（cheer／fanfare 各一次）、打卡、買衣服、串珠、除法發珠、天平 +1、介面 click |
| K3-A3 | 靜音 → 重新整理 | 按鈕是 🔕、`isSoundOn === false`、`localStorage.montessori_sound_v1 === 'off'`；再做 A1 的一小段仍是 0 |
| K3-A4 | 靜音時開新題 | `__regressSpeech` 多一句（朗讀照常）；按 🔊 再多一句 |
| K3-A5 | 靜音時點串珠 | 氣泡出現、號碼照 #54 S2 的規則（#54 S2-A19 繼續過） |
| K3-A6 | 靜音時開題、答對 | 這一題紀錄 `soundOn:false` |
| K3-A7 | 兩個分頁，A 切成靜音 | B 的 `isSoundOn === false`、按鈕 🔕，不用重新整理 |
| K3-A8 | `localStorage.setItem` 一律丟例外時切換 | 這一頁切換成功、沒有 pageerror |
| K3-A9 | 回歸 | montessori_regress：**一字不差**（harness 從不切換音效，Sound 方法本來就被換成記名字）；logic_regress：一字不差 |

**改壞清單（K3）**

| 突變 | 會轉紅的案例 |
|---|---|
| 只在 `Sound` 物件裡的 5 個方法加判斷、漏了後加的 `fanfare` | A1（貼紙解鎖那一步 `__osc > 0`） |
| 漏了串珠或除法發珠的叮噹聲 | A1 |
| 判斷寫在 `Sound.init()` 裡、方法照樣往下跑（用到舊的 `this.ctx`） | A1b（第一次有聲之後再靜音，`ctx` 已存在 → 仍發聲） |
| 叮噹聲的 return 放在氣泡前面 | A5 |
| 也擋了朗讀 | A4 |
| 永遠回傳 null（全靜音） | A2 |
| 有存檔但啟動沒讀 | A3 |
| 沒有 storage 監聽 | A7 |
| `localStorage` 例外沒包 try | A8 |
| 把 `soundOut` 做成 `Sound` 的方法 | A9（regress `sounds` 多出名字） |

---

## 7. K4a：數學樂園同步碼（第 7 項之一）

### 7.1 範圍與決定

- **兩個遊戲的同步碼分開**（Q9）：數學樂園自己一份碼、自己貼。理由：邏輯遊戲的匯入已經上線，舊版分頁只認 `typeof parsed.stars === 'number'`；合併成一份就得改邏輯遊戲的匯入、還要處理舊版 logic 看到合併碼的情況。分開的話 logic 一行都不用改。
- **同步什麼**（比照邏輯遊戲：只同步「進度」，不同步錯題本、學習紀錄、裝置設定；Q12 已決定不同步錯題本——owner 要求與邏輯遊戲一致，邏輯遊戲不同步錯題本）：

| 資料（key） | 同步 | 理由 |
|---|---|---|
| 答對星 `montessori_stars` | ✅ | 進度 |
| 打卡星 `montessori_bonus_stars`（K2） | ✅ | 進度，可以換衣服 |
| 貼紙 `montessori_stickers` | ✅ | 進度 |
| 衣帽間 `montessori_wardrobe`（已買、穿著） | ✅ | 進度 |
| 難度 `montessori_diff` | ✅ | 邏輯遊戲也同步 `difficulty` |
| 學習分析 `montessori_analytics`（題數） | ✅ | 貼紙門檻 `max(totalCorrect, userStars)` 要用 `totalCorrect`；不帶的話新裝置會用到不一致的數字 |
| 打卡 `montessori_checkin`（日期、連續天數） | ✅ | 進度；只帶日期（bitmap），每筆的 `timestamp` 不帶（全檔沒有地方讀它，`render` :6820-6885 只看 key 有沒有） |
| 錯題本 `montessori_mistakes` | ❌ | 邏輯遊戲也不帶錯題本；最多 50 筆中文，會讓碼大到不能掃（Q12） |
| 學習紀錄 `montessori_qlog_v1__<id>` | ❌ | 邏輯遊戲也不帶；每筆記著當時的 childId |
| 音效、朗讀速度、護眼、孩子名單 | ❌ | 每台裝置的設定；孩子 id／名字不放進碼（同邏輯遊戲 :3458-3461） |

- **放在哪裡**：**待 owner 回覆 Q10，K4a 開工前必須有答案。** 本計畫的建議是家長設定（要先答家長算式）裡新增「📲 跨裝置同步（數學樂園）」區塊。理由：匯入會整份覆蓋 7 個 key（含衣帽間），跟已經放在家長設定的「把進度移給…」（QM8）是同一類有破壞性的動作；頂端已經有約 10 個按鈕，再加會擠。代價：owner 說過「與邏輯遊戲一致」，邏輯遊戲是頂端 📲、孩子也按得到，這個建議是**偏離**，多一步家長算式。若 owner 選「跟邏輯遊戲一樣」，本節的資料格式、驗證、全有或全無都不變，只改入口（頂端按鈕＋獨立視窗）與 §7.6 #1、#2 的位置，開工前補一份入口的小改計畫。
- **匯入給誰**：一律匯入給**目前這位孩子**（同邏輯遊戲 :3539）；區塊上顯示「📥 會匯入給 🐰 名字。要給別的孩子，請先在上面換人。」
- **覆蓋，不合併**（同邏輯遊戲、同 QM8）。目標孩子已經有數學樂園進度（`hasMontessoriData`，:8227）時先 `confirm`（Q11 已決定：要確認，比照 QM8 :8247-8248）。

### 7.2 資料形狀（同步碼 v1）

編碼：`JSON.stringify(obj)` → UTF-8 → base64url（`+`→`-`、`/`→`_`、去掉 `=`）。JSON 只含 ASCII（id、數字、日期），但仍用 `btoa(unescape(encodeURIComponent(json)))` 再轉 base64url，跟邏輯遊戲同一套。解碼前**先去掉所有空白字元**（`text.replace(/\s+/g, '')`；LINE、備忘錄複製時常夾換行或空格）；**`msave` 網址參數來源要先把空白換回 `+`**（`URLSearchParams` 會把網址裡沒編碼的 `+` 解成空白；正常匯出的 base64url 沒有 `+`，這是給有人手動貼標準 base64 的情況），再去空白。之後把 `-`/`_` 換回、補 `=`，所以標準 base64 也收。

| 欄位 | 型別 | 來源（匯出） | 寫到（匯入） | 驗證（不合格 → 整份拒絕，除非註明「丟掉」） |
|---|---|---|---|---|
| `g` | `'montessori'` | 固定 | — | 必須等於 `'montessori'` |
| `v` | 整數 | 固定 1 | — | 1；> 1 → 「比較新的版本」；其他 → 格式不正確 |
| `t` | 整數（ms） | `Date.now()` | — | 選用；只用在 K4b 顯示「這份進度是哪天的」。**不是有限整數（`Number.isSafeInteger(t) && t > 0` 不成立）就當作沒有、忽略**，不拒絕整份；摘要不顯示匯出時間 |
| `s` | 整數 | 記憶體 `userStars` | `montessori_stars` | 0～1,000,000 的整數 |
| `bs` | 整數 | 記憶體 `userBonusStars` | `montessori_bonus_stars` | 同上 |
| `st` | 整數陣列 | `unlockedStickerIds` | `montessori_stickers` | 陣列、元素是整數；不在 `STICKER_DEFS` 的 id **丟掉**（新版可能多貼紙）；去重 |
| `w.b` | base64url 字串 | `Wardrobe.load().unlocked` → bitmask | `montessori_wardrobe.unlocked` | 解得開；超過已知長度的 bit **丟掉** |
| `w.e` | 長度 3 陣列（head、body、feet） | `Wardrobe.load().equipped` | `montessori_wardrobe.equipped` | 每格是 null 或字串；不是已解鎖、或部位不對的 → 該格 **丟掉**（設 null） |
| `d` | `'easy'`／`'normal'`／`'hard'` | `currentDifficulty` | `montessori_diff` | 三選一 |
| `an` | 16 個非負整數 | `[totalAnswered, totalCorrect, 題型1答題, 題型1答對, …, 題型7答題, 題型7答對]` | `montessori_analytics`（名稱從 `AnalyticsBook.initData()` 補） | 長度 16、每個 0～10,000,000 的整數 |
| `ci` | null 或 `{ d0, b, sk, ld }` | 打卡紀錄 | `montessori_checkin` | `d0`、`ld` 是合法的 `YYYY-MM-DD`（或 `ld === ''`）；`b` 解得開、≤ 460 bytes（約 10 年）；`sk` 0～100,000 的整數 |

- 不認得的欄位一律忽略（新版加欄位時，舊版照樣讀得到舊欄位）。
- **頂層永遠沒有 `stars` 欄位**（K4-Y2）：這是邏輯遊戲判斷「是不是自己的碼」的唯一條件（logic_game.html:3429、:4110），有了就會被舊版 logic 當成自己的碼整份覆蓋掉。
- **衣服 bitmask** 用凍結的順序表 `WARDROBE_SYNC_IDS`（= 現在 `Wardrobe.items` 的 33 個 id 順序，只能往後加、不能改順序或刪除），bit i（第 i>>3 個 byte 的第 i&7 位，LSB 先）= 第 i 件已解鎖，末尾的 0 byte 去掉。驗收要檢查 `Wardrobe.items` 的每個 id 都在表裡。
- **打卡 bitmap**：`dayNum(s) = Date.UTC(y, m−1, d) / 86400000`（只拿日期字串算，跟時區無關）；`d0` = 最早的打卡日，bit i = `d0 + i` 那天有打卡，位元順序同上。只收 `/^\d{4}-\d{2}-\d{2}$/` 而且是真的日期的 key。匯出時超過 3680 天的話只保留最近 3680 天。匯入時 `records[date] = { timestamp: 0 }`（0 = 不知道；`hasMontessoriData` 只看 key 數量，不受影響）。沒有打卡 → `ci: null` → 匯入寫 `{ records: {}, streak: 0, lastDate: "" }`。
- **黃金向量**（`golden.js` 產生，實作要能雙向對上）：
  - 狀態：stars 37、打卡星 6、貼紙 [1,2,3]、已解鎖 `pinkbow, bunny_ears, overalls`、穿 `bunny_ears`／`overalls`／無、難度 hard、學習分析 50／40、各題型 [10,9][8,6][7,5][6,5][5,4][7,5][7,6]、打卡 2026-10-01、10-02、10-04、10-09，streak 1，lastDate 2026-10-09，`t = 1792800000000`。
  - JSON：`{"g":"montessori","v":1,"t":1792800000000,"s":37,"bs":6,"st":[1,2,3],"w":{"b":"A0A","e":["bunny_ears","overalls",null]},"d":"hard","an":[50,40,10,9,8,6,7,5,6,5,5,4,7,5,7,6],"ci":{"d0":"2026-10-01","b":"CwE","sk":1,"ld":"2026-10-09"}}`
  - 碼：`eyJnIjoibW9udGVzc29yaSIsInYiOjEsInQiOjE3OTI4MDAwMDAwMDAsInMiOjM3LCJicyI6Niwic3QiOlsxLDIsM10sInciOnsiYiI6IkEwQSIsImUiOlsiYnVubnlfZWFycyIsIm92ZXJhbGxzIixudWxsXX0sImQiOiJoYXJkIiwiYW4iOls1MCw0MCwxMCw5LDgsNiw3LDUsNiw1LDUsNCw3LDUsNyw2XSwiY2kiOnsiZDAiOiIyMDI2LTEwLTAxIiwiYiI6IkN3RSIsInNrIjoxLCJsZCI6IjIwMjYtMTAtMDkifX0`
  - 欄位順序固定 `g, v, t, s, bs, st, w, d, an, ci`（才能逐字比對）。

### 7.3 大小（`sync_size.js`，網址假設 `https://zenobialin-ai.github.io/kids-logic-game/montessori_math_game.html?msave=`）

| 情境 | JSON | 碼 | 網址 | QR（ECC L） |
|---|---|---|---|---|
| 新孩子 | 213 | 284 | 364 | v12（65 格） |
| 玩 3 個月 | 341 | 455 | 535 | v16（81 格） |
| 重度 3 年、33 件全買、衣服用 bitmask | 523 | 698 | 778 | v19（93 格） |
| 同上但衣服用 id 陣列 | 909 | 1212 | 1292 | v26（121 格） |
| 參考：邏輯遊戲滿進度 | — | — | 425 | v13（69 格） |
| 參考：不壓縮的打卡紀錄 3 年（localStorage 原樣） | 38,549 | — | — | 放不進 QR |

QR 版本是 byte 模式、ECC-L 的精確值（v1 的表偏大，稽核 r1 L16 更正；網址含小寫字母，只能用 byte 模式）。所以衣服用 bitmask、打卡用 bitmap。限制：貼上的字串超過 4000 字直接當格式不正確（不解碼）；網址超過 1500 字時 K4b 不顯示 QR、只給複製網址。

### 7.4 新舊版本、別的遊戲互讀（失敗語意）

| 貼進去的東西 ＼ 貼到哪裡 | 數學樂園 K4a 起 | 邏輯遊戲（現在與之後都不改） | 數學樂園 K4a 之前 |
|---|---|---|---|
| 數學樂園碼 v1 | 匯入（確認後覆蓋） | **拒絕**：「❌ 代碼格式不正確…」，存檔不變、`?save=` 也拒絕並從網址拿掉（`cross_logic.js` 實測，標準 base64 與 base64url 都是） | 沒有匯入功能；`?msave=` 被忽略（留在網址上，無害） |
| 數學樂園碼 v2（未來） | 拒絕：「這是比較新的版本做出來的進度碼，請重新整理這一頁再試」，不寫任何 key | 拒絕（同上，沒有 `stars`） | — |
| 邏輯遊戲碼（有數字 `stars`、有物件 `completed`、沒有 `g`） | 拒絕：「這是小小邏輯探險家的進度碼，請到小小邏輯探險家的『同步/分享』貼上」，不寫任何 key | 照舊匯入 | — |
| 亂碼、只複製一半、空字串 | 空字串：「請先貼上進度碼」；其他：「進度碼不完整或格式不對，請確認有沒有整段複製」 | 照舊 | — |
| 超過 4000 字 | 同「格式不對」，不解碼 | 照舊 | — |
| 欄位型別錯（例：`s: -5`、`an` 長度 15） | 整份拒絕（同「格式不對」），不寫任何 key | — | — |
| 未知貼紙 id、未知衣服 bit、穿著的衣服沒解鎖 | 只丟掉那個值，其他照樣匯入 | — | — |

訊息都寫在家長頁的 `parentMsg`（`setParentMsg`，:8046），不加注音。

### 7.5 匯入流程（全有或全無）

```
importMontessoriCode(text):
  1 snap = decodeMontessoriCode(text)            // 純函式：回傳 { ok, err, data }；不碰 localStorage、不碰畫面
    !ok → setParentMsg(訊息[err]); return
  2 target = activeChildId
    if hasMontessoriData(target) && !confirm('會用這份進度覆蓋 <孩子> 在這台裝置上的數學樂園進度（不會合併），確定嗎？') → return
  3 qlogClose('replaced')                        // 進行中的那一題
    for (n = cancelPendingSuccess(); n > 0; n--) addStarAndCheckReward()   // 同 QM8 :8250：先記完，再整份覆蓋
  4 rows = toStorageRows(snap.data)              // 7 個 [key, value]，key = childKey(base, target)
    backup = rows.map(([k]) => [k, localStorage.getItem(k)])
    for [k, v] of rows: if !safeSetItem(k, v) →
      // 還原：先 removeItem 已寫的 key（騰出空間），再用 try { localStorage.setItem(k, backup) } 寫回 backup
      //       （backup 是 null 的只要 removeItem；不經過 safeSetItem，避免再砍一次學習紀錄）
      restored = 還原全部成功？
      if (!awaitingPick && !eyeLockShown()) switchMode(currentMode)   // 第 3 步已經關掉進行中的題：開一題新的（L9）
      reopenParentSettings()
      setParentMsg(restored ? '儲存空間不夠，沒有匯入；原本的進度還在。'
                            : '儲存空間不夠，匯入中斷；請重新整理後再試')
      return
  5 applyChildSwitch(target, 'replaced')         // 重讀記憶體、衣帽間、徽章；不在「誰要玩？」或護眼鎖時出新題（qlogClose 已關過，再呼叫是 no-op，family.js:440）
    reopenParentSettings()                       // 比照 QM8 :8263-8266：留在家長頁，讓家長看到多分頁警告
    setParentMsg('已經匯入給 <孩子>，現在有 N 顆星星。如果還有其他開著數學樂園的分頁，請把它們關掉，不然它們存檔時會把舊的進度寫回 <孩子>。')
    showToast(`收到進度了！現在有 ${availableStars()} 顆星星！`)
```
- 第 4 步：`safeSetItem` 第一次失敗時會先呼叫 `familyHooks.freeSpace()`（= `qlogFreeSpace`，每位孩子的學習紀錄砍一半，family.js:9、:36-42）再試，所以**就算最後匯入失敗，學習紀錄也可能已經被砍半**；這是既有的取捨（QM8、所有進度存檔都一樣），K4-Y4 對這條路徑例外。還原那一段刻意不用 `safeSetItem`，避免為了還原再砍一次。
- 第 5 步不 `closeModal`、改成 `reopenParentSettings`（v1 是關家長頁）：成功訊息裡有多分頁警告（同 QM8 :8266 的寫法），要留在家長頁家長才看得到；toast 照樣出。
- `applyChildSwitch`（:7894-7908）在 `activeChildId` 不變時也能用：它會 `resetChildMemory` → `loadRewardData` → `loadDifficulty` → `Wardrobe.applyToMascot` → 更新徽章 → `switchMode(currentMode)`。
- 匯出 `encodeMontessoriCode()`：目前這位孩子；星星用記憶體的 `userStars`／`userBonusStars`（`montessori_stars` 不存在時記憶體是推算值），其他用各自的 `load()`（不存在時是預設值）。所以「新孩子匯出→匯入」會把預設值明確寫進 key，無害。

### 7.6 改動

| # | 位置（錨點） | 做什麼 |
|---|---|---|
| 1 | （Q10 選家長設定時）montessori 家長頁 HTML，`<div id="parentMoveBox">` 那段結束之後、「👀 護眼時間」那一列之前（8aa8628 :3059 之後） | 新區塊：`📲 跨裝置同步（數學樂園）`：`[複製進度碼]` 按鈕＋唯讀 `<textarea id="syncCodeOut">`；`<input id="syncCodeIn">`＋`[匯入]`；說明文字（同步什麼、不同步什麼、會覆蓋）；`<div id="syncTargetLine">` |
| 2 | `renderParentSettings`（:8126） | 填 `syncTargetLine`、清空 `syncCodeOut`（不要一打開就產生，避免家長以為已經複製） |
| 3 | 新函式（放在 QM8 `parentMoveProgress` 附近，:8241 之後） | `WARDROBE_SYNC_IDS`、`b64uEncode/b64uDecode`、`bitsEncode/bitsDecode`、`dayNum/dayStr`、`encodeMontessoriCode`、`decodeMontessoriCode`、`toStorageRows`、`importMontessoriCode`、`copyMontessoriCode`（`navigator.clipboard.writeText`，失敗退回 `prompt`，同邏輯遊戲 :4072-4084） |
| 4 | CSS | textarea／input 寬度 100%、等寬字；≤768px 不水平捲動 |

family.js 不動（同步只有數學樂園用，放 family.js 會讓 logic 多一段不用的程式）。

### 7.7 不變式

- **K4-Y1 全有或全無**：匯入結束時，目標孩子的 7 個 key 要嘛全部是碼裡的值，要嘛全部是匯入前的值。
- **K4-Y2 對邏輯遊戲安全**：碼的頂層沒有 `stars`；碼只含 base64url 字元。
- **K4-Y3 來回一致**：`decode(encode(狀態))` 寫出來的 7 個 key，跟原狀態正規化後相同（打卡 timestamp → 0、學習分析名稱 → 預設名稱、未知值被丟掉）。
- **K4-Y4 只動該動的**：只寫目標孩子的 7 個 key；錯題本、學習紀錄、別的孩子、裝置設定（音效、朗讀速度、護眼、名單）byte-identical。**容量不足那條路徑例外**：`safeSetItem` 會先砍學習紀錄（`qlogFreeSpace`），這是既有的取捨（§7.5 第 4 步）。
- **K4-Y5 版本閘門**：`v` 不是 1 的碼不會寫入任何東西。
- **K4-Y6 沒有網路**：K4a 不連任何外部服務。

### 7.8 學習紀錄與 build

匯入會用 `'replaced'` 關掉進行中的那一題、出一題新題（既有的 outcome）。不改出題，**build 不變**。

### 7.9 注音

家長頁的文字不加注音（沿用現況）。孩子看得到的只有匯入成功的 toast「收到進度了！現在有 N 顆星星！」（`zy_check.js`：字都在；不用「搬」「匯」）。

### 7.10 驗收

狀態種子 `HEAVY`：stars 37、打卡星 6、貼紙 1～5、衣服 8 件（含穿著）、難度 hard、學習分析隨意、打卡 40 天（有缺日、跨月）、錯題 3 筆。

| 案例 | 步驟 | 預期 |
|---|---|---|
| K4-A1 | context 1 寫入 HEAVY → 家長頁 → 複製進度碼；context 2（全新）貼上 → 匯入 | context 2 的 7 個 key 跟 HEAVY 正規化後相同（K4-Y3）；`montessori_mistakes` 不存在；頂端 43 顆；小熊穿著一樣；難度按鈕是 hard；打卡月曆同樣的日期有章、連續天數相同 |
| K4-A2 | 黃金向量（context 設 `timezoneId: 'Asia/Taipei'`）：把 §7.2 的碼貼進全新 context | 寫出的 key 等於 §7.2 的狀態；反過來把該狀態寫進去（`Date.now` 固定成 `t`）匯出 → 逐字等於 §7.2 的碼。**位元順序、日期算法、欄位順序只有這條測得到**（A1 的來回測試兩邊用同一套程式，順序寫反也會過） |
| K4-A3 | 目標孩子已有進度，匯入時 `confirm` 按取消／確定 | 取消：所有 localStorage byte-identical；確定：覆蓋 |
| K4-A4 | 貼邏輯遊戲的碼（`btoa` 一份 `{stars:5,completed:{…}}`） | 顯示「小小邏輯探險家的進度碼…」；localStorage byte-identical |
| K4-A5 | 把 A1 產生的碼貼進 logic_game.html 的同步視窗，也用 `logic_game.html?save=<碼>` 開 | 都被拒絕、`little_logic_save_v1` 不變（重跑 `cross_logic.js` 的情境，碼換成真的匯出結果） |
| K4-A6 | 空字串、`'abc'`、A1 的碼砍掉最後 10 字、4001 個 `A` | 對應訊息；localStorage byte-identical；沒有 pageerror |
| K4-A7 | 改成 `v:2` 的碼 | 「比較新的版本」；byte-identical |
| K4-A8 | `s:-5`、`an` 少一個、`d:'super'`、`ci.d0:'2026-02-30'` 各一份 | 整份拒絕；byte-identical |
| K4-A9 | `st` 含 99、`w.b` 多出第 40 位、`w.e` 穿著沒解鎖的衣服；另一份 `t: 'x'`、一份 `t: 1.5` | 匯入成功；99、第 40 位被丟掉；那一格穿著變 null；`t` 壞掉的那兩份照樣匯入（`t` 被忽略） |
| K4-A10 | 在 page 裡把 `localStorage.setItem` 包一層：寫到第 4 個同步 key 時丟例外 | 7 個 key 必須等於匯入前；顯示「儲存空間不夠，沒有匯入；原本的進度還在。」；學習紀錄可能被砍半（不算失敗）；第 3 步關掉的那題之後有新的一題開著。變形：還原時的 `setItem` 也丟例外 → 顯示「儲存空間不夠，匯入中斷；請重新整理後再試」，沒有 pageerror |
| K4-A11 | 答對後 100ms 內（過關還沒出現）匯入 | 匯入後星星 = 碼裡的值（沒有多 1）；過關視窗沒有出現在新題目上 |
| K4-A12 | 匯入前有一題進行中 | 那筆紀錄 `outcome:'replaced'`；新開一筆；難度＝碼裡的值 |
| K4-A13 | 兩位孩子，目前是 B，匯入 | 只有 B 的 key 變；A 的 key byte-identical |
| K4-A14 | 時區 `America/New_York`，打卡跨 2026-03-08（夏令時間開始）匯出 → 匯入；再用 `Asia/Taipei` 跑一次（同一組日期，另外檢查匯出的 `ci.d0` 字串等於最早的打卡日） | 兩個時區都一天不差；`d0` 正確 |
| K4-A15 | 匯出的碼 | 解碼後頂層沒有 `stars`；不含孩子名字、`c0`、任何非 ASCII 字元；`Wardrobe.items` 的每個 id 都在 `WARDROBE_SYNC_IDS` 裡 |
| K4-A16 | 360×640、768×1024：家長頁同步區塊 | 沒有水平捲動；截圖 |
| K4-A17 | 回歸 | montessori_regress、logic_regress 都一字不差（harness 不開家長頁、不帶網址參數） |

**改壞清單（K4a）**

| 突變 | 會轉紅的案例 |
|---|---|
| 碼的頂層用 `stars` 當欄位名 | A5（舊版 logic 會接受並覆蓋）、A15 |
| 一邊寫一邊驗證（寫到一半才發現壞） | A8、A10 |
| 沒有還原 | A10 |
| 還原時走 `safeSetItem` | A10 的變形（還原也失敗時會再砍一次學習紀錄；訊息不對） |
| 失敗後沒開新題 | A10（沒有開著的題） |
| `t` 不是整數時拒絕整份 | A9 |
| 沒有 `confirm` | A3 |
| 忘了帶打卡星 | A1 |
| bitmap 位元順序寫成 MSB 先（encode／decode 一起錯） | A2（A1 會過） |
| 衣服 bitmask 用 `Wardrobe.items` 的即時順序而不是凍結表 | A15（表的檢查）；之後有人插入新衣服時 A2 轉紅 |
| 用 `new Date(y, m-1, d).getTime() / 864e5` 再 floor 算差值（本地午夜） | A14（`Asia/Taipei` 那一次：本地午夜是前一天 16:00 UTC，floor 後少一天；`America/New_York` 單跑抓不到）、A2 |
| 沒擋 `v > 1` | A7 |
| 把邏輯碼當成格式錯誤（沒有專屬訊息） | A4 |
| 匯入沒先處理還沒出現的過關 | A11 |
| 也把錯題本覆蓋掉 | A1（`montessori_mistakes` 出現）、A13 |

---

## 8. K4b：同步網址、QR、開網址時的提示（第 7 項之二）

### 8.1 行為

- 家長頁同步區塊再加：`[複製同步網址]` 與 QR 圖。網址組法：`const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('msave', code);`，用 `u.toString()`。跟邏輯遊戲同樣用 `new URL` ＋ `searchParams.set`（logic_game.html :4027-4031）；多清掉 `search`／`hash`，網址上原本的其他參數（例如還沒拿掉的 `msave`）不會跟著帶出去（邏輯遊戲沒有清，這一點不同）。
- QR 跟邏輯遊戲一樣用 `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=<encodeURIComponent(網址)>`，畫面顯示 220×220（邏輯遊戲是 200，數學樂園的碼較長，重度使用者 v19（93 格）在 200px 只有約 2 px／格）；`onerror` 就藏起來（離線、`file://`）。網址超過 1500 字不顯示 QR。**跟邏輯遊戲一樣會把網址送到第三方服務**；碼裡沒有名字或 id，PR 說明寫一句。
- 參數名用 **`msave`**（不用邏輯遊戲的 `save`），兩個遊戲的網址不會互相誤認。
- **開網址時不自動匯入**（**Q13 待 owner 回覆，K4b 開工前必須有答案**；以下是本計畫的建議）：
  1. 啟動時（`activeChildId = readProfiles().active;` 之前，8aa8628 :8536）讀 `msave`，**不論成功與否都立刻** `history.replaceState` 把它從網址拿掉（同邏輯遊戲 :3433-3438，避免每次重新整理都再來一次）。
  2. 解碼成功 → 存在記憶體 `pendingSyncCode`，頂端下方出現一條提示 `<div id="syncPendingBanner">`：`zy('📲 收到進度了！請爸爸媽媽來看看')`＋按鈕 → `openParentSettings()`。解碼失敗（壞碼、別的版本、邏輯碼一律）→ `showToast('這個進度連結不完整')`（文字寫死；字都在 `ZhuyinMap`，稽核 r1 `audit48/zy2.js` 實查；v1 的「進度網址不完整」缺「網」「址」）且不顯示提示條。
  3. 家長頁同步區塊看到 `pendingSyncCode` 時：把碼填進 `syncCodeIn`、顯示摘要「⭐ N 顆星（含打卡星 M）、👗 K 件衣服、📅 D 天打卡、難度 X、匯出時間 YYYY-MM-DD」，按 `[匯入]` 走 K4a 同一個 `importMontessoriCode`。匯入成功或家長按「不要」→ 清掉 `pendingSyncCode`、拿掉提示條。
  4. 啟動流程其餘照舊：護眼鎖著就先鎖、`askOnOpen` 就先問「誰要玩？」、否則出第一題。提示條不擋任何東西；它在 `header` 裡，所以「誰要玩？」與護眼鎖開著時也跟著 `inert`（`setPageInert`，:7980-7984），解鎖、選好之後才按得到。
- 理由（Q13 的建議）：數學樂園匯入會覆蓋衣帽間等 7 個 key；網址可能在 LINE 群組裡被孩子點到。代價：比邏輯遊戲多一步（家長算式）；owner 說過「與邏輯遊戲一致」，這是**偏離**，要 owner 同意（附錄 A）。若 owner 選「跟邏輯遊戲一樣自動匯入」，K4b 要改成：1 位孩子直接匯入、2 位以上要讓「誰要玩？」支援「要匯入給誰？」（數學樂園的選單目前沒有 `onPick`），開工前另補計畫。也因此 K4b **不用**改「誰要玩？」去支援「要匯入給誰？」（數學樂園的選單目前只有固定標題、沒有 `onPick`，:7969-8006）——要給別的孩子，家長在家長頁先換人再匯入。

### 8.2 改動

| # | 位置 | 做什麼 |
|---|---|---|
| 1 | 家長頁同步區塊（K4a #1） | 加複製網址按鈕、`<img id="syncQrImg">` |
| 2 | 放在 `<header>`（:2566-2600）裡面的最後一個子元素（`.header-action-row` 之後、`</header>` 之前） | `syncPendingBanner`（預設 `display:none`）；放在 `<header>` 裡才會跟著 `setPageInert` 一起 `inert`（§8.1 第 4 點） |
| 3 | 啟動流程 :8536 前 | 讀並拿掉 `msave` |
| 4 | `renderParentSettings` | 有 `pendingSyncCode` 時填碼、顯示摘要、捲到同步區塊 |
| 5 | `importMontessoriCode` 成功時、家長按「不要」時 | 清 `pendingSyncCode`、藏提示條 |

### 8.3 不變式

- **K4b-U1**：網址上的 `msave` 在載入完成後一定不存在（成功、失敗、沒用到都一樣）。
- **K4b-U2**：家長沒按匯入之前，localStorage 的數學樂園 key byte-identical。
- **K4b-U3**：帶不帶 `msave`，啟動後的第一題、護眼、「誰要玩？」行為都跟沒帶時一樣（除了多一條提示）。

### 8.4 失敗語意

| 狀況 | 結果 |
|---|---|
| `msave` 是壞碼、別的版本、邏輯碼 | 參數拿掉；toast 一句；不顯示提示條；不寫任何 key |
| 同時有 `save`（邏輯遊戲的參數） | 忽略 `save`，不動它 |
| `history.replaceState` 不能用（極舊瀏覽器、某些 file:// 環境） | try/catch；參數留著，重新整理會再出現提示條，仍要家長按才匯入，無害 |
| QR 服務連不上 | 圖藏起來，複製網址照樣能用 |
| 剪貼簿被擋 | 退回 `prompt` 顯示網址 |
| 開網址時護眼鎖著／「誰要玩？」開著 | 先處理那個；提示條在之後才按得到 |

### 8.5 學習紀錄、build、注音

build 不變。孩子看得到的新文字：提示條「📲 收到進度了！請爸爸媽媽來看看」、失敗 toast「這個進度連結不完整」（字都在 `ZhuyinMap`，實查）。

### 8.6 驗收

| 案例 | 步驟 | 預期 |
|---|---|---|
| K4b-A1 | 用 `montessori_math_game.html?msave=<K4a-A1 的碼>` 開全新 context | `location.search` 沒有 `msave`；提示條出現；localStorage 的數學樂園 key 跟沒帶參數時一樣（K4b-U2）；第一題照常出現 |
| K4b-A2 | 接 A1：按提示條 → 家長算式 → 同步區塊 | 輸入框已填碼、摘要數字正確；按匯入 → 同 K4a-A1 的結果；提示條消失 |
| K4b-A3 | `?msave=abc`、`?msave=<邏輯碼>`、`?msave=<v2 碼>` | 參數拿掉、toast、沒有提示條、byte-identical、沒有 pageerror |
| K4b-A4 | 預先寫護眼「快到上限且已鎖」再用帶碼的網址開 | 先出護眼鎖；解鎖後提示條按得到；匯入給目前的孩子 |
| K4b-A5 | 兩位孩子、`askOnOpen` 開著，用帶碼網址開 | 先問「誰要玩？」；選好之後提示條按得到；匯入給選到的孩子 |
| K4b-A6 | 家長頁 QR | `src` 以 `https://api.qrserver.com/` 開頭、`data` 解開後是含 `msave=` 的網址；在 file:// 下觸發 `onerror` 後 `display:none`（可用 `page.route` 擋掉該網址來模擬，不真的連外） |
| K4b-A7 | 複製網址（stub `navigator.clipboard.writeText` 記下參數）；頁面網址先帶 `?foo=1#bar` | 記下的字串 = `origin + pathname + '?msave=' + 碼`（沒有 `foo`、沒有 `#bar`）；用它開新 context 走 A1 成立 |
| K4b-A8 | 把 HEAVY 改成 10 年打卡、33 件衣服 | 網址 ≤ 1500 字、QR 顯示；人為把門檻改小（`let SYNC_QR_MAX_URL`，測試可改）時 QR 不顯示、複製網址照樣可用 |
| K4b-A9 | 回歸 | montessori_regress、logic_regress 一字不差 |
| K4b-A10 | 開網址時碼被插了空白／換行（`?msave=` 後的碼中間加 `%20`、`%0A`） | 照樣解碼成功、提示條出現（L6） |
| K4b-M1（人工，Q14） | PR 的人工檢查項：用實際的 iPad 與一支手機相機掃重度使用者（v19）的 QR | 掃得到並打開正確網址；掃不到就把顯示尺寸加大或只給複製網址，PR 說明記結果 |

**改壞清單（K4b）**

| 突變 | 會轉紅的案例 |
|---|---|
| 解碼失敗時沒拿掉參數 | A3（`location.search` 還有 `msave`） |
| 解碼前沒去空白 | A10 |
| 網址組法沒清 `search`／`hash` | A7 |
| 開網址就自動匯入 | A1（K4b-U2） |
| 讀參數放在 `loadRewardData` 之後並直接寫入 | A1 |
| 參數名用 `save` | A1（讀不到）；也會跟邏輯遊戲混淆 |
| 提示條在護眼鎖時也能按 | A4 |
| QR `onerror` 沒處理 | A6 |

---

## 9. 設計決定

| # | 決定 | 選項 | 建議與理由 |
|---|---|---|---|
| D1 | 「N以內」的意思 | (a) 畫面上每個數 ≤ N (b) 只有答案 ≤ N | (a)，跟加法、減法對同一個標籤的解讀一致（最大的那個數 ≤ N）；普通依 Q1 比照「不進位」上限 9 |
| D2 | 天平困難的「進退位」 | (a) 左邊兩個個位數相加必進位（11～18） (b) 只要 ≤ 20 | (a)，抽法直接沿用加法困難；(b) 會留下一半 ≤ 10 的題目，比普通還簡單 |
| D3 | 天平選項 | (a) 新的 `balanceOptions`（有範圍、Fisher–Yates） (b) 修 `generateOptions` | (a)。(b) 會改到加減乘除四個題型的選項與亂數序列，超出第 5 項 |
| D4 | 打卡星存法 | (a) 獨立 key (b) 直接加進 `montessori_stars` | (a)。(b) 會讓 `userStars` 超過答對題數，貼紙門檻 `max(totalCorrect, userStars)` 就會因為打卡解鎖貼紙，改到貼紙的行為 |
| D5 | 扣款順序 | 先扣打卡星／先扣答對星 | 先扣打卡星（Q5）。兩者對貼紙沒有影響（D4），只是決定哪個數字留著 |
| D6 | 星星顯示 | 顯示總數／只顯示答對星 | 總數（Q6）。現在頂端與衣帽間已經對不起來；可以拿來換衣服的星星就應該算在「持有」裡 |
| D7 | 音效開關怎麼管 | (a) 統一出口 `soundOut()` (b) 52 個呼叫點各自判斷 | (a)。(b) 漏一處就破功，之後新加的音效也會漏 |
| D8 | 音效開關記不記住 | 記住（每台裝置）／只在記憶體／每位孩子 | 每台裝置記住（Q7），同字體、朗讀速度的分類 |
| D9 | 音效開關管不管朗讀 | 管／不管 | 不管（已在 #48 回覆 owner；#54 計畫 §7.1 Q2） |
| D10 | 同步碼合併或分開 | 分開／一份碼含兩個遊戲 | 分開（Q9）。合併要改邏輯遊戲的匯入，還要處理舊版 logic 讀到合併碼 |
| D11 | 數學樂園碼的辨識 | `g:'montessori'`＋`v`，頂層不用 `stars` | 舊版 logic 只看 `stars`，這樣永遠不會被誤收（實測） |
| D12 | 衣服、打卡的編碼 | id 陣列＋日期字串／bitmask＋bitmap | bitmask＋bitmap：重度使用者的網址 1292 → 778 字，QR 從 v26 降到 v19；代價是凍結順序表與黃金向量測試 |
| D13 | 匯入 UI 放哪裡 | 家長設定／頂端按鈕 | **待 owner（Q10）**。建議家長設定，同 QM8 的破壞性等級；偏離 owner 的「與邏輯遊戲一致」 |
| D14 | 網址開啟時 | 自動匯入（同邏輯遊戲）／提示家長 | **待 owner（Q13）**。建議提示家長；附帶好處：不用改「誰要玩？」；同樣是偏離 |
| D15 | 匯入覆蓋或合併 | 覆蓋／合併 | 覆蓋，同邏輯遊戲與 QM8；有資料時先確認（Q11） |
| D16 | 同步程式放哪裡 | family.js／數學樂園 | 數學樂園。只有它用，放 family.js 會讓 logic 多一段不用的程式、擴大「logic 不變」要證明的範圍 |
| D17 | build | K1 +1、其他不變 | 只有 K1 改出題（`MONTESSORI_LOG_BUILD` 註解的規則） |

---

## 10. 開放問題

### 10.1 已決定（v2，指揮官 2026-10-24）

| # | 問題 | 決定 | 影響到哪裡 |
|---|---|---|---|
| Q1 | 天平「普通」要出到 10（標籤寫 10以內），還是比照加減法「不進位」只到 9？ | **只到 9**（L 6～9、選項上限 9） | §4.2、§4.3、K1-A1、改壞清單 |
| Q2 | 天平「簡單」要從 3 起（同減法簡單），還是從 2 起？ | **從 3 起** | §4.2 |
| Q3 | 天平困難題要不要排除「右邊已知數 = 左邊某個加數」（例：6＋7＝6＋❓，約 23%）？ | **不排除**（現況也允許；這種題本身就是「等號兩邊一樣」的好例子） | §4.2 |
| Q3b | 天平困難題的右邊已知數 b 有 31% 是兩位數（10～16），要不要限制成個位數？ | **已決定：不限制**（總重 ≤ 20 符合標籤；加法困難的和本來就是 11～18） | §4.2 |
| Q4 | 以前打卡送的星星要不要補發？ | **不補發**（資料不存在：那些星星只在當時的頁面記憶體裡） | §5.2 |
| Q5 | 買衣服先扣打卡星還是答對星？ | **先扣打卡星** | §5.1、K2-A4 |
| Q6 | 頂端、貼紙簿、過關、學習分析的星星數改成「答對星＋打卡星」？ | **顯示總數** | §5.1 |
| Q7 | 音效開關要不要記住？ | **每台裝置記住**。PR 說明要寫：邏輯遊戲的音效開關不記住 | §6.3 |
| Q8 | 音效開關要不要也管朗讀？ | **不管**（邏輯遊戲的開關也不管朗讀） | §6.1、K3-A4 |
| Q9 | 兩個遊戲的同步碼要分開還是合併？ | **分開** | §7.1 |
| Q11 | 匯入時目標孩子已有進度要不要先確認？ | **要確認**（比照「把進度移給…」） | §7.1、§7.5 |
| Q12 | 錯題本要不要一起同步？ | **不同步**（owner 要求與邏輯遊戲一致，邏輯遊戲不同步錯題本） | §7.1 |
| Q14 | v19 的 QR 在實際 iPad／手機相機掃不掃得到？ | **列為 K4b PR 的人工檢查項**（K4b-M1） | §8.6 |

### 10.2 仍待 owner（K4a／K4b 開工前必須取得回覆）

| # | 問題 | 本計畫的建議 | 卡住哪一輪 |
|---|---|---|---|
| Q10 | 數學樂園的同步放在家長設定（要答家長算式），還是跟邏輯遊戲一樣放頂端、孩子也按得到？ | 家長設定 | **K4a** |
| Q13 | 用同步網址打開時自動匯入（同邏輯遊戲），還是提示家長到家長設定匯入？ | 提示家長 | **K4b** |

- **K4a／K4b 開工前必須取得 owner 回覆。** owner 說過「與邏輯遊戲一致」，本計畫的建議（家長設定、開網址只提示）是**偏離**，要在 #48 用一則留言講清楚代價（多一步家長算式）與理由（匯入會覆蓋衣帽間等 7 個 key、LINE 群組的連結孩子可能點到）。留言草稿見**附錄 A**（指揮官給使用者看過再發）。
- K1～K3 不受這兩題影響。

---

## 11. 不在範圍（另開或維持現狀）

- 第 6 項每日打卡上限：owner 決定維持現狀。
- `generateOptions` 備援分支不檢查 min／max（加減乘除的選項偶爾會超出範圍）：既有問題，不影響第 5 項；要修另開票（會改到四個題型的亂數序列）。
- 貼紙卡「再答對 N 題」用 `st.req − userStars`（:5566），但解鎖用 `max(totalCorrect, userStars)`：既有不一致，K2 不碰。
- 兩個分頁同時開著時，星星「後寫的贏」：既有行為（`userStars` 也是），K2 不處理。
- **已知限制（K2）**：還開著的**舊版** logic_game.html 分頁（K2 合併前載入的，`FAMILY_KEY_GROUPS` 沒有新 key）在家長設定刪孩子時，不會刪 `montessori_bonus_stars__<id>`；留下的 key 無害（名單重建可能把那位孩子找回來，跟其他殘留 key 一樣），重新整理過的分頁就正常。
- 邏輯遊戲的同步：一行都不改。
- 同步碼加密、雲端同步：不做。

---

## 12. 審查處理對照（計畫稽核 r1 → v2）

| # | 發現 | 處理 | 改在哪 |
|---|---|---|---|
| M1 | K2 回歸預期的差異數用的是舊 harness | 照建議：新 harness 59 條（null→0 共 34 條），27 條作廢 | §5.7 回歸預期、§0.1 |
| M2 | Q10／Q13 偏離 owner「與邏輯遊戲一致」卻當成預設 | 照建議：開工前必須取得回覆；依賴欄、§2.3、附錄 A 留言草稿 | §1、§2.3、§7.1、§8.1、§9 D13/D14、§10.2、附錄 A |
| M3 | K2-A8 抓不到「打卡加進 userStars」 | 照建議改案例；改壞清單改成 A1、A8 | §5.7 K2-A8、改壞清單 |
| M4 | 容量不足時 `safeSetItem` 會砍學習紀錄、還原也走 `safeSetItem` | 照建議：K4-Y4 但書、還原不經 `safeSetItem`、兩種訊息、A10 預期 | §7.5 第 4 步、§7.7、K4-A10、改壞清單 |
| L1 | 舊困難的比例寫錯 | 改成 60% L ≤ 10、40% 進位（另註明 L = 10 佔 19.9%） | §4.1 |
| L2 | 簡單的答案分布偏小 | (L, t) 從 9 種合法組合均勻抽；實測與「最小選項」比例 | §4.2、§4.3、虛擬碼、K1-A1、改壞清單 |
| L3 | 缺一個開放問題 | 新增 Q3b，已決定不限制 | §4.2、§10.1 |
| L4 | K1-B2 的範圍說法會誤判猜測值 | 照建議，另引 `adjustBalanceGuess` 只夾下限（:6000） | §4.4 |
| L5 | 提示條位置不精確 | 放在 `<header>`（:2566-2600）最後一個子元素 | §8.2 #2 |
| L6 | 解碼沒處理空白、網址的 `+` | 去所有空白；`msave` 先把空白換回 `+` | §7.2、K4b-A10 |
| L7 | 網址組法 | `new URL` 清 `search`／`hash` 再 `set`；註明跟邏輯遊戲的差別 | §8.1、K4b-A7 |
| L8 | 時區突變寫法與案例 | 改壞清單寫成本地午夜 floor；A14 加 `Asia/Taipei`；A2 明定時區 | K4-A2、K4-A14、改壞清單 |
| L9 | 匯入失敗後沒有題目 | 還原後 `switchMode(currentMode)`（不在 picker／護眼鎖） | §7.5 第 4 步 |
| L10 | 匯入成功沒有多分頁警告 | 比照 QM8 :8266；第 5 步改成留在家長頁 | §7.5 第 5 步 |
| L11 | 「AudioContext 已存在再靜音」沒有獨立案例 | 新增 K3-A1b | §6.8 |
| L12 | `t` 與負數星星 | `t` 不是有限整數就忽略；`userStars` 加 `Math.max(0, …)`；A10 加 `'-5'` | §7.2、K4-A9、§5.1、§5.3、§5.5、K2-A10 |
| L13 | 回歸差異種類漏了朗讀時間平移 | 加一類 | §4.7 |
| L14 | 失敗 toast 文字未定 | 寫死「這個進度連結不完整」（注音實查無缺字） | §8.1、§8.5 |
| L15 | 舊版 logic 分頁刪孩子 | 列入已知限制 | §11 |
| L16 | QR 版本偏大 | 改精確值 v12／v16／v19／v26、邏輯遊戲 v13 | §7.3、§8.1、D12、Q14 |

**與稽核建議不同之處**
- L1：建議文字是「60% 的題 L ≤ 10、只有 40% 進位」。核對 `audit48/bal_old.js`：60.1% 包含 L = 10（個位相加剛好湊十，佔 19.9%）；照字面放進表格，另加一句說明「進位」指 L ≥ 11（同加法困難的定義）。
- L7：建議寫「同邏輯遊戲 :4027-4031」。邏輯遊戲（logic_game.html:4027-4031）只有 `new URL(window.location.href)` ＋ `searchParams.set('save', code)`，**沒有**清 `search`／`hash`；計畫照建議的寫法，但把「同邏輯遊戲」改成「同樣用 `new URL`＋`searchParams.set`，多清 `search`／`hash`」。
- L10：成功訊息要讓家長看到，所以 §7.5 第 5 步由 v1 的 `closeModal()` 改成比照 QM8 的 `reopenParentSettings()`（montessori :8263-8266），toast 照樣出。
- Q1 連帶：普通的選項上限 `BALANCE_CAP.normal` 也定為 9（不是 10），讓「畫面上每個數 ≤ 上限」（K1-B2）在普通也成立。若要選項可以出現 10，只改這個常數與 K1-A1 的上限即可，L、t、b 不受影響。

---

## 附錄 A：給 owner 的 Q10／Q13 留言草稿（指揮官給使用者看過再發）

> 數學樂園的「跨裝置同步」有兩件事想請您決定。這兩件決定之前，我們先不做同步這部分；天平、打卡星星、音效開關這幾項修正照常進行。
>
> 先說明為什麼要問：數學樂園匯入進度時，會把這台裝置上這位孩子的**星星、打卡星星、貼紙、小熊衣帽間（買過的衣服和正在穿的）、難度、學習分析、打卡月曆**整份換掉，換掉之後沒辦法復原。邏輯遊戲要換的東西少很多。
>
> **一、同步的按鈕要放在哪裡？**
> - **選項 A：跟邏輯遊戲一樣，放在畫面上方**，孩子自己也按得到。
>   好處：兩個遊戲用法一樣，步驟最少。
>   代價：孩子可能不小心把別人的進度貼進來，把自己的星星、貼紙、小熊衣服蓋掉。
> - **選項 B：放在「家長設定」裡**（要先答對家長算式才進得去），跟現在「把進度移給另一個孩子」放在一起。（我們建議這個）
>   好處：只有大人能換掉進度。
>   代價：每次同步要多算一題家長算式；跟邏輯遊戲不一樣。
>
> **二、用同步連結（或掃 QR code）打開數學樂園時，要不要直接換成連結裡的進度？**
> - **選項 A：跟邏輯遊戲一樣，打開就直接換**（有兩位以上孩子時先問要給誰）。
>   好處：最快，打開就好。
>   代價：連結如果傳在 LINE 群組裡，孩子點到也會直接把現在的進度蓋掉。
> - **選項 B：打開時只出現一行提示「收到進度了！請爸爸媽媽來看看」**，大人進家長設定看過內容（幾顆星、幾件衣服、打卡幾天）按確定才換。（我們建議這個）
>   好處：不會被誤點蓋掉；大人可以先看清楚是哪一份進度。
>   代價：多一步家長算式；跟邏輯遊戲不一樣。
>
> 您之前說過希望跟邏輯遊戲一致，所以兩題的選項 B 都是我們想偏離的地方，理由就是上面說的「會整份蓋掉、不能復原」。兩題可以分開選；如果您覺得一致比較重要，選 A 我們就照邏輯遊戲的做法做。
