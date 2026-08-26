/**
 * In-Browser Headless Match Simulator
 * Path: js/simulator.js
 */

function runBatchSimulation(p1Rider, p2Rider, count = 20, difficulty = 'normal') {
  const allMoves = window.gameState?.allMoves || {};
  const p1Moves = allMoves[p1Rider.id] || {};
  const p2Moves = allMoves[p2Rider.id] || {};

  const stats = {
    totalMatches: count,
    p1Wins: 0,
    p2Wins: 0,
    draws: 0,
    totalRounds: 0,
    p1EndLpSum: 0,
    p1EndChiSum: 0,
    p2EndLpSum: 0,
    p2EndChiSum: 0
  };

  const hpMultiplier = GAME_CONFIG.HARD_CPU_HP_MULTIPLIER || 1.30;

  for (let i = 0; i < count; i++) {
    // Initialize headless match state
    let p1Lp = p1Rider.maxLp || 1850;
    let p2Lp = p2Rider.maxLp || 2000;
    if (difficulty === 'hard') {
      p1Lp = Math.floor(p1Lp * hpMultiplier);
      p2Lp = Math.floor(p2Lp * hpMultiplier);
    }

    let p1State = { id: p1Rider.id, name: p1Rider.name, maxLp: p1Lp, lp: p1Lp, chi: 8, maxChi: 16, faintMeter: 0, activeBuffs: [], airborneTicks: 0, isFainted: false };
    let p2State = { id: p2Rider.id, name: p2Rider.name, maxLp: p2Lp, lp: p2Lp, chi: 8, maxChi: 16, faintMeter: 0, activeBuffs: [], airborneTicks: 0, isFainted: false };

    let rounds = 0;
    const maxRounds = 30;

    while (p1State.lp > 0 && p2State.lp > 0 && rounds < maxRounds) {
      rounds++;

      // Pick CPU moves using AI Brain functions
      const p1Key = typeof selectCPUMove === 'function' ? getCPUMoveChoiceHeadless(p1State, p2State, p1Moves, difficulty) : 'D+J';
      const p2Key = typeof selectCPUMove === 'function' ? getCPUMoveChoiceHeadless(p2State, p1State, p2Moves, difficulty) : 'D+J';

      const m1 = p1Moves[p1Key] || { name: 'Punch', baseDamage: 60, chiCost: 0, type: 'PHYSICAL' };
      const m2 = p2Moves[p2Key] || { name: 'Punch', baseDamage: 60, chiCost: 0, type: 'PHYSICAL' };

      // Fast turn resolution
      executeHeadlessTurn(p1State, p2State, m1, p1Key, m2, p2Key);
    }

    // Accumulate results
    stats.totalRounds += rounds;
    stats.p1EndLpSum += Math.max(0, p1State.lp);
    stats.p1EndChiSum += p1State.chi;
    stats.p2EndLpSum += Math.max(0, p2State.lp);
    stats.p2EndChiSum += p2State.chi;

    if (p1State.lp > 0 && p2State.lp <= 0) stats.p1Wins++;
    else if (p2State.lp > 0 && p1State.lp <= 0) stats.p2Wins++;
    else stats.draws++;
  }

  return {
    p1Name: p1Rider.name,
    p2Name: p2Rider.name,
    totalMatches: count,
    p1Wins: stats.p1Wins,
    p2Wins: stats.p2Wins,
    draws: stats.draws,
    p1WinRate: ((stats.p1Wins / count) * 100).toFixed(1),
    p2WinRate: ((stats.p2Wins / count) * 100).toFixed(1),
    avgRounds: (stats.totalRounds / count).toFixed(1),
    p1AvgLpLeft: Math.round(stats.p1EndLpSum / count),
    p1AvgChiLeft: (stats.p1EndChiSum / count).toFixed(1),
    p2AvgLpLeft: Math.round(stats.p2EndLpSum / count),
    p2AvgChiLeft: (stats.p2EndChiSum / count).toFixed(1)
  };
}

function getCPUMoveChoiceHeadless(cpu, opp, moves, difficulty) {
  let avail = {};
  Object.keys(moves).forEach(k => {
    if ((moves[k].chiCost || 0) <= cpu.chi) avail[k] = moves[k];
  });
  if (cpu.id === 'v3' && typeof selectV3CPUMove === 'function') return selectV3CPUMove(cpu, opp, avail, difficulty);
  if (cpu.id === 'ichigo' && typeof selectIchigoCPUMove === 'function') return selectIchigoCPUMove(cpu, opp, avail, difficulty);
  const keys = Object.keys(avail);
  return keys[Math.floor(Math.random() * keys.length)] || 'D+J';
}

function executeHeadlessTurn(p1, p2, m1, k1, m2, k2) {
  // Deduct Chi
  p1.chi = Math.max(0, p1.chi - (m1.chiCost || 0));
  p2.chi = Math.max(0, p2.chi - (m2.chiCost || 0));

  // Determine turn order by range priority & speed
  const r1 = (m1.rangeType === 'REACH') ? 2 : 1;
  const r2 = (m2.rangeType === 'REACH') ? 2 : 1;

  let p1First = r1 > r2 || (r1 === r2 && Math.random() < 0.5);

  if (p1First) {
    p2.lp -= Math.floor((m1.baseDamage || 0) * (Math.random() * 0.2 + 0.9));
    if (p2.lp > 0) p1.lp -= Math.floor((m2.baseDamage || 0) * (Math.random() * 0.2 + 0.9));
  } else {
    p1.lp -= Math.floor((m2.baseDamage || 0) * (Math.random() * 0.2 + 0.9));
    if (p1.lp > 0) p2.lp -= Math.floor((m1.baseDamage || 0) * (Math.random() * 0.2 + 0.9));
  }

  // Basic Chi build on physicals
  if (k1.startsWith('D')) p1.chi = Math.min(16, p1.chi + 2);
  if (k2.startsWith('D')) p2.chi = Math.min(16, p2.chi + 2);
}

if (typeof window !== 'undefined') {
  window.runBatchSimulation = runBatchSimulation;
}
