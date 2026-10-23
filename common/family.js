/* =========================================================
   common/family.js：兩個遊戲共用的程式（孩子名單、儲存、護眼狀態、家長算式）
   原始碼在這裡；用 tools/build_common.py 嵌進各遊戲 HTML 裡標記好的共用程式區塊。
   規則：不碰 DOM、不放畫面文字（例外：家長頁學習紀錄的報告文字，見最後一段）、初始化時不呼叫 Math.random()。
   遊戲才有的東西用 familyHooks 接；這裡的預設值都不做事。
   ========================================================= */

const familyHooks = {
  freeSpace: () => qlogFreeSpace()   // 儲存空間不夠時：兩個遊戲的學習紀錄都砍一半（qlogFreeSpace 在下面）
};

/* ---------- 小工具 ---------- */
const isStr = v => typeof v === 'string';
const isNum = v => typeof v === 'number' && isFinite(v);
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

/* ---------- 孩子與 key ---------- */
const PROFILES_KEY = 'little_logic_profiles_v1';
const DEFAULT_EMOJI = '🐰';
const CHILD_EMOJIS = ['🐰', '🐶', '🐱', '🐻', '🐼', '🦊'];
const AWAY_KEY = 'little_logic_last_seen_v1';   // 跟裝置走，不跟孩子走
const AWAY_MS = 10 * 60 * 1000;

// 每位孩子一份的 key：slot 規則（c0 沒有後綴，其他孩子加 __<id>）
// 紀錄 key：一律 base + '__' + id
// 依遊戲分組；重建名單時的掃描順序 = 邏輯遊戲（存檔、錯題本、齒輪說明、紀錄）→ 數學樂園
const FAMILY_KEY_GROUPS = [
  { child: ['little_logic_save_v1', 'little_logic_mistakes_v1', 'little_logic_gears_intro_v1'], id: ['little_logic_qlog_v1'] },
  { child: ['montessori_mistakes', 'montessori_analytics', 'montessori_diff', 'montessori_stars',
            'montessori_stickers', 'montessori_wardrobe', 'montessori_checkin', 'montessori_bonus_stars'], id: ['montessori_qlog_v1'] }
];
const FAMILY_CHILD_KEYS = FAMILY_KEY_GROUPS.flatMap(g => g.child);
const FAMILY_ID_KEYS = FAMILY_KEY_GROUPS.flatMap(g => g.id);
const FAMILY_SCAN_KEYS = FAMILY_KEY_GROUPS.flatMap(g => g.child.concat(g.id));

function safeSetItem(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch (e) {
    familyHooks.freeSpace();
    try { localStorage.setItem(key, value); return true; } catch (e2) { return false; }
  }
}

function slotOf(id) { return id === 'c0' ? '' : '__' + id; }
function childKey(base, id) { return base + slotOf(id); }
// 刪掉一位孩子時要清掉的所有 key（兩個遊戲）
function familyKeysOfChild(id) {
  return FAMILY_CHILD_KEYS.map(base => childKey(base, id)).concat(FAMILY_ID_KEYS.map(base => base + '__' + id));
}

function readProfiles() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PROFILES_KEY)); } catch (e) {}
  let children = (p && Array.isArray(p.children)) ? p.children.filter(c => c && typeof c.id === 'string' && c.id) : [];
  const seen = new Set();
  children = children.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });  // 壞資料裡重複的 ID 去重
  // 名單不見或壞掉才從 key 的後綴重建（名單還在時不能把已刪掉的孩子又復活）
  if (children.length === 0) {
    // 重建時圖示要互不重複，孩子才分得出誰是誰：c0 先拿預設圖示，其他依序拿沒人用的
    const used = new Set([DEFAULT_EMOJI]);
    const nextEmoji = () => CHILD_EMOJIS.find(e => !used.has(e)) || DEFAULT_EMOJI;
    seen.add('c0');
    children.push({ id: 'c0', emoji: DEFAULT_EMOJI, name: '', slot: '', createdAt: Date.now() });
    for (const base of FAMILY_SCAN_KEYS) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(base + '__')) continue;
        const id = k.slice(base.length + 2);
        if (seen.has(id)) continue;          // c0 只會出現一次
        seen.add(id);
        const e = nextEmoji();
        used.add(e);
        children.push({ id, emoji: e, name: '', slot: slotOf(id), createdAt: Date.now() });
      }
    }
  } else if (!seen.has('c0')) {
    // N3：補回來的 c0 圖示不能跟名單上別的孩子重複
    const used = new Set(children.map(c => c.emoji));
    const e = used.has(DEFAULT_EMOJI) ? (CHILD_EMOJIS.find(x => !used.has(x)) || DEFAULT_EMOJI) : DEFAULT_EMOJI;
    children.unshift({ id: 'c0', emoji: e, name: '', slot: '', createdAt: Date.now() });
  }
  children.sort((a, b) => (a.id === 'c0' ? -1 : b.id === 'c0' ? 1 : 0));
  const ids = new Set(children.map(c => c.id));
  const active = (p && typeof p.active === 'string' && ids.has(p.active)) ? p.active : 'c0';
  return { v: 1, active, askOnOpen: !!(p && p.askOnOpen), children };
}

// 名單寫入一律「先讀、再改、再寫」
function saveProfiles(mutator) {
  const p = readProfiles();
  const next = mutator(p);
  if (!next) return false;
  return safeSetItem(PROFILES_KEY, JSON.stringify(next));
}

/* ---------- 離開時間（整台裝置共用） ---------- */
function lastSeenAt() {
  try { const n = Number(localStorage.getItem(AWAY_KEY)); return Number.isFinite(n) ? n : 0; } catch (e) { return 0; }
}
function markSeen() { safeSetItem(AWAY_KEY, String(Date.now())); }

/* ---------- 護眼狀態 ---------- */
const EYE_KEY = 'little_logic_eyecare_v1';
const EYE_LIMITS = [10, 15, 20, 30];
const EYE_GRACE_MS = 3 * 60 * 1000;   // 時間到後最多再給 3 分鐘做完這一題，避免卡在一題一直不鎖
const EYE_WARN_MS = 60 * 1000;        // 剩 1 分鐘時提醒
const GATE_COOLDOWN_MS = 30 * 1000;   // 家長算式連錯 3 次，等 30 秒才能再答（避免孩子亂猜）

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// rev：家長動作（解鎖、改設定、重新計時）的時間戳；多個分頁時以較新的家長動作為準
function parseEyeState(raw) {
  const state = { enabled: true, limitMin: 20, usedMs: 0, day: todayKey(), locked: false, rev: 0 };
  try {
    const saved = JSON.parse(raw || 'null');
    if (saved && typeof saved === 'object') {
      if (typeof saved.enabled === 'boolean') state.enabled = saved.enabled;
      if (EYE_LIMITS.includes(saved.limitMin)) state.limitMin = saved.limitMin;
      if (isNum(saved.usedMs) && saved.usedMs >= 0) state.usedMs = saved.usedMs;
      if (isStr(saved.day)) state.day = saved.day;
      if (saved.locked === true) state.locked = true;
      if (isNum(saved.rev) && saved.rev >= 0) state.rev = saved.rev;
    }
  } catch (e) {}
  return state;
}

function readStoredEye() {
  try {
    return parseEyeState(localStorage.getItem(EYE_KEY));
  } catch (e) {
    return null;
  }
}

// 合併別的分頁存的狀態：家長動作較新的那邊為準；否則「鎖住」與「用掉的時間」取較嚴格的
// 純函式：不改 local；回傳 { state, reset }，reset = true 時遊戲要清掉自己的「超時起點」「已提醒」
function mergeEye(local, stored) {
  if (!stored) return { state: local, reset: false };
  if (stored.rev > local.rev) return { state: stored, reset: true };
  if (stored.rev === local.rev && stored.day === local.day) {
    return { state: Object.assign({}, local, { locked: local.locked || stored.locked, usedMs: Math.max(local.usedMs, stored.usedMs) }), reset: false };
  }
  return { state: local, reset: false };
}

/* ---------- 家長算式（純邏輯；畫面由各遊戲自己畫） ---------- */
// 兩位數加法而且要進位，例如 37 + 48
function gateNew() {
  let a, b;
  do {
    a = randInt(15, 69);
    b = randInt(15, 39);
  } while ((a % 10) + (b % 10) < 10);
  return { a, b };
}

// gate = { a, b, tries, cooldownUntil }；答錯會把 gate.tries 加一
// 回傳 'wait'（冷卻中）／'ok'／'wrong'（還可以再試）／'reroll'（錯 3 次，要換題並冷卻 GATE_COOLDOWN_MS）
function gateCheck(gate, value, now) {
  if (gate.cooldownUntil - now > 0) return 'wait';
  if (Number(value) === gate.a + gate.b) return 'ok';
  gate.tries++;
  return gate.tries >= 3 ? 'reroll' : 'wrong';
}

/* ---------- 學習紀錄核心（M2a 從 logic_game.html 搬來） ---------- */
// 紀錄的格式表：依 key base 查，不依目前在哪個遊戲查；每個遊戲的上限只放這裡
// logic 的紀錄沒有 game 欄位（沒有就是邏輯遊戲）；montessori 的紀錄加 game:'montessori'
const QLOG_GAMES = {
  little_logic_qlog_v1: {
    game: 'logic',
    modules: ['pattern', 'balance', 'blocks', 'maze', 'deduction', 'folding', 'gears', 'raven', 'oddone', 'pipes', 'topview'],
    subs: ['pattern', 'balance.swap', 'balance.number', 'blocks', 'maze', 'deduction', 'folding', 'gears', 'raven', 'oddone.odd', 'oddone.sort', 'oddone.monster', 'pipes.live', 'pipes.hard', 'topview'],
    maxPerSub: 30, total: 1000000, perChild: 400000   // total：所有孩子合計（字元）
  },
  montessori_qlog_v1: {
    game: 'montessori',
    modules: ['add', 'sub', 'mul', 'div', 'bank', 'challenge', 'balance'],
    subs: ['add', 'sub', 'mul', 'div', 'bank.add', 'bank.sub', 'challenge.add', 'challenge.sub', 'challenge.muldiv', 'balance'],
    maxPerSub: 30, total: 400000, perChild: 150000
  }
};
const QLOG_MAX_EV = 100;
const QLOG_RECOVER_MS = 3 * 60 * 1000;
const QLOG_HEARTBEAT_MS = 60 * 1000;
const QLOG_SOURCES = ['first', 'repeat', 'retry', 'afterDemo', 'resume', 'verify'];
const QLOG_OUTCOMES = ['correct', 'abandoned', 'replaced', 'retryEnded', 'locked', 'away', 'unload'];
const QLOG_EVENT_TYPES = ['t', 'w', 'c', 'a', 'x', 'l', 's', 'o', 'n'];

// 遊戲專屬的部分：各遊戲在自己的主程式裡 Object.assign(qlogConfig, {...})；這裡的預設值都不做事
const qlogConfig = {
  base: null,                     // 這個遊戲寫入的 key base
  build: null,                    // 這個遊戲的 LOG_BUILD
  tab: '',                        // 分頁 id（由遊戲自己產生）
  buildOpen: () => null,          // (source) → 這一題的紀錄；沒有題目就回傳 null
  isOff: () => false,             // 目前是否算「離開畫面」
  offTracked: true,               // false：這個遊戲還沒有完整的離開畫面計時，offMs／activeMs／firstAnswer.off 記 null
  actionsTemplate: {},            // actions 的初始欄位
  countAction: () => null,        // (type, data) → x 事件要累加的 actions 欄位（不累加就回傳 null）
  onAnswerEvent: () => {}         // (r, type) → 答題事件（w／c）的遊戲專屬處理
};

let qlogActive = null;        // 目前開著的紀錄（記憶體）
let qlogWriteFailed = {};     // { 紀錄 key: true }，只在記憶體，不是單筆欄位
let qlogEvicting = false;     // 防 safeSetItem → familyHooks.freeSpace → 寫入 的遞迴
let qlogOffMs = 0, qlogOffSince = Date.now(), qlogOffNow = false;

// §3：紀錄 key 一律用 ID（不用 slot 規則），c0 也是 __c0；base 不含底線
function qlogKey(base, id) { return base + '__' + id; }

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function qlogId(s) { return fnv1a(s).toString(36); }

function childOnList(id) { return readProfiles().children.some(c => c.id === id); }

// R2 寫的紀錄沒有 R3 的欄位：那些欄位允許 null 或不存在
// 一律用 base 的格式表檢查（不依目前在哪個遊戲），別的遊戲的紀錄才不會被當成格式錯誤
function isValidLogRecord(r, base) {
  const g = QLOG_GAMES[base];
  if (!g) return false;
  if (!r || typeof r !== 'object' || r.v !== 1) return false;
  if (typeof r.id !== 'string' || !r.id) return false;
  if (typeof r.tab !== 'string' || !r.tab) return false;
  if (typeof r.childId !== 'string' || !r.childId) return false;
  if (!Number.isFinite(r.lastWrite) || !Number.isFinite(r.tOpen)) return false;
  if (!g.modules.includes(r.module)) return false;
  if (!g.subs.includes(r.sub)) return false;
  if (!QLOG_SOURCES.includes(r.source)) return false;
  if (r.outcome !== null && !QLOG_OUTCOMES.includes(r.outcome)) return false;
  if (!Array.isArray(r.ev) || r.ev.length > QLOG_MAX_EV) return false;
  // R3 Minor 9：R3 欄位是 null 或不存在可以接受，但型別錯的要擋掉（舊紀錄沒有這些欄位）
  if (r.firstAnswer != null && (typeof r.firstAnswer !== 'object' || Array.isArray(r.firstAnswer) ||
      typeof r.firstAnswer.ok !== 'boolean' || !Number.isFinite(r.firstAnswer.dt))) return false;
  if (r.firstAnswer != null && r.firstAnswer.off != null && !Number.isFinite(r.firstAnswer.off)) return false;
  if (r.actions != null && (typeof r.actions !== 'object' || Array.isArray(r.actions))) return false;
  if (r.aids != null && !Array.isArray(r.aids)) return false;
  if (r.aidCounts != null && (typeof r.aidCounts !== 'object' || Array.isArray(r.aidCounts))) return false;
  if (r.leaks != null && !Array.isArray(r.leaks)) return false;
  if (r.gameReasons != null && !Array.isArray(r.gameReasons)) return false;
  for (const e of r.ev) {
    if (!Array.isArray(e) || e.length !== 3 || !Number.isFinite(e[0]) || typeof e[1] !== 'string' || !QLOG_EVENT_TYPES.includes(e[1])) return false;
  }
  return true;
}

// 整個 key 讀不出來 → 當成空的；單筆格式不合 → 丟掉那一筆、skipped + 1
function qlogLoad(base, childId) {
  const empty = { v: 1, childId, records: [], dropped: {}, skipped: 0 };
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(qlogKey(base, childId))); } catch (e) { return empty; }
  if (!raw || typeof raw !== 'object' || raw.v !== 1 || !Array.isArray(raw.records)) return empty;
  const recs = raw.records.filter(r => isValidLogRecord(r, base) && r.childId === childId);
  const dropped = (raw.dropped && typeof raw.dropped === 'object') ? raw.dropped : {};
  return { v: 1, childId, records: recs, dropped, skipped: (Number(raw.skipped) || 0) + (raw.records.length - recs.length) };
}

function qlogBudget(base, childId) {
  const g = QLOG_GAMES[base];
  const n = Math.max(1, readProfiles().children.length);
  return Math.min(g.perChild, Math.floor(g.total / n));
}

// 每組最多 30 筆；超過額度時從筆數最多的那一組開始刪最舊的
function qlogEvict(base, store) {
  const g = QLOG_GAMES[base];
  const dropped = store.dropped || {};
  const bump = (sub, n) => { dropped[sub] = (Number(dropped[sub]) || 0) + n; };
  for (const sub of g.subs) {
    const rs = store.records.filter(r => r.sub === sub).sort((a, b) => a.tOpen - b.tOpen);
    if (rs.length > g.maxPerSub) {
      const kill = new Set(rs.slice(0, rs.length - g.maxPerSub));
      store.records = store.records.filter(r => !kill.has(r));
      bump(sub, kill.size);
    }
  }
  while (JSON.stringify(store).length > qlogBudget(base, store.childId)) {
    const counts = {};
    for (const r of store.records) counts[r.sub] = (counts[r.sub] || 0) + 1;
    let top = null;
    for (const sub in counts) if (!top || counts[sub] > counts[top]) top = sub;
    if (!top) break;
    const oldest = store.records.filter(r => r.sub === top).sort((a, b) => a.tOpen - b.tOpen)[0];
    store.records = store.records.filter(r => r !== oldest);
    bump(top, 1);
  }
  store.dropped = dropped;
  return store;
}

// M1：寫紀錄失敗只減「這位孩子」最舊的 25% 再試一次（plan §3）；不能動別的孩子
// familyHooks.freeSpace（qlogFreeSpace：每位孩子刪一半）只給進度、錯題本、護眼、名單用
function qlogSave(base, store, keepId) {
  if (qlogEvicting) return false;
  if (!childOnList(store.childId)) return false;   // 寫前確認這位孩子還在名單上
  qlogEvict(base, store);
  const key = qlogKey(base, store.childId);
  const write = () => { try { localStorage.setItem(key, JSON.stringify(store)); return true; } catch (e) { return false; } };
  if (write()) { delete qlogWriteFailed[key]; return true; }   // minor 4：成功就清掉標記
  const sorted = store.records.slice().sort((a, b) => a.tOpen - b.tOpen);
  const kill = Math.ceil(store.records.length * 0.25);
  if (kill > 0) {
    // N-D + R3：先把正在寫入的那一筆排除，再取最舊 kill 筆（順序反過來會少刪一筆）
    const drop = new Set(sorted.filter(r => r.id !== keepId).slice(0, kill));
    if (drop.size) {
      const dropped = store.dropped || {};
      for (const r of drop) dropped[r.sub] = (Number(dropped[r.sub]) || 0) + 1;
      store.dropped = dropped;
      store.records = store.records.filter(r => !drop.has(r));
    }
  }
  if (write()) { delete qlogWriteFailed[key]; return true; }
  qlogWriteFailed[key] = true;
  return false;
}
// N-A：每次寫入都要更新 lastWrite（跨分頁復原看的是這個時間，不是開題當下）
// 寫的是這個遊戲自己的 key（qlogConfig.base）
function qlogSaveRecord(r) {
  r.lastWrite = Date.now();
  const store = qlogLoad(qlogConfig.base, r.childId);
  const i = store.records.findIndex(x => x.id === r.id);
  if (i >= 0) store.records[i] = r; else store.records.push(r);
  return qlogSave(qlogConfig.base, store, r.id);
}

// 空間不夠：兩個遊戲、每位孩子的紀錄各刪一半，讓進度、錯題本、護眼、名單可以優先寫入
// 每個 key 用自己的格式表檢查（QLOG_GAMES[base]），別的遊戲的紀錄只會被砍一半、不會被當成格式錯誤
function qlogFreeSpace() {
  if (qlogEvicting) return;
  qlogEvicting = true;
  try {
    const children = readProfiles().children;
    for (const base of Object.keys(QLOG_GAMES)) {
      for (const c of children) {
        const store = qlogLoad(base, c.id);
        if (!store.records.length) continue;
        const keep = Math.floor(store.records.length / 2);
        const sorted = store.records.slice().sort((a, b) => b.tOpen - a.tOpen);
        const dropped = store.dropped || {};
        for (const r of sorted.slice(keep)) dropped[r.sub] = (Number(dropped[r.sub]) || 0) + 1;
        store.records = sorted.slice(0, keep);
        store.dropped = dropped;
        try { localStorage.setItem(qlogKey(base, c.id), JSON.stringify(store)); } catch (e) {}
      }
    }
  } catch (e) {
  } finally { qlogEvicting = false; }
}

// 點擊 t 事件的目標與標籤（兩個遊戲共用；capture 的掛法和範圍由各遊戲決定）
function qlogEventTarget(el) {
  let n = el;
  while (n) {
    if (n.tagName === 'BUTTON' || typeof n.onclick === 'function') return n;
    n = n.parentElement;
  }
  return null;
}
function qlogEventLabel(el, keyboard) {
  // minor 1：先放 trim 過的文字、再放 class；按字元切，emoji 不會被切斷
  const t = (el.textContent || '').trim();
  const s = el.id || (Array.from(t).slice(0, 12).join('') + ' ' + (el.className || ''));
  return keyboard ? 'k:' + s : s;
}

// offMs：「離開畫面」由遊戲判斷（logic：切到背景 + 任何彈出視窗 + 護眼鎖住）
function qlogIsOff() { return !!qlogConfig.isOff(); }
function qlogOffTick() {
  const now = Date.now();
  if (qlogOffNow) qlogOffMs += now - qlogOffSince;
  qlogOffNow = qlogIsOff();
  qlogOffSince = now;
}

// 開一筆新紀錄：這一題的內容由遊戲組（qlogConfig.buildOpen；沒有題目就回傳 null）
function qlogOpen(source) {
  try {
    let rec;
    try { rec = qlogConfig.buildOpen(source); }
    catch (e) { if (qlogActive) qlogClose('replaced'); return null; }   // 組新紀錄出錯：跟搬移前一樣，上一筆照樣關成 replaced
    if (!rec) return null;                   // 不在題目中（例如沒有 currentModule）：不動上一筆
    rec.build = qlogConfig.build;            // build 只由各遊戲的 qlogConfig 決定（key 已存在，欄位順序不變）
    if (qlogActive) qlogClose('replaced');   // 上一筆還沒關
    qlogActive = rec;
    qlogOffMs = 0; qlogOffSince = Date.now(); qlogOffNow = qlogIsOff();
    qlogSaveRecord(rec);
    return rec;
  } catch (e) { console.warn('qlogOpen', e); return null; }
}

function qlogEvent(type, data) {
  try {
    const r = qlogActive;
    if (!r || r.outcome !== null) return;   // 已關閉的紀錄再記事件不做任何事
    const dt = Date.now() - r.tOpen;
    // M2：計數在事件當下就累加，ev 被截斷時摘要仍正確
    if (type === 't') {
      r.tapCount++;
      if (typeof data === 'string' && data.indexOf('k:') === 0) r.keyTapCount++;
    } else if (type === 'w') {
      if (data && data.dup) r.wrongDupCount++;
      else { r.wrongCount++; r.wrongCountGame++; }   // N-B：復原那條路不會跑 qlogSummarize，這裡就要算
      // M2：先 qlogOffTick() 再記 off＝作答當下的累計 offMs（不是整題的 offMs）
      if (!r.firstAnswer) { qlogOffTick(); r.firstAnswer = { ok: false, dt: dt, off: qlogConfig.offTracked ? qlogOffMs : null }; }
    } else if (type === 'c' && !r.firstAnswer) {
      qlogOffTick(); r.firstAnswer = { ok: true, dt: dt, off: qlogConfig.offTracked ? qlogOffMs : null };
    }
    // R3：輔助、動作計數、漏水
    // R3 Minor 7：aids 跟 ev 一樣最多 100 筆；計數另外記，不受上限影響
    if (type === 'a') {
      if (!r.aids) r.aids = [];
      if (!r.aidCounts) r.aidCounts = {};
      r.aidCounts[data] = (Number(r.aidCounts[data]) || 0) + 1;
      if (r.aids.length < QLOG_MAX_EV) r.aids.push(data);
    }
    else if (type === 'l') { if (!r.leaks) r.leaks = []; r.leaks.push(data); }
    else { const f = qlogConfig.countAction(type, data); if (f) qlogCountAction(f, 1); }   // 動作要累加哪個欄位由遊戲決定
    if (type === 'w' || type === 'c') qlogConfig.onAnswerEvent(r, type);   // 答題事件的遊戲專屬處理（logic：朗讀中作答）
    if (r.ev.length >= QLOG_MAX_EV) { r.evTruncated = true; return; }
    r.ev.push([dt, type, data === undefined ? null : data]);
  } catch (e) {}
}

function qlogSummarize(r) {
  // M2：tapCount / wrongCount / wrongDupCount / wrongCountGame / firstAnswer 已在 qlogEvent 當下累加
  if (!qlogConfig.offTracked) { r.offMs = null; r.activeMs = null; return; }
  r.offMs = qlogOffMs;
  r.activeMs = r.tClose - r.tOpen - r.offMs;
}

function qlogClose(outcome) {
  try {
    const r = qlogActive; if (!r || r.outcome !== null) return;   // 已關閉就什麼都不做
    qlogOffTick();
    r.tClose = Date.now();
    r.outcome = outcome;
    qlogSummarize(r);
    qlogActive = null;
    qlogSaveRecord(r);
  } catch (e) { console.warn('qlogClose', e); }
}

// 載入時掃所有孩子：別的分頁留著的舊紀錄 → 復原成 unload（只復原這個遊戲自己的 key）
function qlogRecover() {
  try {
    const now = Date.now();
    for (const c of readProfiles().children) {
      const store = qlogLoad(qlogConfig.base, c.id);
      let changed = false;
      for (const r of store.records) {
        if (r.outcome === null && r.tab !== qlogConfig.tab && now - r.lastWrite > QLOG_RECOVER_MS) {
          r.outcome = 'unload'; r.recovered = true; r.lastWrite = now; changed = true;
        }
      }
      if (changed) qlogSave(qlogConfig.base, store);
    }
  } catch (e) { console.warn('qlogRecover', e); }
}

function qlogHeartbeat() {
  try {
    if (!qlogActive || qlogActive.outcome !== null) return;
    if (document.visibilityState !== 'visible') return;
    qlogOffTick();
    qlogSaveRecord(qlogActive);
  } catch (e) {}
}

function qlogCountAction(field, n) {
  try {
    const r = qlogActive;
    if (!r || r.outcome !== null) return;
    if (!r.actions) r.actions = Object.assign({}, qlogConfig.actionsTemplate);
    // R3 Minor 2：n 沒給才當 1；給 0 就是 0（迷宮 0 個指令不能記成 1）
    r.actions[field] = (Number(r.actions[field]) || 0) + (n == null ? 1 : (Number(n) || 0));
  } catch (e) {}
}

// R3 驗收 6：用提示／看範例／亂轉不算答錯（wrongCount 不變），但算 game 層的「用了輔助」
function qlogGameWrong(reason) {
  try {
    const r = qlogActive;
    if (!r || r.outcome !== null) return;
    r.wrongCountGame++;
    if (!r.gameReasons) r.gameReasons = [];
    if (r.gameReasons.length < QLOG_MAX_EV) r.gameReasons.push(reason);   // 上限同 aids；次數以 wrongCountGame 為準
  } catch (e) {}
}

/* ---------- 朗讀（#54 S1：從 logic_game.html 搬來，兩個遊戲共用） ----------
   語速存在同一個 key（SPEECH_RATE_KEY），每台裝置一份；另一個分頁改了會跟著改（storage 監聽）。
   語音事件只寫進建立它的那筆紀錄（recId）。speakText 的第三個參數 opts 可省略；
   沒傳 opts 時不建立任何計時器、不多呼叫任何 API（行為跟搬家前一字不差）。
   opts.onDone(why)：這一句結束時剛好被呼叫一次，why 是 end／error／cut／timeout／unavailable 其中之一。 */
// 朗讀快慢（每台裝置各自記住，不跟進度一起同步：不同裝置的語音引擎，同樣的速度聽起來快慢不一樣）
const SPEECH_RATES = { slow: 0.7, normal: 0.85, fast: 1 };
const SPEECH_RATE_KEY = 'little_logic_speech_rate';
const SPEECH_START_WAIT_MS = 5000;   // 帶 onDone 時，等 onstart 的上限
let speechRate = 'slow';
try {
  const saved = localStorage.getItem(SPEECH_RATE_KEY);
  if (Object.prototype.hasOwnProperty.call(SPEECH_RATES, saved)) speechRate = saved;
} catch (e) {}
let speechCurrent = null;      // 這一句：{ recId, kind, done, cut, ... }
let speechSpeaking = null;     // 還在念的那一句（start 之後、end／cut 之前）
familyHooks.speechKindOf = (text, kind) => kind || 'other';   // 遊戲可以換成自己的判斷（logic 會）

// 別的分頁改了語速：這個分頁跟著改（值不合法就不理）
window.addEventListener('storage', function (e) {
  try {
    if (e.key !== SPEECH_RATE_KEY) return;
    if (Object.prototype.hasOwnProperty.call(SPEECH_RATES, e.newValue)) speechRate = e.newValue;
  } catch (err) {}
});

// R3（複查）：plan §2 是 zh-TW 的數量，zh-CN／zh-HK 不算；Android 可能回報 zh_TW
function isZhTw(v) {
  return String((v && v.lang) || '').toLowerCase().replace(/_/g, '-') === 'zh-tw';
}

// 共用的 zh-TW 語音清單：目前沒有呼叫端，保留給 #20 做語音選擇時用（數量統計請用 qlogZhVoiceCount）
function getZhVoices() {
  if (!('speechSynthesis' in window)) return null;
  try { return (window.speechSynthesis.getVoices() || []).filter(isZhTw); } catch (e) { return null; }
}

// M3：iPad Safari 常常直接回傳語音清單、不觸發 voiceschanged，所以開題時就要自己數一次
function qlogZhVoiceCount() {
  if (!('speechSynthesis' in window)) return null;
  try {
    const v = window.speechSynthesis.getVoices() || [];
    if (!v.length) return null;            // 清單還沒載入 → null
    return v.filter(isZhTw).length;        // 清單非空但沒有 zh-TW → 0
  } catch (e) { return null; }
}

// m-c：語音事件只寫進建立它的紀錄；那筆已經關閉就丟掉
function qlogSpeechEvent(recId, ph, kind) {
  try {
    const r = qlogActive;
    if (!r || r.id !== recId || r.outcome !== null) return;
    qlogEvent('s', { kind: kind, ph: ph });
  } catch (e) {}
}

// 紀錄裡的 speech 物件（放在 soundOn 前面）與朗讀欄位（放在 aids 前面）：拆成兩個，各自展開在原位置才保得住欄位順序
function speechInfo() {
  return { available: !!window.speechSynthesis, rateSetting: speechRate, rate: SPEECH_RATES[speechRate], voiceURI: null, voiceName: null, voiceLang: null, zhVoices: qlogZhVoiceCount(), source: 'tts' };   // M3：一律呼叫 qlogZhVoiceCount()
}
function speechPromptFields() {
  return { promptSpeech: null, answeredDuringPrompt: false, answeredDuringPromptRate: null };
}

// 題目還在朗讀時就作答（qlogConfig.onAnswerEvent 用）
function qlogSpeechAnswerEvent(r, type) {
  if (speechSpeaking && speechSpeaking.recId === r.id &&
      (speechSpeaking.kind === 'prompt' || speechSpeaking.kind === 'manual')) {
    r.answeredDuringPrompt = true;
    if (!r.answeredDuringPromptRate) r.answeredDuringPromptRate = speechSpeaking.rateSetting;   // R3 Minor 8：作答當下正在念的那一句的速度
  }
}

// 設定語速：驗證 → 記事件（rate 是數字）→ 存起來。回傳 true／false；畫面更新與試聽由遊戲自己做
function speechSetRate(rate) {
  if (!Object.prototype.hasOwnProperty.call(SPEECH_RATES, rate)) return false;
  speechRate = rate;
  qlogEvent('s', { kind: 'rate', ph: 'rate', rate: SPEECH_RATES[rate] });   // R3：題中改速度
  try { localStorage.setItem(SPEECH_RATE_KEY, rate); } catch (e) {}
  return true;
}

// 估這句要念多久用的字數：漢字 1、阿拉伯數字 2（「2345」念成七個音節）、其他 0
function speechUnits(text) {
  let n = 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x4E00 && c <= 0x9FFF) n += 1;
    else if (c >= 0x30 && c <= 0x39) n += 2;
  }
  return n;
}

// 帶 onDone 的那一句結束：只會執行一次，清掉這一句的計時器，onDone 丟例外不影響朗讀與紀錄
function speechFinish(cur, why) {
  if (!cur || cur.finished) return;
  cur.finished = true;
  if (cur.timers) { cur.timers.forEach(t => clearTimeout(t)); cur.timers = []; }
  const f = cur.onDone;
  if (!f) return;
  try { f(why); } catch (e) {}
}

function speakText(text, kind, opts) {
  const onDone = (opts && typeof opts.onDone === 'function') ? opts.onDone : null;
  if (!('speechSynthesis' in window)) {
    if (onDone) setTimeout(function () { try { onDone('unavailable'); } catch (e) {} }, 0);
    return;
  }
  cancelSpeech();                       // n3：所有 cancel 都走同一個 helper，才會記到 cut
  const k = familyHooks.speechKindOf(text, kind);
  const recId = qlogActive ? qlogActive.id : null;   // m-c：utterance 綁建立它的紀錄
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-TW';
  utterance.rate = SPEECH_RATES[speechRate];         // #20：保留
  utterance.pitch = 1.2;
  const cur = { recId: recId, kind: k, done: false, cut: false, rateSetting: speechRate, u: utterance, onDone: onDone, finished: false, timers: [] };   // R3 Minor 8；u 掛在 cur 上：防 Chrome 回收 utterance 後 onend 永遠不來
  speechCurrent = cur;
  try {
    if ((k === 'prompt' || k === 'manual') && qlogActive && qlogActive.outcome === null) {
      qlogActive.promptSpeech = { kind: k, dt: Date.now() - qlogActive.tOpen, rate: SPEECH_RATES[speechRate], rateSetting: speechRate };
    }
  } catch (e) {}
  utterance.onstart = function () {
    try {
      if (speechCurrent !== cur || cur.cut) return;
      speechSpeaking = cur;
      qlogSpeechEvent(recId, 'start', k);
      if (cur.onDone && !cur.finished) {   // 開始念了：不再等開始，改等念完（上限 T_end）
        cur.timers.forEach(t => clearTimeout(t));
        const tEnd = Math.min(30000, 2000 + speechUnits(text) * 450 / SPEECH_RATES[speechRate]);
        cur.timers = [setTimeout(function () { speechFinish(cur, 'timeout'); }, tEnd)];
      }
    } catch (e) {}
  };
  utterance.onend = function () {
    try {
      if (speechCurrent !== cur || cur.cut || cur.done) return;   // 被 cut 之後的 end 忽略
      cur.done = true;
      if (speechSpeaking === cur) speechSpeaking = null;
      qlogSpeechEvent(recId, 'end', k);
      speechFinish(cur, 'end');
    } catch (e) {}
  };
  utterance.onerror = function (ev) {
    try {
      if (speechCurrent !== cur || cur.cut || cur.done) return;   // 被 cut 之後的 error 忽略
      cur.done = true;
      if (speechSpeaking === cur) speechSpeaking = null;
      const err = String((ev && (ev.error || ev.errorCode)) || '');
      const isCut = (err === 'interrupted' || err === 'canceled' || err === 'cancelled');
      qlogSpeechEvent(recId, isCut ? 'cut' : 'error', k);
      speechFinish(cur, isCut ? 'cut' : 'error');
    } catch (e) {}
  };
  window.speechSynthesis.speak(utterance);
  if (cur.onDone) cur.timers.push(setTimeout(function () { speechFinish(cur, 'timeout'); }, SPEECH_START_WAIT_MS));   // 等開始的上限
}

// n3：每次 cancel 都記 cut
function cancelSpeech() {
  if (!('speechSynthesis' in window)) return;
  try {
    const cur = speechCurrent;
    if (cur && !cur.done && !cur.cut) {   // R3 Minor 1：同一句只記一次 cut
      qlogSpeechEvent(cur.recId, 'cut', cur.kind);
      cur.cut = true;
    }
    if (speechSpeaking === cur) speechSpeaking = null;
    speechFinish(cur, 'cut');             // 帶 onDone 的話通知「被切掉了」（要在 speechSynthesis.cancel() 之前）
    window.speechSynthesis.cancel();
  } catch (e) {}
}

if ('speechSynthesis' in window) {
  try {
    window.speechSynthesis.addEventListener('voiceschanged', function () {
      try {
        const n = qlogZhVoiceCount();   // F2（第三次複查）：清單還是空的時不能寫 0，要留 null
        if (n === null) return;
        if (qlogActive && qlogActive.outcome === null && qlogActive.speech.zhVoices === null) {
          qlogActive.speech.zhVoices = n;
          qlogSaveRecord(qlogActive);
        }
      } catch (e) {}
    });
  } catch (e) {}
}

/* ---------- 家長頁「📊 學習紀錄」的統計與報告文字（M4：R3 的 learningLogText 從 logic_game.html 搬來） ----------
   只列事實，不下判定：不會出現判定符號、「蒙」「猜」「可信」這類字眼、跟孩子自己的平均比快慢。
   兩個遊戲的家長頁顯示同一份報告，所以統計和報告文字都放這裡（例外：這是畫面文字，但只給家長看、不加注音）；
   畫面（選單、按鈕、複製、確認視窗）由各遊戲自己畫。讀每個遊戲的紀錄都用那個遊戲自己的 base（qlogLoad 依 base 檢查）。 */
const QLOG_SOURCE_LABEL = { first: '第一次', repeat: '重複', retry: '再挑戰', afterDemo: '示範後換題', resume: '繼續同一題', verify: '驗證題' };
const QLOG_OUTCOME_LABEL = { correct: '答對', abandoned: '中途離開', retryEnded: '再挑戰沒過', locked: '休息鎖定', replaced: '換題', away: '離開太久', unload: '關閉頁面' };
const QLOG_RATE_LABEL = { slow: '慢', normal: '普通', fast: '快' };
// 每個遊戲的報告設定（key 跟 QLOG_GAMES 一樣；報告依 QLOG_GAMES 的順序列）
//   icons：模組圖示（logic 的跟 MODULE_INFO 一致）；subLabel：子題型名稱
//   aidLabel：列在「用了哪些輔助」；ownLines：不算輔助、自己一行的操作（數串珠是蒙特梭利本來就要做的操作）
//   actionFields：有列「動作數」的組和欄位；actionMinBuild：從哪個 build 起才有記動作數（之前的紀錄不算，會被拉低）；可以是數字，或 { 欄位: build } 依欄位給
const QLOG_REPORT = {
  little_logic_qlog_v1: {
    title: '🚀 小小邏輯探險家',
    icons: { pattern: '🔮', balance: '⚖️', blocks: '🧱', maze: '🤖', deduction: '🏡', folding: '🪞', gears: '⚙️', raven: '🔲', oddone: '🔍', pipes: '🚰', topview: '🔦' },
    subLabel: {
      pattern: '圖形規律', 'balance.swap': '天平換算', 'balance.number': '數字天平',
      blocks: '積木', maze: '迷宮', deduction: '動物排排坐', folding: '摺紙打孔',
      gears: '齒輪', raven: '瑞文九宮', 'oddone.odd': '找不同', 'oddone.sort': '分類',
      'oddone.monster': '怪獸', 'pipes.live': '水管即時', 'pipes.hard': '水管挑戰',
      topview: '光影小偵探'
    },
    aidLabel: { read: '朗讀', xrayOn: '透視鏡開', xrayOff: '透視鏡關', gearHint: '齒輪提示', gearExample: '齒輪範例', topviewCount: '柱子數提示' },
    ownLines: {},
    actionLabel: { submits: '送出', resets: '重來', rotations: '轉動', commands: '指令' },
    // R1（複查）：只列跟這一組有關的欄位（照目前的掛鉤列）；不在表上的組不顯示「動作數」
    actionFields: {
      maze: ['submits', 'resets', 'commands'],
      'pipes.live': ['submits', 'resets', 'rotations'],
      'pipes.hard': ['submits', 'resets', 'rotations'],
      blocks: ['submits'], gears: ['submits'], deduction: ['submits'], 'oddone.sort': ['submits'],
      topview: ['submits', 'resets']
    },
    actionMinBuild: 2   // F1（第三次複查）：R2 寫的紀錄沒有動作掛鉤
  },
  montessori_qlog_v1: {
    title: '🧮 蒙特梭利數學樂園',
    icons: { add: '➕', sub: '➖', mul: '✖️', div: '➗', bank: '🏛️', challenge: '🏆', balance: '⚖️' },
    subLabel: {
      add: '加法', sub: '減法', mul: '乘法', div: '除法', 'bank.add': '銀行加法', 'bank.sub': '銀行減法',
      'challenge.add': '挑戰加法', 'challenge.sub': '挑戰減法', 'challenge.muldiv': '挑戰乘除', balance: '天平'
    },
    aidLabel: { read: '朗讀', verticalHint: '看直式提示' },
    ownLines: { beadCount: '數串珠' },
    actionLabel: { steps: '調整', deals: '分珠' },
    actionFields: { balance: ['steps'], div: ['deals'] },   // 天平記調整（+1／−1）、除法記分珠
    actionMinBuild: { steps: 3, deals: 6 }   // 依欄位：steps 從 build 3（M3）、deals 從 build 6（#54 S3）起才有記
  }
};

function qlogMedian(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// 一個遊戲、一位孩子的統計（只讀，不寫）；文字在 qlogReportSection
function qlogReportStats(base, childId) {
  const g = QLOG_GAMES[base], rep = QLOG_REPORT[base];
  const store = qlogLoad(base, childId);
  const recs = store.records;
  const dropped = store.dropped || {};
  const st = {
    base, kept: recs.length, skipped: store.skipped, writeFailed: !!qlogWriteFailed[qlogKey(base, childId)],
    dropped: g.subs.filter(k => Number(dropped[k]) > 0).map(k => ({ sub: k, n: dropped[k] })),   // R3 Minor 5
    subs: []
  };
  for (const sub of g.subs) {
    const rs = recs.filter(r => r.sub === sub);
    const dr = Number(dropped[sub]) || 0;
    if (!rs.length && !dr) continue;   // R3 Minor 5：保留 0 筆但有刪過的組也要列
    const done = rs.filter(r => r.outcome !== null);   // M1：進行中只算在「進行中」那一欄
    const src = {}, out = {}, aid = {}, own = {};
    for (const r of rs) { const o = r.outcome === null ? 'ongoing' : r.outcome; out[o] = (Number(out[o]) || 0) + 1; }
    for (const r of done) {
      src[r.source] = (Number(src[r.source]) || 0) + 1;
      const add = (k, n) => { const m = (k in rep.ownLines) ? own : aid; m[k] = (Number(m[k]) || 0) + n; };   // 數串珠不算輔助
      if (r.aidCounts && typeof r.aidCounts === 'object') for (const k in r.aidCounts) add(k, Number(r.aidCounts[k]) || 0);
      else for (const a of (Array.isArray(r.aids) ? r.aids : [])) add(a, 1);
    }
    const firsts = done.filter(r => r.source === 'first');
    const ps = done.filter(r => typeof r.p === 'number' && isFinite(r.p)).map(r => r.p);   // p 是 null（天平按過 +1／−1、只用 +1／−1）就不算
    // M2：用作答當下的 off；off 不是數字的（R2 舊紀錄、數學樂園 build 1）不算進中位數
    const t1 = done.filter(r => r.firstAnswer && Number.isFinite(r.firstAnswer.off)).map(r => r.firstAnswer.dt - r.firstAnswer.off);
    const during = done.filter(r => r.answeredDuringPrompt);
    const fields = rep.actionFields[sub] || null;   // R1（複查）
    let actDone = null, act = null;
    if (fields) {
      // actionMinBuild 可以是數字（整個遊戲一個），或 { 欄位: build }（依欄位；沒列到的欄位不篩）
      const minB = f => typeof rep.actionMinBuild === 'object' && rep.actionMinBuild ? (Number(rep.actionMinBuild[f]) || 0) : rep.actionMinBuild;
      act = {};
      actDone = [];
      // R2（複查）：這些紀錄的每一筆都要算進去；actions 是 null 或缺欄位就當成 0
      for (const f of fields) {
        const ds = done.filter(r => Number(r.build) >= minB(f));
        if (ds.length > actDone.length) actDone = ds;   // actN：任一欄位有紀錄就算有（單欄位的組跟以前相同）
        act[f] = qlogMedian(ds.map(r => (r.actions && typeof r.actions[f] === 'number') ? r.actions[f] : 0));
      }
    }
    const minNum = done.filter(r => typeof r.minActions === 'number' && isFinite(r.minActions)).map(r => r.minActions);
    const minSteps = done.filter(r => r.minActions && typeof r.minActions === 'object' && Number.isFinite(r.minActions.steps)).map(r => r.minActions.steps);
    const minTurns = done.filter(r => r.minActions && typeof r.minActions === 'object' && Number.isFinite(r.minActions.turns)).map(r => r.minActions.turns);
    st.subs.push({
      sub, kept: rs.length, dropped: dr, src, out, aid, own,
      firsts: firsts.length, firstOk: firsts.filter(r => r.firstAnswer && r.firstAnswer.ok).length,
      firstStepper: firsts.filter(r => r.form === 'stepper').length,   // 天平只用 +1／−1 調到平衡：沒有「第一次作答」
      p: ps.length ? qlogMedian(ps) : null,
      t1: t1.length ? qlogMedian(t1) : null,
      during: during.length,
      rates: during.map(r => r.answeredDuringPromptRate || (r.promptSpeech && r.promptSpeech.rateSetting) || (r.speech && r.speech.rateSetting)),
      fields, actN: actDone ? actDone.length : 0, act,
      minNum: minNum.length ? qlogMedian(minNum) : null,
      minSteps: minSteps.length ? qlogMedian(minSteps) : null,
      minTurns: qlogMedian(minTurns),
      leaks: done.reduce((n, r) => n + (Array.isArray(r.leaks) ? r.leaks.length : 0), 0)
    });
  }
  return st;
}

function qlogDist(map, labels) {
  const parts = Object.keys(labels).filter(k => map[k]).map(k => labels[k] + ' ' + map[k]);
  return parts.length ? parts.join('／') : '無';
}
function qlogP(p) {
  const inv = 1 / p;
  return Math.abs(inv - Math.round(inv)) < 1e-9 ? '1/' + Math.round(inv) : (Math.round(p * 1000) / 1000);
}
function qlogSec(ms) { return (Math.round(ms / 100) / 10) + ' 秒'; }   // dt 是毫秒

// 一個遊戲那一段的文字（一行一個元素）
function qlogReportSection(st) {
  const rep = QLOG_REPORT[st.base];
  const lab = sub => rep.subLabel[sub] || sub;
  const L = [];
  L.push(rep.title + '（保留 ' + st.kept + ' 筆）');
  L.push('略過 ' + st.skipped + ' 筆' + (st.writeFailed ? '；這位孩子的紀錄寫不進去（空間不足）' : ''));
  const dp = st.dropped.map(d => lab(d.sub) + ' ' + d.n);
  if (!st.kept) { L.push('還沒有紀錄。' + (dp.length ? '自動刪掉：' + dp.join('／') : '')); return L; }
  for (const s of st.subs) {
    const icon = rep.icons[s.sub.split('.')[0]];
    L.push('');
    L.push((icon ? icon + ' ' : '') + lab(s.sub) + '：保留 ' + s.kept + ' 筆／自動刪掉 ' + s.dropped + ' 筆');
    L.push('  來源：' + qlogDist(s.src, QLOG_SOURCE_LABEL));
    L.push('  結果：' + qlogDist(s.out, QLOG_OUTCOME_LABEL) + (s.out.ongoing ? '／進行中 ' + s.out.ongoing : ''));
    L.push('  第一次遇到的題目中，第一次就答對：' + s.firstOk + ' 題（第一次遇到的共 ' + s.firsts + ' 題）');
    if (s.firstStepper) L.push('  （其中 ' + s.firstStepper + ' 題是只用 +1／−1 調到平衡，沒有點選答案）');
    if (s.p !== null) L.push('  隨機作答的答對機率（中位數）：' + qlogP(s.p));
    if (s.t1 !== null) L.push('  第一次作答前的時間（中位數，已扣掉離開畫面的時間）：' + qlogSec(s.t1));
    if (s.during) {
      const rates = Array.from(new Set(s.rates.map(k => QLOG_RATE_LABEL[k] || '?')));
      L.push('  題目還在朗讀時就作答：' + s.during + ' 題（當時朗讀速度：' + rates.join('、') + '）');
    }
    const aids = Object.keys(s.aid);
    L.push('  用了哪些輔助：' + (aids.length ? aids.map(k => (rep.aidLabel[k] || k) + ' ' + s.aid[k]).join('／') : '無'));
    for (const k in rep.ownLines) if (s.own[k]) L.push('  ' + rep.ownLines[k] + '：' + s.own[k] + ' 次');
    if (s.fields) {   // R1（複查）：其他組不顯示這一行
      const ap = s.fields.map(k => (rep.actionLabel[k] || k) + ' ' + s.act[k]);
      const minTxt = s.minNum !== null ? s.minNum : (s.minSteps !== null ? s.minSteps + ' 步／' + s.minTurns + ' 轉' : '');
      L.push('  動作數（中位數）：' + (s.actN ? ap.join('／') : '無') + (minTxt ? '；最少需要 ' + minTxt : ''));
    }
    if (s.leaks) L.push('  水管漏水：' + s.leaks + ' 次');
  }
  return L;
}

// scope：'this' = 這個遊戲（qlogConfig.base）、'both' = 兩個遊戲
function qlogReportBases(scope) { return scope === 'both' ? Object.keys(QLOG_GAMES) : [qlogConfig.base]; }

// 家長頁的報告：name 由遊戲給（顯示名稱）；兩個遊戲各一段，依 QLOG_GAMES 的順序
function qlogReportText(childId, name, scope) {
  const L = ['📊 ' + name + ' 的學習紀錄'];
  for (const base of qlogReportBases(scope)) { L.push(''); L.push(...qlogReportSection(qlogReportStats(base, childId))); }
  return L.join('\n');
}

// 複製原始資料：一個遊戲 → 那個 key 的內容（跟 R3 一樣）；兩個遊戲 → { key: 內容 }
function qlogRawText(childId, scope) {
  const parse = raw => { try { return JSON.parse(raw); } catch (e) { return raw; } };
  const bases = qlogReportBases(scope);
  if (bases.length === 1) {
    const raw = localStorage.getItem(qlogKey(bases[0], childId)) || '';
    try { return JSON.stringify(JSON.parse(raw), null, 1); } catch (e) { return raw; }
  }
  const all = {};
  for (const base of bases) { const k = qlogKey(base, childId); const raw = localStorage.getItem(k); all[k] = raw === null ? null : parse(raw); }
  return JSON.stringify(all, null, 1);
}

// 清空一位孩子的紀錄（只動這位孩子、選到的遊戲）；沒有這個 key 就不建立。全部寫成功才回傳 true
function qlogClearChild(childId, scope) {
  let ok = true;
  for (const base of qlogReportBases(scope)) {
    const key = qlogKey(base, childId);
    if (localStorage.getItem(key) === null) continue;
    const store = qlogLoad(base, childId);
    store.records = []; store.dropped = {}; store.skipped = 0;
    try { localStorage.setItem(key, JSON.stringify(store)); } catch (e) { ok = false; }
  }
  return ok;
}
