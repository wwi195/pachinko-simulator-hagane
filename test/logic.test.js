'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../logic.js');

function withMockRandom(values, fn) {
  const original = Math.random;
  let i = 0;
  Math.random = () => values[Math.min(i++, values.length - 1)];
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

const close = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

test('実際の獲得球：15個賞球は14/15、1000個ボーナス（10個賞球）は9/10', () => {
  assert.equal(logic.toActualBalls(1500), 1400);
  assert.equal(logic.toActualBalls(300), 280);
  assert.equal(logic.toActualBalls(9000), 8400);
  assert.equal(logic.toActualBalls(6000), 5600);
  assert.equal(logic.toActualBalls(7500), 7000);
  assert.equal(logic.toActualBalls(1000), 900);
});

test('合算 1/349.99 ＝ 図柄揃い 約1/437.48 ＋ チャージ 1/1749.97', () => {
  assert.ok(close(1 / logic.P_ZUGARA, 437.48, 0.01));
  assert.ok(close(logic.P_ZUGARA + logic.P_CHARGE, 1 / 349.99, 1e-15));
  assert.equal(logic.P_NORMAL_HIT, 1 / 349.99);
});

test('当たりの種類：約80%が図柄揃い、残りがチャージ', () => {
  assert.equal(withMockRandom([0.79], () => logic.rollNormalHitType()), 'zugara');
  assert.equal(withMockRandom([0.81], () => logic.rollNormalHitType()), 'charge');
});

test('フラッシュ信頼度：当たり ÷ (当たり＋偽フラッシュ) が選んだ信頼度になる', () => {
  for (const opt of ['25', '40']) {
    const p = logic.P_NORMAL_HIT;
    const conf = p / (p + logic.falseFlashProbability(opt));
    assert.ok(close(conf, Number(opt) / 100, 1e-12), opt);
  }
  assert.equal(logic.falseFlashProbability('EX'), 0);
});

test('バトル：勝ちは1500か1000でラッシュ、負けは1000', () => {
  assert.deepEqual(withMockRandom([0.1, 0.2], () => logic.rollBattle()), { win: true, balls: 1500 });
  assert.deepEqual(withMockRandom([0.1, 0.7], () => logic.rollBattle()), { win: true, balls: 1000 });
  assert.deepEqual(withMockRandom([0.6], () => logic.rollBattle()), { win: false, balls: 1000 });
});

test('ラッシュ：ST130回で継続率75%（1回転 約1/94.3）', () => {
  assert.ok(close(1 / logic.P_RUSH_HIT, 94.3, 0.1));
  assert.ok(close(1 - Math.pow(1 - logic.P_RUSH_HIT, 130), 0.75, 1e-12));
});

test('ラッシュの当たり：45%で6000か7500、55%で1500', () => {
  assert.deepEqual(withMockRandom([0.1, 0.2], () => logic.rollRushBonus()), { big: true, balls: 6000 });
  assert.deepEqual(withMockRandom([0.1, 0.8], () => logic.rollRushBonus()), { big: true, balls: 7500 });
  assert.deepEqual(withMockRandom([0.5], () => logic.rollRushBonus()), { big: false, balls: 1500 });
});

test('CZ：40回で約18.3%、振り分けの合計は100%', () => {
  assert.ok(close(logic.czHitProbability(), 0.183, 0.002));
  const sum = logic.CZ_HIT_TABLE.reduce((s, r) => s + r.pct, 0);
  assert.ok(close(sum, 100, 1e-9));
  assert.deepEqual(withMockRandom([0.10], () => logic.rollCzBonus()), { balls: 9000, to: 'rush', pct: 14.2 });
  assert.deepEqual(withMockRandom([0.99], () => logic.rollCzBonus()), { balls: 300, to: 'cz', pct: 11.4 });
});

test('初当たりのラッシュ突入率は 約41%（チャージはCZに入らない）', () => {
  assert.ok(close(logic.rushEntryProbability(), 0.414, 0.003));
});

test('シミュレーションでもラッシュ突入率が理論値に近い', () => {
  let rush = 0;
  const N = 40000;
  for (let i = 0; i < N; i++) {
    if (logic.rollNormalHitType() === 'charge') continue;
    if (logic.rollBattle().win) { rush++; continue; }
    let cz = true;
    while (cz) {
      let hit = false;
      for (let s = 0; s < logic.CZ_SPINS; s++) if (logic.spinCz() === 'hit') { hit = true; break; }
      if (!hit) { cz = false; break; }
      const b = logic.rollCzBonus();
      if (b.to === 'rush') { rush++; cz = false; }
    }
  }
  assert.ok(close(rush / N, logic.rushEntryProbability(), 0.015));
});
