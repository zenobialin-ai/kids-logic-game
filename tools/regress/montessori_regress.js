#!/usr/bin/env node
/*
 * montessori_regress.js — 數學樂園（montessori_math_game.html）的行為回歸測試工具
 *
 * 【用途】
 *   證明之後的改動（每位孩子一份 key、孩子選單、護眼、學習紀錄…）沒有改變現有的遊戲行為。
 *   用固定種子的亂數、假時鐘跑一個固定情境，輸出一份 JSON；同一個檔案每次跑出來必須一字不差。
 *   改動前、後各跑一次，diff 兩份 JSON 必須完全相同（預期內的差異要逐項說明）。
 *   本工具不會被遊戲載入，也不會改動網頁。
 *
 * 【用法】
 *   node tools/regress/montessori_regress.js <montessori_math_game.html 的路徑> > out.json
 *   結束代碼：0 = 跑完且沒有 pageerror；1 = 跑完但有 pageerror（數量在 JSON 裡）；2 = 情境失敗
 *
 *   比對 main 與分支（用 git worktree，不動目前的工作目錄）：
 *     git fetch
 *     git worktree add ../klg-main origin/main
 *     node tools/regress/montessori_regress.js ../klg-main/montessori_math_game.html > main.json
 *     node tools/regress/montessori_regress.js montessori_math_game.html            > branch.json
 *     cmp main.json branch.json         （沒有輸出 = 行為相同；有差異才 diff main.json branch.json | head -40）
 *     git worktree remove ../klg-main
 *   輸出很大，不要整個 cat 出來。
 *
 * 【環境變數】
 *   PLAYWRIGHT_PATH   playwright 模組的路徑（預設 'playwright'，也就是用 require 找得到的那一份）
 *                     例：PLAYWRIGHT_PATH=C:/Users/me/AppData/Local/npm-cache/_npx/xxxx/node_modules/playwright
 *   PW_CHANNEL        瀏覽器 channel（例：msedge、chrome）；沒裝 Playwright 內建 chromium 時使用
 *   REGRESS_MASK=1    遮掉時間欄位（預設不遮：假時鐘暫停在固定時間，時間戳本身就是固定的，
 *                     不遮才抓得到時間戳的改變；跟 logic_regress.js 一樣）
 *   REGRESS_HEADED=1  顯示瀏覽器視窗（除錯用）
 *   需要 Playwright 1.45 以上（用到 clock）。
 *
 * 【怎麼做到每次結果都一樣】
 *   - page.addInitScript 把 Math.random 換成 mulberry32（固定種子）。
 *   - context.clock 安裝假時鐘並暫停在固定時間；setTimeout／Date 只在本工具呼叫 clock.runFor() 時才前進
 *     （答對後 250～500ms 才出現的過關視窗用 runFor 快轉）。
 *   - 瀏覽器一律加 --mute-audio 啟動，跑測試時不會發出任何聲音（遊戲用 WebAudio 播音效）。
 *   - 音效 Sound 換成假的、不發聲：DOMContentLoaded 時把 Sound 的每個方法（init 以外）換成只記名字，
 *     每一步 steps[].sounds 列出這一步呼叫過的方法（依呼叫順序）。啟動程式在 DOMContentLoaded 前就跑完，
 *     所以啟動當下（init 那一步之前）的音效不會被記到。
 *     串珠的叮噹聲等直接用 Sound.ctx 發聲（不經過 Sound 的方法），也不會出現在 sounds 裡。
 *   - 全新的 browser context（localStorage 是空的），時區固定 Asia/Taipei、語系 zh-TW。
 *   - 正確答案從頁面的全域變數讀（answerOf()；改名時只要改這裡），錯的答案 = 第一個不等於正確答案的選項。
 *
 * 【REGRESS_MASK=1 時遮掉的欄位（換成 "<t>"）】
 *   - 錯題本 montessori_mistakes*：time
 *   - 打卡 montessori_checkin*：records[*].timestamp
 *   假時鐘是固定的，所以這些值本來也固定，預設不遮。打卡的日期 key、lastDate 一律不遮。
 *
 * 【ID 代號化（一律會做）】
 *   錯題 id（'m_' + Date.now() + 亂數）依出現順序換成 <mistake#1>、<mistake#2>…
 *
 * 【情境】（一位孩子、一個分頁）
 *   1. 7 個題型依序：答錯一次 → 答對一次 → 「再來一題」；天平再用 +1 微調答對一題
 *   2. 貼紙簿：打開、關閉
 *   3. 打卡：打開、打卡、關閉
 *   4. 換裝：打開、用星星換「萌萌小兔耳髮箍」、穿上、關閉
 *   5. 錯題本：打開、按第一題的「立即重練此單元」、答對那個單元的新題目
 *   6. 學習分析：打開、關閉
 *   7. 重新整理頁面
 *
 * 【輸出】
 *   { pageErrors: { count, messages }, steps[], localStorage{} }
 *   steps[] 是每一步之後畫面上看得到的狀態（星星、貼紙、錯題本／打卡徽章、目前題型、開著的視窗、
 *   小熊的話、選項按鈕的狀態、這一步播過的音效…）。localStorage{} 是所有 key（JSON 會先 parse、key 排序）。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const PW = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const MASK = process.env.REGRESS_MASK === '1';
const T0 = Date.UTC(2026, 0, 15, 1, 0, 0);   // 台北時間 2026-01-15 09:00
const SEED = 20260115;
const M = '<t>';

// ---------------------------------------------------------------------------
// 頁面注入：固定亂數
// ---------------------------------------------------------------------------
function initScript(seed) {
  let a = seed >>> 0;
  Math.random = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // 假的音效：只記方法名稱，不發聲（Sound 是頁面上的 const，要等主程式跑完才拿得到）
  window.__soundLog = [];
  document.addEventListener('DOMContentLoaded', () => {
    try {
      /* global Sound */
      for (const k of Object.keys(Sound)) {
        if (typeof Sound[k] === 'function' && k !== 'init') Sound[k] = function () { window.__soundLog.push(k); };
      }
    } catch (e) { window.__soundLog.push('<no Sound>'); }
  });
}

// ---------------------------------------------------------------------------
// 遮罩、ID 代號化、排序
// ---------------------------------------------------------------------------
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const setIf = (o, k) => { if (isObj(o) && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== null) o[k] = M; };

function maskStorage(key, val) {
  if (!MASK) return val;
  if (key.startsWith('montessori_mistakes') && Array.isArray(val)) val.forEach(m => setIf(m, 'time'));
  if (key.startsWith('montessori_checkin') && isObj(val) && isObj(val.records)) {
    Object.keys(val.records).forEach(d => setIf(val.records[d], 'timestamp'));
  }
  return val;
}

function canonicalizeIds(out) {
  const tok = new Map();
  let n = 0;
  const walk = v => {
    if (typeof v === 'string') {
      if (/^m_\d+_\d+$/.test(v)) { if (!tok.has(v)) tok.set(v, `<mistake#${++n}>`); return tok.get(v); }
      return v.replace(/m_\d+_\d+/g, s => { if (!tok.has(s)) tok.set(s, `<mistake#${++n}>`); return tok.get(s); });
    }
    if (Array.isArray(v)) return v.map(walk);
    if (isObj(v)) { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o; }
    return v;
  };
  // 先走 localStorage，讓代號依錯題本裡的順序編號
  const ls = walk(out.localStorage);
  const steps = walk(out.steps);
  return Object.assign({}, out, { localStorage: ls, steps });
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObj(v)) {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = sortKeys(v[k]);
    return o;
  }
  return v;
}

// ---------------------------------------------------------------------------
// 跟頁面互動
// ---------------------------------------------------------------------------
// 各題型的正確答案（讀頁面的全域變數）。題型的變數改名時只要改這裡。
function answerOf(mode) {
  /* eslint-disable no-undef */
  switch (mode) {
    case 1: return addA + addB;
    case 2: return subTotal - subTake;
    case 3: return mulNum * mulCount;
    case 4: return divPerPerson;
    case 5: return bankAnswer;
    case 6: return currentChallengeData.ans;
    case 7: return balanceTargetAns;
  }
  return null;
  /* eslint-enable no-undef */
}

// 各題型 4 個選項按鈕所在的容器
const CHOICES = { 1: '#addChoices', 2: '#subChoices', 3: '#mulChoices', 4: '#divChoices', 5: '#bankChoices', 6: '#challengeChoices', 7: '#balanceChoices' };

function makeCtx(page, clock, steps) {
  const tick = ms => clock.runFor(ms);
  const click = async (sel, idx) => {
    const loc = idx === undefined ? page.locator(sel) : page.locator(sel).nth(idx);
    await loc.click({ timeout: 10000 });
  };

  async function snap(label) {
    const s = await page.evaluate(() => {
      const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
      const shown = el => !!el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
      const g = {};
      try { g.currentMode = currentMode; } catch (e) { g.currentMode = '<n/a>'; }               // eslint-disable-line no-undef
      try { g.currentDifficulty = currentDifficulty; } catch (e) { g.currentDifficulty = '<n/a>'; } // eslint-disable-line no-undef
      try { g.userStars = userStars; } catch (e) { g.userStars = '<n/a>'; }                     // eslint-disable-line no-undef
      try { g.userBonusStars = window.userBonusStars === undefined ? null : window.userBonusStars; } catch (e) { g.userBonusStars = '<n/a>'; }
      const modals = ['successModal', 'stickerAlbumModal', 'wardrobeModal', 'checkinModal', 'mistakesModal', 'analyticsModal', 'deviceGuideModal']
        .filter(id => shown(document.getElementById(id)));
      const badge = id => { const el = document.getElementById(id); return el ? { text: txt(el), shown: shown(el) } : null; };
      const choices = Array.from(document.querySelectorAll('#gameContent .choice-btn, #gameContent .tweak-btn')).map(b =>
        [txt(b), b.disabled ? 'disabled' : '', b.style.pointerEvents === 'none' ? 'pe-none' : '', b.style.opacity || ''].filter(Boolean).join('|'));
      return {
        stars: txt(document.getElementById('headerStarCount')),
        stickers: txt(document.getElementById('headerStickerBadge')),
        mistakesBadge: badge('mistakesCountBadge'),
        checkinBadge: badge('checkinBadge'),
        overlay: shown(document.getElementById('modalOverlay')),
        modals,
        modalTitle: modals.includes('successModal') ? txt(document.getElementById('modalTitle')) : null,
        mascot: txt(document.getElementById('mascotSpeech')),
        choices,
        sounds: (window.__soundLog || []).splice(0),
        globals: g
      };
    });
    s.step = label;
    steps.push(s);
    return s;
  }

  async function switchTo(mode) {
    await click('#navTabsContainer .tab-btn', mode - 1);
    await tick(50);
  }

  // 依按鈕文字找出選項；wrong = true 時找第一個不是正確答案的選項
  async function choiceIndex(mode, wrong) {
    const ans = await page.evaluate(answerOf, mode);
    const texts = await page.locator(CHOICES[mode] + ' .choice-btn').allTextContents();
    const nums = texts.map(t => Number(t.trim()));
    const idx = wrong ? nums.findIndex(n => n !== ans) : nums.indexOf(ans);
    if (idx < 0) throw new Error(`mode ${mode}: no ${wrong ? 'wrong' : 'correct'} option (ans=${ans}, options=${nums})`);
    return idx;
  }

  async function answer(mode, wrong, label) {
    const idx = await choiceIndex(mode, wrong);
    await click(CHOICES[mode] + ' .choice-btn', idx);
    await tick(wrong ? 100 : 800);   // 過關視窗在答對後 250～500ms 出現
    return snap(label);
  }

  async function closeModalIn(id) {
    await click(`#${id} .modal-close-btn`, 0);
    await tick(50);
  }

  return { page, tick, click, snap, switchTo, answer, closeModalIn };
}

// ---------------------------------------------------------------------------
// 情境
// ---------------------------------------------------------------------------
async function run(x, reload) {
  await x.snap('init');

  // 1. 7 個題型：答錯一次、答對一次、再來一題
  for (let mode = 1; mode <= 7; mode++) {
    await x.switchTo(mode);
    await x.snap(`mode${mode}: open`);
    await x.answer(mode, true, `mode${mode}: wrong`);
    await x.answer(mode, false, `mode${mode}: correct`);
    await x.click('#nextBtnText');
    await x.tick(50);
    await x.snap(`mode${mode}: next question`);
  }

  // 天平：用 +1 微調答對
  const target = await x.page.evaluate(() => balanceTargetAns);   // eslint-disable-line no-undef
  for (let i = 0; i < target; i++) {
    await x.click('.balance-tweak-bar .add-btn');
    await x.tick(50);
  }
  await x.tick(800);
  await x.snap('mode7: tweak +1 balanced');
  await x.closeModalIn('successModal');
  await x.snap('mode7: success closed (x)');

  // 2. 貼紙簿
  await x.click('.reward-capsule-btn');
  await x.tick(50);
  await x.snap('sticker album: open');
  await x.closeModalIn('stickerAlbumModal');

  // 3. 打卡
  await x.click('button[onclick="openCheckinModal()"]');
  await x.tick(50);
  await x.snap('checkin: open');
  await x.click('#doCheckinBtn');
  await x.tick(800);
  await x.snap('checkin: done');
  await x.closeModalIn('checkinModal');

  // 4. 換裝：換一件、穿上
  await x.click('.device-help-btn[onclick="openWardrobeModal()"]');
  await x.tick(50);
  await x.snap('wardrobe: open');
  await x.click(`#wardrobeModal .unlock-btn[onclick="Wardrobe.unlock('bunny_ears')"]`);
  await x.tick(800);
  await x.snap('wardrobe: unlock bunny_ears');
  await x.click(`#wardrobeModal .equip-btn[onclick="Wardrobe.equip('bunny_ears')"]`);
  await x.tick(50);
  await x.snap('wardrobe: equip bunny_ears');
  await x.closeModalIn('wardrobeModal');

  // 5. 錯題本：再練一次（同題型的新題目）並答對
  await x.click('button[onclick="openMistakesModal()"]');
  await x.tick(50);
  const mistakeCards = await x.page.evaluate(() => Array.from(document.querySelectorAll('#mistakesListContainer .mistake-item-card'))
    .map(c => c.textContent.replace(/\s+/g, ' ').trim()));
  const s = await x.snap('mistakes: open');
  s.mistakeCards = mistakeCards;
  await x.click('#mistakesListContainer .retry-btn', 0);
  await x.tick(50);
  const r = await x.snap('mistakes: retry first');
  await x.answer(r.globals.currentMode, false, 'mistakes: retry answered');
  await x.closeModalIn('successModal');

  // 6. 學習分析
  await x.click('button[onclick="openAnalyticsModal()"]');
  await x.tick(50);
  const a = await x.snap('analytics: open');
  a.analytics = await x.page.evaluate(() => {
    const el = document.getElementById('analyticsContentBox');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  await x.closeModalIn('analyticsModal');

  // 7. 重新整理
  await reload();
  await x.snap('reload');
}

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    process.stderr.write('usage: node tools/regress/montessori_regress.js <path-to-montessori_math_game.html> > out.json\n');
    process.exit(2);
  }
  const url = pathToFileURL(path.resolve(file)).href;
  const browser = await PW.chromium.launch({ channel: process.env.PW_CHANNEL || undefined, args: ['--mute-audio'], headless: process.env.REGRESS_HEADED !== '1' });
  const out = { pageErrors: { count: 0, messages: [] }, steps: [], localStorage: {} };
  let failed = false;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei', reducedMotion: 'reduce' });
    await context.clock.install({ time: T0 });
    await context.clock.pauseAt(T0 + 1000);
    const page = await context.newPage();
    page.on('pageerror', e => { out.pageErrors.count++; out.pageErrors.messages.push(String(e && e.message)); });
    page.on('dialog', d => d.accept());
    await page.addInitScript(initScript, SEED);
    const ready = async () => { await page.locator('#navTabsContainer .tab-btn').first().waitFor({ timeout: 10000 }); await context.clock.runFor(50); };
    await page.goto(url);
    await ready();
    const x = makeCtx(page, context.clock, out.steps);
    try {
      await run(x, async () => { await page.reload(); await ready(); });
    } catch (e) {
      failed = true;
      out.error = String(e && e.message).split('\n')[0];
      process.stderr.write(`FAILED: ${e && e.stack}\n`);
    }
    const raw = await page.evaluate(() => {
      const o = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
      return o;
    });
    for (const k of Object.keys(raw)) {
      let v = raw[k];
      try { v = JSON.parse(v); } catch (e) {}
      out.localStorage[k] = maskStorage(k, v);
    }
    await context.close();
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify(sortKeys(canonicalizeIds(out)), null, 2) + '\n');
  process.exit(failed ? 2 : (out.pageErrors.count ? 1 : 0));
}

main().catch(e => { process.stderr.write(String(e && e.stack) + '\n'); process.exit(2); });
