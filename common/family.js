/* =========================================================
   common/family.js：兩個遊戲共用的程式（孩子名單、儲存、護眼狀態、家長算式）
   原始碼在這裡；用 tools/build_common.py 嵌進各遊戲的 HTML（FAMILY:START～FAMILY:END 區塊）。
   規則：不碰 DOM、不放畫面文字、初始化時不呼叫 Math.random()。
   遊戲才有的東西用 familyHooks 接；這裡的預設值都不做事。
   ========================================================= */

const familyHooks = {
  freeSpace: () => {}   // 儲存空間不夠時，讓遊戲刪掉自己的舊資料（邏輯遊戲：qlogFreeSpace）
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
            'montessori_stickers', 'montessori_wardrobe', 'montessori_checkin'], id: ['montessori_qlog_v1'] }
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
