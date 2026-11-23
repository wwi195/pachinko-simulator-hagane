'use strict';

// 牙13 の確率・振り分け。DOMに依存しない純粋なロジックだけを置く。
// 数値の出典と決め方は docs/spec.md を参照。

// ---- 遊技条件 ----
// 等価（4円/玉）固定。1000円=250玉。
const YEN_PER_BALL = 4;
const SPIN_RATE_OPTIONS = [10, 13, 15.4, 17, 20];
const DEFAULT_SPIN_RATE = 15.4; // ボーダー（docs/spec.md）

function calcSpinCost(spinRate) {
  return 250 / spinRate;
}

// 表示出玉 → 実際の獲得球。1玉入れて賞球が返るので、1カウントあたり (賞球−1) 個だけ増える。
// 1000個ボーナスは 10個賞球×10カウント×10R → 9/10（1000→900）。
// それ以外（300・1500・6000・7500・9000）は 15個賞球×10カウント → 14/15（1500→1400、300→280）。
function toActualBalls(nominal) {
  if (nominal === 1000) return 900;
  return nominal - nominal / 15;
}

// ---- 通常時 ----
// 合算 1/349.99 ＝ 図柄揃い（チャージ昇格込み）＋ チャージ 1/1749.97
const P_TOTAL_HIT = 1 / 349.99;
const P_CHARGE = 1 / 1749.97;
const P_ZUGARA = P_TOTAL_HIT - P_CHARGE; // 約1/437.48
const P_NORMAL_HIT = P_TOTAL_HIT;

// 先示唆：図柄揃いは必ず先示唆から来る（チャージは先示唆なしでそのまま出る）。モードで当選率（信頼度）を選べる
// アツ牙モード 45%（初期値）／先牙モード 25%／先祝モード 100%（先示唆が出れば必ず当たり）
const FLASH_OPTIONS = ['45', '25', '100'];
const DEFAULT_FLASH = '45';
const FLASH_MODE_NAMES = { '45': 'アツ牙モード', '25': '先牙モード', '100': '先祝モード' };

function flashConfidence(option) {
  return Number(option);
}

// 外れなのに先示唆が出る確率（先示唆からの当たり＝図柄揃い ÷ 先示唆 が当選率になるように）
function falseFlashProbability(option) {
  const c = flashConfidence(option);
  return P_ZUGARA * ((100 - c) / c);
}

// 通常時1回転：'hit' / 'false_flash' / 'miss'
function spinNormal(flashOption) {
  const r = Math.random();
  if (r < P_NORMAL_HIT) return 'hit';
  if (r < P_NORMAL_HIT + falseFlashProbability(flashOption)) return 'false_flash';
  return 'miss';
}

// 当たりの種類：'zugara'（図柄揃い → バトル）/ 'charge'（2R 300個 → 通常へ。CZには入らない）
function rollNormalHitType() {
  return Math.random() < P_ZUGARA / P_TOTAL_HIT ? 'zugara' : 'charge';
}

// ---- バトル（図柄揃い後） ----
// 勝利 50%：ラッシュへ（1500 or 1000個・半々）／ 敗北：1000個 → CZ
const BATTLE_WIN = 0.5;
const CHARGE_BALLS = 300;
const BATTLE_LOSE_BALLS = 1000;

// { win, balls }
function rollBattle() {
  if (Math.random() < BATTLE_WIN) {
    return { win: true, balls: Math.random() < 0.5 ? 1500 : 1000 };
  }
  return { win: false, balls: BATTLE_LOSE_BALLS };
}

// ---- ラッシュ（ST130回・継続率75%） ----
const RUSH_ST = 130;
const RUSH_CONTINUE = 0.75;
// 130回のうちに当たる確率が75%になる1回転あたりの確率（約1/94.3）
const P_RUSH_HIT = 1 - Math.pow(1 - RUSH_CONTINUE, 1 / RUSH_ST);

function spinRush() {
  return Math.random() < P_RUSH_HIT ? 'hit' : 'miss';
}

// ラッシュ中の当たり：45%で 6000 or 7500個（半々）、55%で1500個
const RUSH_BIG_SHARE = 0.45;

function rollRushBonus() {
  if (Math.random() < RUSH_BIG_SHARE) {
    return { big: true, balls: Math.random() < 0.5 ? 6000 : 7500 };
  }
  return { big: false, balls: 1500 };
}

// ---- CZ（40回転・電サポなし・1/199） ----
const CZ_SPINS = 40;
const P_CZ_HIT = 1 / 199;

function spinCz() {
  return Math.random() < P_CZ_HIT ? 'hit' : 'miss';
}

// CZ当選時の振り分け（％）。to: 'rush' ならラッシュ、'cz' ならCZ（40回）にもう一度
const CZ_HIT_TABLE = [
  { balls: 9000, to: 'rush', pct: 14.2 },
  { balls: 9000, to: 'cz', pct: 28.8 },
  { balls: 1500, to: 'rush', pct: 0.3 },
  { balls: 1000, to: 'rush', pct: 2.0 },
  { balls: 1000, to: 'cz', pct: 43.3 },
  { balls: 300, to: 'cz', pct: 11.4 },
];

function rollCzBonus() {
  const r = Math.random() * 100;
  let acc = 0;
  for (const row of CZ_HIT_TABLE) {
    acc += row.pct;
    if (r < acc) return { balls: row.balls, to: row.to, pct: row.pct };
  }
  const last = CZ_HIT_TABLE[CZ_HIT_TABLE.length - 1];
  return { balls: last.balls, to: last.to, pct: last.pct };
}

// CZ40回のうちに当たる確率（約18.3%）
function czHitProbability() {
  return 1 - Math.pow(1 - P_CZ_HIT, CZ_SPINS);
}

// CZに入ったあと、最終的にラッシュへ行ける確率（CZ→CZのループ込み）
function czToRushProbability() {
  const q = czHitProbability();
  const toRush = CZ_HIT_TABLE.filter((r) => r.to === 'rush').reduce((s, r) => s + r.pct, 0) / 100;
  return (q * toRush) / (1 - q * (1 - toRush));
}

// 初当たり1回がラッシュに入る確率（バトル勝利＋バトル敗北後のCZ経由）。チャージはCZに入らず通常へ
function rushEntryProbability() {
  const zugaraShare = P_ZUGARA / P_TOTAL_HIT;
  const direct = zugaraShare * BATTLE_WIN;
  const toCz = zugaraShare * (1 - BATTLE_WIN);
  return direct + toCz * czToRushProbability();
}

// 初当たり1回がラッシュに入らずに終わる確率
const P_NO_RUSH_FROM_HIT = 1 - rushEntryProbability();

// 初当たりまでの回転数の確率
function hitIntervalProbability(n) {
  return {
    atLeast: Math.pow(1 - P_NORMAL_HIT, n - 1),
    within: 1 - Math.pow(1 - P_NORMAL_HIT, n),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    YEN_PER_BALL,
    SPIN_RATE_OPTIONS,
    DEFAULT_SPIN_RATE,
    calcSpinCost,
    toActualBalls,
    P_TOTAL_HIT,
    P_CHARGE,
    P_ZUGARA,
    P_NORMAL_HIT,
    FLASH_OPTIONS,
    DEFAULT_FLASH,
    FLASH_MODE_NAMES,
    flashConfidence,
    falseFlashProbability,
    spinNormal,
    rollNormalHitType,
    BATTLE_WIN,
    CHARGE_BALLS,
    BATTLE_LOSE_BALLS,
    rollBattle,
    RUSH_ST,
    RUSH_CONTINUE,
    P_RUSH_HIT,
    spinRush,
    RUSH_BIG_SHARE,
    rollRushBonus,
    CZ_SPINS,
    P_CZ_HIT,
    spinCz,
    CZ_HIT_TABLE,
    rollCzBonus,
    czHitProbability,
    czToRushProbability,
    rushEntryProbability,
    P_NO_RUSH_FROM_HIT,
    hitIntervalProbability,
  };
}
