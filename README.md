# 🎓 幼小銜接學習樂園 (Kids Learning Quest)

專為 5~7 歲學齡前幼兒與國小低年級學童量身打造的跨裝置互動學習網頁套件。零依賴、純 HTML5 / CSS3 / Web Audio API / Web Speech API，100% 離線可用！

---

## 🎮 包含的遊戲專案

### 1. 🚀 小小邏輯探險家 (`logic_game.html`)
- **升小一邏輯奠基**：
  - 🔮 規律魔法陣（序列辨識與週期預測）
  - ⚖️ 神奇智慧天平（等量代換與數學直覺）
  - 🧱 立體透視積木（3D 等角投影空間堆疊與隱藏底層方塊）
  - 🤖 小機器人尋寶（幼兒程式思維與方向指令卡）
  - 🏡 動物好友排排坐（演繹排除與邏輯座次排列）
- **國小資優鑑定特訓題型**：
  - 🪞 摺紙打孔透視（心智旋轉與空間摺疊鏡像）
  - ⚙️ 齒輪連動旋轉（機械咬合因果即時動態模擬）
  - 🔲 瑞文氏九宮矩陣（Raven's 抽象非語言雙維度矩陣推理）
- **亮點功能**：
  - 🔊 全程中文語音題目朗讀
  - 🔤 全部中文字自動加上國語課本式注音（字的右邊直排，含破音字判讀）
  - 📲 跨裝置進度同步（支援 URL 傳遞、QR Code 換機掃描、LocalStorage 自動保存）

### 2. 🌱 蒙特梭利數學樂園 (`montessori_math_game.html`)
- 實體教具數位化：數棒、彩色串珠、十進位金黃色珠、賽根板。
- 溫潤木質教具觸感，幫助孩子建立對數量大小、進位與幾何空間的真實概念。

---

## 🚀 如何在 GitHub Pages 上免費發布？

1. **建立倉庫**：在 GitHub 建立一個公開倉庫（如 `kids-logic-game`）。
2. **上傳本資料夾所有檔案**：
   - `index.html`（學習門戶首頁）
   - `logic_game.html`（小小邏輯探險家主程式）
   - `montessori_math_game.html`（蒙特梭利數學樂園主程式）
   - `.nojekyll`
   - `README.md`
3. **開啟 GitHub Pages**：
   - 點擊倉庫頂部的 **Settings** ➔ 側邊欄點選 **Pages**。
   - 在 **Build and deployment** 下方：
     - Source 選擇：`Deploy from a branch`
     - Branch 選擇：`main`（或 `master`），資料夾選擇 `/ (root)`。
     - 點擊 **Save**。
4. **取得公開專屬網址**：
   - 等候約 30 秒至 1 分鐘重新整理，即可取得：
     `https://<你的GitHub帳號>.github.io/<倉庫名稱>/`
   - 直接傳給親友、iPad 或手機，點開即可暢玩！

---

## 🔤 注音怎麼來的？

`logic_game.html` 與 `index.html` 的注音由 `tools/build_zhuyin.py` 產生並直接嵌進網頁（仍然是單一檔案、可離線）。
讀音以教育部《重編國語辭典修訂本》為準。新增或修改畫面上的中文後，請重新產生：

```bash
pip install pypinyin
git clone --depth 1 https://github.com/g0v/moedict-data.git /tmp/moedict-data
xz -dk /tmp/moedict-data/dict-revised.json.xz
python3 tools/build_zhuyin.py /tmp/moedict-data/dict-revised.json
```

讀錯的字或詞請加到 `tools/build_zhuyin.py` 的 `MANUAL`。
