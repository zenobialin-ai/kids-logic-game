#!/usr/bin/env node
/*
 * logic_regress.js — 邏輯遊戲（logic_game.html）的行為回歸測試工具
 *
 * 【用途】
 *   證明重構（例如把程式搬到共用的內嵌 script）沒有改變任何遊戲行為。
 *   用固定種子的亂數、假時鐘跑 12 個固定情境，輸出一份 JSON；同一個檔案每次跑出來
 *   必須一字不差。重構前、後各跑一次，diff 兩份 JSON 必須完全相同。
 *   本工具不會被遊戲載入，也不會改動網頁。
 *
 * 【用法】
 *   node tools/regress/logic_regress.js <logic_game.html 的路徑> > out.json
 *   結束代碼：0 = 跑完且沒有 pageerror；1 = 跑完但有 pageerror（數量在 JSON 裡）；2 = 情境失敗
 *
 *   比對 main 與分支（用 git worktree，不動目前的工作目錄）：
 *     git fetch
 *     git worktree add ../klg-main origin/main
 *     node tools/regress/logic_regress.js ../klg-main/logic_game.html > main.json
 *     node tools/regress/logic_regress.js logic_game.html            > branch.json
 *     diff main.json branch.json        （沒有輸出 = 行為相同）
 *     git worktree remove ../klg-main
 *
 * 【環境變數】
 *   PLAYWRIGHT_PATH   playwright 模組的路徑（預設 'playwright'，也就是用 require 找得到的那一份）
 *                     例：PLAYWRIGHT_PATH=C:/Users/me/AppData/Local/npm-cache/_npx/xxxx/node_modules/playwright
 *   PW_CHANNEL        瀏覽器 channel（例：msedge、chrome）；沒裝 Playwright 內建 chromium 時使用
 *   REGRESS_MASK=1    遮掉時間欄位（預設不遮：假時鐘暫停在固定時間，時間戳本身就是固定的，
 *                     不遮才抓得到 offMs／activeMs／計時器長度的改變）
 *   REGRESS_HEADED=1  顯示瀏覽器視窗（除錯用）
 *   需要 Playwright 1.45 以上（用到 page.clock）。
 *
 * 【怎麼做到每次結果都一樣】
 *   - page.addInitScript 把 Math.random 換成 mulberry32（每個情境固定種子）。
 *   - page.clock 安裝假時鐘並暫停在固定時間；setTimeout／setInterval／requestAnimationFrame／
 *     Date／performance.now 全部只在本工具呼叫 clock.runFor() 時才前進（護眼每秒計時、
 *     3 分鐘寬限、齒輪示範、迷宮、水管動畫都用 runFor 快轉）。
 *   - speechSynthesis 換成假的、不發聲：speak 後 setTimeout(0) 觸發 onstart，字數 × 150ms 後觸發 onend；
 *     cancel() 對正在念／排隊的句子觸發 onerror({ error: 'interrupted' })。計時器都走假時鐘，所以事件順序固定。
 *     念過的句子記在輸出的 speech[]（多分頁情境是 { A: [], B: [] }）。
 *     瀏覽器一律加 --mute-audio 啟動，跑測試時不會發出任何聲音。
 *   - 假時鐘裝在 browser context 上，同一情境的所有分頁共用；跨分頁的 storage 事件不受假時鐘控制，
 *     改在 Node 端輪詢等它生效（until）。每個分頁用不同種子，分頁身分 qlogTab 才不會一樣。
 *   - 每個情境用全新的 browser context（localStorage 是空的），時區固定 Asia/Taipei、語系 zh-TW。
 *
 * 【REGRESS_MASK=1 時遮掉的欄位（換成 "<t>"）】
 *   - 學習紀錄 little_logic_qlog_v1__*：records[] 的 tOpen、tShown、tClose、lastWrite、
 *     ev[*][0]、firstAnswer.dt、firstAnswer.off、offMs、activeMs、promptSpeech.dt
 *   - 孩子名單 little_logic_profiles_v1：children[].createdAt
 *   - 進度 little_logic_save_v1*：lastUpdated
 *   - 護眼 little_logic_eyecare_v1：usedMs、day、rev
 *   - little_logic_last_seen_v1 整個值
 *   - 錯題本 little_logic_mistakes_v1*：time
 *   其他所有 localStorage key 都原樣（JSON 會先 parse、key 排序）輸出。
 *
 * 【ID 代號化（一律會做）】
 *   孩子 ID、紀錄 id、round.id、錯題 id／mistakeId、分頁 tab 換成依出現順序編號的代號
 *   （<child#1>、<rec#1>、<round#1>、<mistake#1>、<tab#1>），連 localStorage 的 key 後綴、孩子的 slot 也換；
 *   c0 保留原樣。這樣含 Date.now() 的 ID 不會造成差異，但「哪筆紀錄屬於哪個孩子／哪一題錯題」仍比得到。
 *
 * 【情境】
 *   1 規律題：朗讀中答錯（answeredDuringPrompt）、錯兩次再對、換難度、連對 3 題升級
 *   2 齒輪：提示、看範例、答錯示範後換題、錯題本再挑戰答錯（retryEnded）
 *   3 迷宮（走錯＋走對）、水管即時模式、水管挑戰模式（漏水後接好）
 *   4 錯題本再挑戰；題目中開家長設定 3 秒＋切到背景 2 秒（offMs）
 *   5 第二位孩子：家長算式、新增、切換、答錯一次、看齒輪說明、刪除（錯題本／齒輪說明／紀錄 key 都要刪掉）
 *   6 護眼：鎖住（含 3 分鐘寬限）、家長解鎖
 *   7 沒有孩子名單時從 key 後綴重建名單
 *   8 localStorage 塞滿後改難度 → freeSpaceHook 把學習紀錄減半
 *   9 兩個分頁：A 鎖住 → B 跟著鎖；A 家長解鎖 → B 跟著解鎖
 *   10 A 開題後關掉、快轉 4 分鐘、開 C → A 的紀錄被復原成 unload
 *   11 c0 先拿星星；A 刪掉 B 正在用的孩子 → B 關紀錄、回選單、換回 c0 並重新讀進度
 *   12 4 位孩子、c0 有 35 筆填充過的紀錄 → 答一題後 qlogEvict／qlogBudget 的刪除與 dropped 計數
 *
 * 【家長算式】
 *   只透過畫面操作：從 DOM 讀題目算答案、填 input、按原本 onclick 的按鈕，不呼叫內部函式。
 *   每次打開算式後 harness 會重設亂數種子，所以算式實作用掉幾個亂數不會影響之後的題目與孩子 ID。
 *
 * 【情境 6 的前置資料】
 *   護眼上限只接受 10/15/20/30 分鐘，所以情境 6 先用 addInitScript 寫入
 *   little_logic_eyecare_v1 = { limitMin: 10, usedMs: 10 分鐘 − 5 秒, day: 假時鐘的今天 }，
 *   再從家長設定按一次 10 分鐘，進題目後用假時鐘快轉：提醒 → 時間到 → 3 分鐘寬限 → 鎖住 → 家長解鎖。
 *
 * 【輸出】
 *   { pageErrors: { count, messages }, scenarios: { <名稱>: { steps[], speech[], localStorage{} } } }
 *   steps[] 是每一步之後畫面上看得到的狀態（星星、關卡徽章、難度、目前題型、開著的視窗、toast、
 *   護眼狀態、last_seen…）。超過 1000 字的字串輸出成 <long len=… fnv=…>。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const PW = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const MASK = process.env.REGRESS_MASK === '1';
const T0 = Date.UTC(2026, 0, 15, 1, 0, 0);   // 台北時間 2026-01-15 09:00
const M = '<t>';

// ---------------------------------------------------------------------------
// 頁面注入：固定亂數、假語音
// ---------------------------------------------------------------------------
function initScript(seed) {
  /* eslint-disable no-undef */
  let a = seed >>> 0;
  Math.random = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // 家長算式出題用掉幾個亂數不該影響之後的題目：harness 每次打開算式後重設種子
  window.__regressReseed = function (s) { a = s >>> 0; };
  // 假語音：不發聲。開始念 = setTimeout(0) 後觸發 onstart；念完 = 字數 × 150ms 後觸發 onend；
  // cancel() 對正在念與排隊中的句子觸發 onerror({ error: 'interrupted' })。計時器走頁面的（假時鐘控制）。
  window.__regressSpeech = [];
  let queue = [], cur = null, timer = null;
  const fire = (u, type, extra) => { try { const f = u['on' + type]; if (typeof f === 'function') f.call(u, Object.assign({ type, utterance: u }, extra || {})); } catch (e) {} };
  const next = () => {
    if (cur || !queue.length) return;
    cur = queue.shift();
    fake.speaking = true;
    const u = cur;
    timer = window.setTimeout(() => {
      fire(u, 'start');
      timer = window.setTimeout(() => {
        if (cur !== u) return;
        cur = null; fake.speaking = false; timer = null;
        fire(u, 'end');
        next();
      }, String(u.text || '').length * 150);
    }, 0);
  };
  const fake = {
    speaking: false, pending: false, paused: false, onvoiceschanged: null,
    speak(u) { try { window.__regressSpeech.push(String(u && u.text)); queue.push(u); next(); } catch (e) {} },
    cancel() {
      const all = (cur ? [cur] : []).concat(queue);
      queue = []; cur = null; fake.speaking = false;
      if (timer) { window.clearTimeout(timer); timer = null; }
      all.forEach(u => fire(u, 'error', { error: 'interrupted' }));
    },
    pause() {}, resume() {},
    getVoices() { return []; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }
  };
  try { Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true, writable: true }); } catch (e) {}
  if (typeof window.SpeechSynthesisUtterance !== 'function') {
    window.SpeechSynthesisUtterance = function (text) { this.text = text; };
  }
}

// 情境開始前預先寫入 localStorage（只在第一次載入時寫，之後重新整理不覆蓋）
function seedStorage(items) {
  try {
    if (sessionStorage.getItem('__regressSeeded')) return;
    sessionStorage.setItem('__regressSeeded', '1');
    for (const k of Object.keys(items)) localStorage.setItem(k, items[k]);
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// 遮罩與排序
// ---------------------------------------------------------------------------
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const setIf = (o, k) => { if (isObj(o) && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== null) o[k] = M; };

function maskRecord(r) {
  if (!isObj(r)) return;
  for (const k of ['tOpen', 'tShown', 'tClose', 'lastWrite', 'offMs', 'activeMs']) setIf(r, k);
  if (Array.isArray(r.ev)) r.ev.forEach(e => { if (Array.isArray(e) && e.length) e[0] = M; });
  if (isObj(r.firstAnswer)) { setIf(r.firstAnswer, 'dt'); setIf(r.firstAnswer, 'off'); }
  if (isObj(r.promptSpeech)) setIf(r.promptSpeech, 'dt');
}

function maskStorage(key, val) {
  if (!MASK) return val;
  if (key === 'little_logic_last_seen_v1') return M;
  if (key.startsWith('little_logic_qlog_v1__') && isObj(val) && Array.isArray(val.records)) val.records.forEach(maskRecord);
  if (key === 'little_logic_profiles_v1' && isObj(val) && Array.isArray(val.children)) val.children.forEach(c => setIf(c, 'createdAt'));
  if (key.startsWith('little_logic_save_v1') && isObj(val)) setIf(val, 'lastUpdated');
  if (key === 'little_logic_eyecare_v1' && isObj(val)) ['usedMs', 'day', 'rev'].forEach(k => setIf(val, k));
  if (key.startsWith('little_logic_mistakes_v1') && Array.isArray(val)) {
    val.forEach(m => { if (isObj(m)) setIf(m, 'time'); });
  }
  return val;
}

// 所有 ID（孩子、紀錄、輪次、錯題、分頁）換成依出現順序編號的代號，例如 <child#1>、<rec#3>。
// 這些 ID 有的含 Date.now()、有的來自 Math.random；換成代號後仍保留「誰參照誰」的關係。
function canonicalizeIds(sc) {
  const kind = new Map();   // 原始 ID → 類別
  const reg = (id, k) => { if (typeof id === 'string' && id && id !== 'c0' && !kind.has(id)) kind.set(id, k); };
  const ls = sc.localStorage || {};
  for (const key of Object.keys(ls).sort()) {
    const v = ls[key];
    const m = /^little_logic_[a-z_]+_v1__(.+)$/.exec(key);
    if (m) reg(m[1], 'child');
    if (key === 'little_logic_profiles_v1' && isObj(v)) {
      (v.children || []).forEach(c => isObj(c) && reg(c.id, 'child'));
      reg(v.active, 'child');
    }
    if (key.startsWith('little_logic_qlog_v1__') && isObj(v)) {
      reg(v.childId, 'child');
      (v.records || []).forEach(r => {
        if (!isObj(r)) return;
        reg(r.childId, 'child'); reg(r.tab, 'tab'); reg(r.id, 'rec'); reg(r.mistakeId, 'mistake');
        if (isObj(r.round)) reg(r.round.id, 'round');
      });
    }
    if (key.startsWith('little_logic_mistakes_v1') && Array.isArray(v)) v.forEach(x => isObj(x) && reg(x.id, 'mistake'));
  }
  (sc.steps || []).forEach(st => st && st.globals && reg(st.globals.activeChildId, 'child'));
  const tok = new Map(), count = {};
  const t = id => {
    if (!tok.has(id)) { const k = kind.get(id); count[k] = (count[k] || 0) + 1; tok.set(id, `<${k}#${count[k]}>`); }
    return tok.get(id);
  };
  const walk = v => {
    if (typeof v === 'string') {
      if (v.length > 1000) return `<long len=${v.length} fnv=${fnv1a(v).toString(36)}>`;   // 情境 12 的填充字串
      if (kind.has(v)) return t(v);
      const m = /^__(.+)$/.exec(v);   // 孩子的 slot 欄位：'__' + ID
      return m && kind.has(m[1]) ? '__' + t(m[1]) : v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (isObj(v)) {
      const out = {};
      for (const k of Object.keys(v).sort()) {
        const m = /^(.*__)(.+)$/.exec(k);
        const nk = m && kind.has(m[2]) ? m[1] + t(m[2]) : k;
        out[nk] = walk(v[k]);
      }
      return out;
    }
    return v;
  };
  return walk(sc);
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObj(v)) {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

// ---------------------------------------------------------------------------
// 跟頁面互動的小工具
// ---------------------------------------------------------------------------
// 在 Node 端輪詢（用真的計時器），給跨分頁 storage 事件這種不受假時鐘控制的東西用
async function until(page, fn, arg, what) {
  for (let i = 0; i < 200; i++) {
    if (await page.evaluate(fn, arg)) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('timeout waiting for ' + (what || fn.toString().slice(0, 80)));
}

function makeCtx(page, name, steps, prefix, clock) {
  steps = steps || [];
  prefix = prefix || '';
  const tick = ms => (clock || page.clock).runFor(ms);
  let gateOpens = 0;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const q = () => ev(() => JSON.parse(JSON.stringify(currentQuestion)));   // eslint-disable-line no-undef
  const click = async (sel, idx) => {
    const loc = idx === undefined ? page.locator(sel) : page.locator(sel).nth(idx);
    await loc.click({ timeout: 10000 });
    // 打開家長算式（設定或護眼解鎖）後重設亂數種子：之後的出題、孩子 ID 不受算式實作用掉幾個亂數影響。
    // 算式只透過畫面操作：從 DOM 讀題目、填 input、按原本的按鈕。
    if (/openParentSettings\(\)|eye-parent-link/.test(sel)) {
      gateOpens++;
      await page.evaluate(n => { if (window.__regressReseed) window.__regressReseed(0x5EED0000 + n * 7919); }, gateOpens);
    }
  };
  const waitActive = (id, on = true) => page.waitForFunction(([i, o]) => {
    const el = document.getElementById(i);
    return !!el && el.classList.contains('active') === o;
  }, [id, on], { timeout: 10000, polling: 50 });

  async function snap(label) {
    const s = await ev(() => {
      const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
      const view = document.querySelector('.game-view.active');
      const toast = document.getElementById('toastBox');
      const g = {};
      try { g.currentModule = currentModule; } catch (e) { g.currentModule = '<n/a>'; }          // eslint-disable-line no-undef
      try { g.currentLevel = currentLevel; } catch (e) { g.currentLevel = '<n/a>'; }             // eslint-disable-line no-undef
      try { g.activeDifficulty = getActiveDifficulty(); } catch (e) { g.activeDifficulty = '<n/a>'; } // eslint-disable-line no-undef
      try { g.activeChildId = activeChildId; } catch (e) { g.activeChildId = '<n/a>'; }          // eslint-disable-line no-undef
      const row = document.getElementById('childAvatarRow');
      let eyeStore = null;
      try { eyeStore = JSON.parse(localStorage.getItem('little_logic_eyecare_v1')); } catch (e) {}
      const picker = document.getElementById('childPickerModal');
      return {
        lastSeen: localStorage.getItem('little_logic_last_seen_v1'),
        eyeStore,
        pickerList: picker && picker.classList.contains('active') ? Array.from(document.querySelectorAll('#childPickerList .child-pick-btn')).map(txt) : null,
        stars: txt(document.getElementById('starCount')),
        view: view ? view.id : 'menu',
        levelBadge: view ? txt(view.querySelector('.level-badge')) : null,
        parentDifficulty: (document.querySelector('.diff-btn.active') || {}).dataset ? document.querySelector('.diff-btn.active').dataset.diff : null,
        adaptiveBtn: txt(document.getElementById('adaptiveBtn')),
        mistakeCount: txt(document.getElementById('mistakeCount')),
        openModals: Array.from(document.querySelectorAll('.modal-overlay.active')).map(m => m.id),
        modalTitle: document.getElementById('victoryModal').classList.contains('active') ? txt(document.getElementById('modalTitle')) : null,
        modalMsg: document.getElementById('victoryModal').classList.contains('active') ? txt(document.getElementById('modalMsg')) : null,
        eyeLocked: document.getElementById('eyeLock').classList.contains('active'),
        toast: toast && toast.classList.contains('show') ? txt(toast) : null,
        child: row && row.style.display !== 'none' ? txt(row) : null,
        menuBadges: Array.from(document.querySelectorAll('[id^="badge-"]')).map(b => b.id + '=' + txt(b)).join(' | '),
        globals: g
      };
    });
    if (s.eyeStore) s.eyeStore = maskStorage('little_logic_eyecare_v1', s.eyeStore);
    if (s.lastSeen !== null) s.lastSeen = maskStorage('little_logic_last_seen_v1', s.lastSeen);
    steps.push(Object.assign({ step: prefix + label }, s));
  }

  async function home() { await click('header .home-btn'); }
  async function nextModal() { await waitActive('victoryModal'); await click('#victoryModal .modal-btn'); }

  async function parentGate(prefix, wrongFirst) {
    const qs = await page.locator('#' + prefix + 'Q').textContent();
    const m = /(\d+)\s*\+\s*(\d+)/.exec(qs);
    if (!m) throw new Error('parent gate question not found: ' + qs);
    const ans = Number(m[1]) + Number(m[2]);
    if (wrongFirst) {
      await page.locator('#' + prefix + 'Input').fill(String(ans + 1));
      await click(`button[onclick="checkParentAnswer('${prefix}')"]`);
      await snap(prefix + ' wrong answer');
    }
    await page.locator('#' + prefix + 'Input').fill(String(ans));
    await click(`button[onclick="checkParentAnswer('${prefix}')"]`);
  }
  async function openParent(wrongFirst) {
    await click('header button[onclick="openParentSettings()"]');
    await waitActive('parentModal');
    await parentGate('parentGate', wrongFirst);
    await page.locator('#parentSettingsBox').waitFor({ state: 'visible', timeout: 10000 });
  }
  async function closeParent() { await click('#parentModal button[onclick="closeParentSettings()"]'); await waitActive('parentModal', false); }

  // 規律題：選第 n 個錯的選項／選正確選項
  async function patternWrong(n) {
    const d = await q();
    const wrong = d.options.map((o, i) => [o, i]).filter(([o]) => o !== d.answer);
    await click('#patternOptions button', wrong[n % wrong.length][1]);
  }
  async function patternRight() {
    const d = await q();
    await click('#patternOptions button', d.options.indexOf(d.answer));
    await waitActive('victoryModal');
  }

  // 模擬切到背景 ms 毫秒再回來（visibilityState 改寫 + visibilitychange 事件）
  async function background(ms) {
    const setVis = v => ev(st => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => st });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => st === 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    }, v);
    await setVis('hidden');
    await snap('hidden');
    await tick(ms);
    await setVis('visible');
  }

  return { page, name, steps, tick, ev, q, click, background, until: (fn, arg, what) => until(page, fn, arg, what), waitActive, snap, home, nextModal, openParent, closeParent, parentGate, patternWrong, patternRight };
}

// 迷宮：BFS 找最短路線（只用來決定要按哪些方向鍵）
function mazePath(m) {
  const dirs = [['up', -1, 0], ['down', 1, 0], ['left', 0, -1], ['right', 0, 1]];
  const key = (r, c) => r + ',' + c;
  const blocked = (r, c) => r < 0 || c < 0 || r >= m.size || c >= m.size || m.obstacles.some(o => o.r === r && o.c === c);
  const prev = new Map([[key(m.start.r, m.start.c), null]]);
  const queue = [[m.start.r, m.start.c]];
  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === m.goal.r && c === m.goal.c) break;
    for (const [name, dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (blocked(nr, nc) || prev.has(key(nr, nc))) continue;
      prev.set(key(nr, nc), { from: key(r, c), name });
      queue.push([nr, nc]);
    }
  }
  const cmds = [];
  let k = key(m.goal.r, m.goal.c);
  while (prev.get(k)) { cmds.unshift(prev.get(k).name); k = prev.get(k).from; }
  return cmds;
}

// 水管：跟遊戲 solvePipes 同樣的搜尋，但回傳每一格要點幾下
function pipePlan(q) {
  const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
  const SHAPES = { I: [0, 2], L: [0, 1] };
  const open = (t, rot) => SHAPES[t].map(d => (d + rot) % 4);
  let best = null;
  const used = new Set();
  const walk = (r, c, from, clicks, plan) => {
    if (best && clicks >= best.clicks) return;
    if (c === q.size) { if (r === q.dst) best = { clicks, plan: plan.slice() }; return; }
    if (r < 0 || c < 0 || r >= q.size || used.has(r * q.size + c)) return;
    const tile = q.tiles[r][c];
    if (!tile) return;
    used.add(r * q.size + c);
    for (let k = 0; k < (tile.t === 'I' ? 2 : 4); k++) {
      const o = open(tile.t, (tile.rot + k) % 4);
      if (!o.includes(from)) continue;
      const out = o.find(d => d !== from);
      plan.push({ r, c, k });
      walk(r + DIRS[out][0], c + DIRS[out][1], (out + 2) % 4, clicks + k, plan);
      plan.pop();
    }
    used.delete(r * q.size + c);
  };
  walk(q.src, 0, 3, 0, []);
  return best;
}

async function solvePipesUI(x, live) {
  const d = await x.q();
  const plan = pipePlan(d);
  if (!plan) throw new Error('pipes: no solution');
  for (const { r, c, k } of plan.plan) {
    for (let i = 0; i < k; i++) {
      if (live && await x.ev(() => document.getElementById('pipeTarget').classList.contains('wet'))) return;
      await x.click(`#pipe-${r}-${c}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 情境
// ---------------------------------------------------------------------------
const SCENARIOS = [
  {
    name: '1_pattern_adaptive', seed: 101,
    async run(x) {
      await x.snap('start');
      await x.click('.menu-card.card-pattern');
      await x.snap('pattern Q1 open');
      await x.tick(100);   // 題目開始朗讀（假語音 onstart）；接著在念完前作答 → answeredDuringPrompt
      await x.snap('prompt being read');
      await x.patternWrong(0);
      await x.snap('Q1 wrong #1');
      await x.patternWrong(1);
      await x.snap('Q1 wrong #2');
      await x.patternRight();
      await x.snap('Q1 right');
      await x.nextModal();
      await x.snap('Q2 open');
      await x.home();
      await x.snap('home (Q2 abandoned)');
      await x.click('.diff-btn[data-diff="easy"]');
      await x.snap('difficulty -> easy');
      await x.click('.menu-card.card-pattern');
      for (let i = 1; i <= 4; i++) {
        await x.snap(`easy round Q${i} open`);
        await x.patternRight();
        await x.snap(`easy round Q${i} right`);
        await x.nextModal();
      }
      await x.snap('easy round Q5 open');
      await x.home();
      await x.snap('home');
    }
  },
  {
    name: '2_gears_hint_demo_retry', seed: 205,
    async run(x) {
      await x.click('.menu-card.card-gears');
      await x.waitActive('gearIntroModal');
      await x.snap('gears intro');
      await x.click('#gearIntroModal .modal-btn');
      await x.tick(500);
      await x.snap('gears Q1 open');
      const d1 = await x.q();
      if (await x.page.locator('#gearHintBtn').isEnabled() && await x.page.locator('#gearHintBtn').isVisible()) {
        await x.click('#gearHintBtn');
        await x.snap('hint used');
      } else {
        await x.snap('hint not available');
      }
      await x.click('.gear-help-btn[onclick="openGearIntro(true)"]');
      await x.waitActive('gearIntroModal');
      await x.snap('example open');
      await x.click('#gearIntroModal .modal-btn');
      await x.waitActive('gearIntroModal', false);
      await x.click(`.gear-dir-btn[onclick="checkGearAnswer('${d1.answer === 'cw' ? 'ccw' : 'cw'}')"]`);
      await x.snap('Q1 wrong (demo running)');
      await x.tick(700 * (d1.gears.length + 3));
      await x.snap('demo done -> replaced');
      const d2 = await x.q();
      await x.click(`.gear-dir-btn[onclick="checkGearAnswer('${d2.answer}')"]`);
      await x.snap('Q2 right (demo running)');
      await x.tick(700 * (d2.gears.length + 3));
      await x.waitActive('victoryModal');
      await x.snap('Q2 victory');
      await x.nextModal();
      await x.tick(200);
      await x.snap('Q3 open');
      await x.home();
      await x.click('button.mistake-btn');
      await x.waitActive('mistakeModal');
      await x.snap('mistake book');
      await x.click('#mistakeList .mistake-retry', 0);
      await x.tick(200);
      await x.snap('retry open');
      const d3 = await x.q();
      await x.click(`.gear-dir-btn[onclick="checkGearAnswer('${d3.answer === 'cw' ? 'ccw' : 'cw'}')"]`);
      await x.snap('retry wrong (demo running)');
      await x.tick(700 * (d3.gears.length + 3));
      await x.waitActive('mistakeModal');
      await x.snap('retryEnded -> mistake book');
      await x.click('#mistakeModal button[onclick="closeMistakeBook()"]');
      await x.snap('end');
    }
  },
  {
    name: '3_maze_pipes', seed: 303,
    async run(x) {
      // 迷宮：先走錯（少走最後一步），再清空走對
      await x.click('.menu-card.card-maze');
      await x.snap('maze open');
      const m = await x.q();
      const cmds = mazePath(m);
      const wrong = cmds.length >= 2 ? cmds.slice(0, -1) : [cmds[0] === 'up' ? 'down' : 'up'];
      for (const c of wrong) await x.click(`.cmd-add-btn[onclick="addCommand('${c}')"]`);
      await x.click('#btnRunCode');
      await x.tick(450 * (wrong.length + 2));
      await x.page.locator('#btnRunCode:not([disabled])').waitFor({ timeout: 10000 });
      await x.snap('maze wrong run');
      await x.click('button.btn-clear[onclick="clearCommands()"]');
      for (const c of cmds) await x.click(`.cmd-add-btn[onclick="addCommand('${c}')"]`);
      await x.click('#btnRunCode');
      await x.tick(450 * (cmds.length + 2));
      await x.waitActive('victoryModal');
      await x.snap('maze correct run');
      await x.nextModal();
      await x.home();
      // 水管即時模式（普通）
      await x.click('.menu-card.card-pipes');
      await x.snap('pipes live open');
      await solvePipesUI(x, true);
      await x.tick(1000);
      await x.waitActive('victoryModal');
      await x.snap('pipes live solved');
      await x.nextModal();
      await x.home();
      // 水管挑戰模式：先漏水，再接好
      await x.click('.diff-btn[data-diff="hard"]');
      await x.click('.menu-card.card-pipes');
      await x.snap('pipes hard open');
      const p = await x.q();
      await x.click('#btnPipeRun');
      await x.tick(220 * (p.size * p.size + 3));
      await x.page.locator('#btnPipeRun:not([disabled])').waitFor({ timeout: 10000 });
      await x.snap('pipes hard leak');
      await x.click('button.btn-clear[onclick="resetPipes()"]');
      await solvePipesUI(x, false);
      await x.click('#btnPipeRun');
      await x.tick(220 * (p.size * p.size + 3) + 1000);
      await x.waitActive('victoryModal');
      await x.snap('pipes hard solved');
      await x.nextModal();
      await x.home();
      await x.snap('end');
    }
  },
  {
    name: '4_mistake_retry', seed: 404,
    async run(x) {
      await x.click('.menu-card.card-pattern');
      await x.snap('pattern open');
      // 題目中打開家長設定 3 秒（不算時間），再切到背景 2 秒（offMs 應累計 5 秒）
      await x.click('header button[onclick="openParentSettings()"]');
      await x.waitActive('parentModal');
      await x.tick(3000);
      await x.snap('parent modal open 3s');
      await x.closeParent();
      await x.tick(1000);
      await x.background(2000);
      await x.snap('back from background 2s');
      await x.tick(1000);
      await x.patternWrong(0);
      await x.snap('pattern wrong once');
      await x.home();
      await x.click('button.mistake-btn');
      await x.waitActive('mistakeModal');
      await x.snap('mistake book');
      await x.click('#mistakeList .mistake-retry', 0);
      await x.snap('retry open');
      await x.patternRight();
      await x.snap('retry right');
      await x.nextModal();
      await x.waitActive('mistakeModal');
      await x.snap('back to mistake book');
      await x.click('#mistakeModal button[onclick="closeMistakeBook()"]');
      await x.snap('end');
    }
  },
  {
    name: '5_second_child', seed: 505,
    async run(x) {
      await x.openParent(true);
      await x.snap('parent settings');
      await x.click('#parentSettingsBox button[onclick="addChild()"]');
      await x.snap('child added');
      await x.closeParent();
      await x.click('#childAvatarBtn');
      await x.waitActive('childPickerModal');
      await x.snap('picker');
      await x.click('#childPickerList .child-pick-btn', 1);
      await x.snap('switched to child 2');
      await x.click('.menu-card.card-pattern');
      await x.patternWrong(0);
      await x.snap('child 2 wrong');
      await x.patternRight();
      await x.snap('child 2 right');
      await x.nextModal();
      await x.home();
      await x.click('.menu-card.card-gears');
      await x.waitActive('gearIntroModal');
      await x.click('#gearIntroModal .modal-btn');
      await x.snap('child 2 gears intro seen');
      await x.home();
      await x.snap('child 2 keys before delete');
      await x.click('#childAvatarBtn');
      await x.waitActive('childPickerModal');
      await x.click('#childPickerList .child-pick-btn', 0);
      await x.snap('switched back to c0');
      await x.openParent(false);
      await x.click('#childRows .child-row >> nth=1 >> button >> nth=-1');
      await x.snap('child 2 deleted');
      await x.closeParent();
      await x.snap('end');
    }
  },
  {
    name: '6_eyecare_lock', seed: 606,
    // 護眼上限只接受 10/15/20/30 分鐘：直接把今天已用時間設成「上限 − 5 秒」，再用假時鐘快轉
    storage: { little_logic_eyecare_v1: JSON.stringify({ enabled: true, limitMin: 10, usedMs: 10 * 60000 - 5000, day: '2026-1-15', locked: false, rev: 0 }) },
    async run(x) {
      await x.openParent(false);
      await x.click('#parentSettingsBox .eye-limit-btn[data-min="10"]');
      await x.snap('limit 10 min');
      await x.closeParent();
      await x.click('.menu-card.card-pattern');
      await x.snap('pattern open');
      for (const [ms, label] of [[2000, '+2s (1-min warning)'], [4000, '+6s (time up, grace starts)'],
        [170000, 'grace +170s (not locked yet)'], [12000, 'grace +182s (locked)']]) {
        await x.tick(ms);
        await x.snap(label);
      }
      await x.waitActive('eyeLock');
      await x.tick(65000);
      await x.snap('exercises done');
      await x.click('#eyeLock .eye-parent-link');
      await x.page.locator('#eyeUnlockBox').waitFor({ state: 'visible', timeout: 10000 });
      await x.parentGate('eyeGate', true);
      await x.waitActive('eyeLock', false);
      await x.snap('unlocked');
      await x.click('.menu-card.card-pattern');
      await x.patternRight();
      await x.snap('play after unlock');
      await x.nextModal();
      await x.home();
      await x.snap('end');
    }
  },
  {
    name: '7_profiles_rebuild', seed: 707,
    // 沒有孩子名單、只有別的孩子的進度與紀錄 key：載入時要從 key 後綴重建名單
    storage: {
      little_logic_save_v1__kidx1: JSON.stringify({ stars: 7, completed: { pattern: 2 }, lastUpdated: T0 - 86400000 }),
      little_logic_qlog_v1__kidy2: JSON.stringify({ v: 1, childId: 'kidy2', records: [], dropped: {}, skipped: 0 })
    },
    async run(x) {
      await x.snap('loaded (rebuilt list)');
      await x.click('#childAvatarBtn');
      await x.waitActive('childPickerModal');
      await x.snap('picker');
      await x.click('#childPickerList .child-pick-btn', 1);
      await x.snap('switched to rebuilt child');
    }
  },
  {
    name: '8_quota_freespace', seed: 808,
    async run(x) {
      await x.click('.menu-card.card-pattern');
      for (let i = 1; i <= 4; i++) { await x.patternRight(); await x.nextModal(); }
      await x.home();
      const count = () => x.ev(() => { try { return JSON.parse(localStorage.getItem('little_logic_qlog_v1__c0')).records.length; } catch (e) { return -1; } });
      const before = await count();
      // 用一個垃圾 key 把 localStorage 塞到剩不到 1 個字元
      const filled = await x.ev(() => {
        const K = '__regress_junk';
        const ok = n => { try { localStorage.setItem(K, 'x'.repeat(n)); return true; } catch (e) { return false; } };
        let lo = 0, hi = 1 << 16;
        while (ok(hi)) { lo = hi; hi *= 2; if (hi > 1 << 26) return false; }
        while (hi - lo > 1) { const mid = (lo + hi) >>> 1; if (ok(mid)) lo = mid; else hi = mid; }
        return ok(lo);
      });
      if (!filled) throw new Error('could not fill localStorage to quota');
      await x.snap('storage full');
      // 改難度 → 進度變大寫不進去 → freeSpaceHook 把學習紀錄減半 → 再寫一次
      await x.click('.diff-btn[data-diff="easy"]');
      await x.snap('difficulty -> easy while full');
      x.steps.push({ step: 'qlog record count', before, after: await count() });
    }
  },
  {
    name: '9_tabs_eye_lock_unlock', seed: 909, tabs: true,
    storage: { little_logic_eyecare_v1: JSON.stringify({ enabled: true, limitMin: 10, usedMs: 10 * 60000 - 5000, day: '2026-1-15', locked: false, rev: 0 }) },
    async run(a, env) {
      const b = await env.openTab('B');
      await a.click('.menu-card.card-pattern');
      await a.tick(6000);
      await a.tick(178000);
      await a.snap('grace +178s (not locked yet)');
      await a.tick(3000);
      await a.waitActive('eyeLock');
      await a.snap('A locked');
      await b.until(() => document.getElementById('eyeLock').classList.contains('active'), null, 'B locked');
      await b.snap('B locked via storage event');
      await a.click('#eyeLock .eye-parent-link');
      await a.page.locator('#eyeUnlockBox').waitFor({ state: 'visible', timeout: 10000 });
      await a.parentGate('eyeGate', false);
      await a.waitActive('eyeLock', false);
      await a.snap('A unlocked by parent');
      await b.until(() => !document.getElementById('eyeLock').classList.contains('active'), null, 'B unlocked');
      await b.snap('B unlocked via storage event');
    }
  },
  {
    name: '10_tabs_recover_unload', seed: 1010, tabs: true,
    async run(a, env) {
      const b = await env.openTab('B');
      await a.click('.menu-card.card-pattern');
      await a.snap('A question open');
      await env.closeTab(a);
      await b.tick(4 * 60000);
      const c = await env.openTab('C');
      await c.snap('C loaded (recovered A record)');
    }
  },
  {
    name: '11_tabs_delete_active_child', seed: 1111, tabs: true,
    async run(a, env) {
      await a.click('.menu-card.card-pattern');   // c0 先拿到星星：B 換回 c0 時一定要重新讀進度
      await a.patternRight();
      await a.nextModal();
      await a.home();
      await a.snap('A c0 earned stars');
      await a.openParent(false);
      await a.click('#parentSettingsBox button[onclick="addChild()"]');
      await a.closeParent();
      const b = await env.openTab('B');
      await b.click('#childAvatarBtn');
      await b.waitActive('childPickerModal');
      await b.click('#childPickerList .child-pick-btn', 1);
      await b.click('.menu-card.card-pattern');
      await b.snap('B child 2 question open');
      await a.openParent(false);
      await a.click('#childRows .child-row >> nth=1 >> button >> nth=-1');
      await a.snap('A deleted child 2');
      await b.until(() => !document.querySelector('.game-view.active'), null, 'B back to menu');
      await b.snap('B switched after deletion');
      await a.closeParent();
    }
  },
  {
    name: '12_qlog_evict_budget', seed: 1212,
    // 4 位孩子 → 每位額度 min(400000, 1000000/4) = 250000 字元；c0 有 35 筆 pattern 紀錄（每組上限 30），
    // 填充到約 19 萬字元：答一題後 qlogEvict 要刪掉最舊的 6 筆、dropped.pattern = 6，總大小仍在額度內
    storage: (() => {
      const kids = [['c0', '🐰'], ['k1', '🐶'], ['k2', '🐱'], ['k3', '🐻']].map(([id, emoji]) =>
        ({ id, emoji, name: '', slot: id === 'c0' ? '' : '__' + id, createdAt: T0 - 864e5 }));
      const records = Array.from({ length: 35 }, (_, i) => {
        const t = T0 - 864e5 + i * 60000;
        return {
          v: 1, id: 'seedrec' + i, build: 2, tab: 'seedtab', lastWrite: t + 5000, childId: 'c0', module: 'pattern', sub: 'pattern',
          difficulty: 'normal', parentDifficulty: 'normal', adaptive: true, source: 'first', variantOf: null, mistakeId: null,
          round: { id: 'seedround', level: i % 5 }, qk: 'seedqk' + i, summary: 'pad' + i + ':' + 'x'.repeat(6000),
          form: null, nOptions: 4, p: 0.25, live: null, minActions: null, speech: null, soundOn: true,
          tOpen: t, tShown: t, tClose: t + 5000, outcome: 'correct', recovered: false, ev: [[5000, 'c', null]], evTruncated: false,
          firstAnswer: { ok: true, dt: 5000, off: 0 }, wrongCount: 0, wrongDupCount: 0, wrongCountGame: 0, gameReasons: null,
          tapCount: 1, keyTapCount: 0, pointerDownCount: 1, offMs: 0, activeMs: 5000
        };
      });
      return {
        little_logic_profiles_v1: JSON.stringify({ v: 1, active: 'c0', askOnOpen: false, children: kids }),
        little_logic_qlog_v1__c0: JSON.stringify({ v: 1, childId: 'c0', records, dropped: {}, skipped: 0 })
      };
    })(),
    async run(x) {
      const stat = label => x.ev(() => {
        const raw = localStorage.getItem('little_logic_qlog_v1__c0') || '';
        let st = null; try { st = JSON.parse(raw); } catch (e) {}
        return { size: raw.length, records: st ? st.records.length : -1, dropped: st ? st.dropped : null, skipped: st ? st.skipped : null };
      }).then(r => x.steps.push(Object.assign({ step: 'qlog store: ' + label }, r)));
      await stat('seeded');
      await x.click('.menu-card.card-pattern');
      await stat('question opened');
      await x.patternRight();
      await stat('answered');
      await x.nextModal();
      await x.home();
      await stat('home');
    }
  }
];

// ---------------------------------------------------------------------------
async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    process.stderr.write('usage: node tools/regress/logic_regress.js <path-to-logic_game.html> > out.json\n');
    process.exit(2);
  }
  const url = pathToFileURL(path.resolve(file)).href;
  const browser = await PW.chromium.launch({ channel: process.env.PW_CHANNEL || undefined, args: ['--mute-audio'], headless: process.env.REGRESS_HEADED !== '1' });
  const out = { pageErrors: { count: 0, messages: [] }, scenarios: {} };
  let failed = false;
  try {
    for (const sc of SCENARIOS) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei', reducedMotion: 'reduce' });
      await context.clock.install({ time: T0 });
      await context.clock.pauseAt(T0 + 1000);
      const steps = [];
      const speech = {};
      const tabs = [];
      // 每個分頁用不同種子（分頁身分 qlogTab 才不會一樣）；預設資料只在第一個分頁寫入
      const openTab = async label => {
        const page = await context.newPage();
        page.on('pageerror', e => { out.pageErrors.count++; out.pageErrors.messages.push(sc.name + '/' + label + ': ' + String(e && e.message)); });
        page.on('dialog', d => d.accept());
        await page.addInitScript(initScript, sc.seed + 7919 * tabs.length);
        if (sc.storage && !tabs.length) await page.addInitScript(seedStorage, sc.storage);
        await page.goto(url);
        await page.locator('#starCount').waitFor({ timeout: 10000 });
        const x = makeCtx(page, sc.name, steps, sc.tabs ? '[' + label + '] ' : '', context.clock);
        x.label = label;
        tabs.push(x);
        return x;
      };
      const grabSpeech = async x => { speech[x.label] = await x.page.evaluate(() => window.__regressSpeech || []); };
      const closeTab = async x => { await grabSpeech(x); await x.page.close(); x.closed = true; };
      const res = { steps };
      try {
        const first = await openTab('A');
        await sc.run(first, { openTab, closeTab });
      } catch (e) {
        failed = true;
        res.error = String(e && e.message).split('\n')[0];
        process.stderr.write(`[${sc.name}] FAILED: ${e && e.stack}\n`);
      }
      const live = tabs.filter(t => !t.closed);
      for (const t of live) await grabSpeech(t);
      res.speech = sc.tabs ? speech : (speech.A || []);
      const raw = live.length ? await live[0].page.evaluate(() => {
        const o = {};
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
        return o;
      }) : {};
      const ls = {};
      for (const k of Object.keys(raw)) {
        if (k.startsWith('__regress')) { ls[k] = '<junk>'; continue; }   // 情境 8 的垃圾 key：內容不輸出
        let v = raw[k];
        try { v = JSON.parse(v); } catch (e) {}
        ls[k] = maskStorage(k, v);
      }
      res.localStorage = ls;
      out.scenarios[sc.name] = canonicalizeIds(res);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify(sortKeys(out), null, 2) + '\n');
  process.exit(failed ? 2 : (out.pageErrors.count ? 1 : 0));
}

main().catch(e => { process.stderr.write(String(e && e.stack) + '\n'); process.exit(2); });
