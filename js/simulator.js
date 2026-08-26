/**
 * In-Browser Headless Match Simulator
 * Path: js/simulator.js
 */

let simulatorMovesCache = null;

async function loadSimulatorMoves() {
  if (simulatorMovesCache) return simulatorMovesCache;
  try {
    const res = await fetch('data/moves.json');
    if (res.ok) {
      simulatorMovesCache = await res.json();
      return simulatorMovesCache;
    }
  } catch (e) {
    console.warn("Could not load moves.json for simulator.");
  }
  return {};
}

async function runBatchSimulation(p1Rider, p2Rider, count = 20, difficulty = 'normal') {
  const allMoves = await loadSimulatorMoves();
  const p1Moves = allMoves[p1Rider.id] || {};
  const p2Moves = allMoves[p2Rider.id] || {};

  const stats = {
    p1Wins: 0, p2Wins: 0, draws: 0, totalRounds: 0,
    p1EndLpSum: 0, p1EndChiSum: 0, p2EndLpSum: 0, p2EndChiSum: 0
  };

  const hpMultiplier = (window.GAME_CONFIG && window.GAME_CONFIG.HARD_CPU_HP_MULTIPLIER) || 1.30;

  for (let i = 0; i < count; i++) {
    let p1Lp = p1Rider.maxLp || 1850;
    let p2Lp = p2Rider.maxLp || 2000;

    let p1 = { id: p1Rider.id, name: p1Rider.name, maxLp: p1Lp, lp: p1Lp, chi: 8, maxChi: 16 };
    let p2 = { id: p2Rider.id, name: p2Rider.name, maxLp: p2Lp, lp: p2Lp, chi: 8, maxChi: 16 };

    let rounds = 0;
    const maxRounds = 25;

    while (p1.lp > 0 && p2.lp > 0 && rounds < maxRounds) {
      rounds++;

      const k1 = getCPUMoveChoiceHeadless(p1, p2, p1Moves, difficulty);
      const k2 = getCPUMoveChoiceHeadless(p2, p1, p2Moves, difficulty);

      const m1 = p1Moves[k1] || { name: 'Punch', baseDamage: 120, chiCost: 0 };
      const m2 = p2Moves[k2] || { name: 'Punch', baseDamage: 120, chiCost: 0 };

      // Deduct Chi
      p1.chi = Math.max(0, p1.chi - (m1.chiCost || 0));
      p2.chi = Math.max(0, p2.chi - (m2.chiCost || 0));

      // Resolve Attacks
      p2.lp -= Math.floor((m1.baseDamage || 80) * (0.85 + Math.random() * 0.3));
      if (p2.lp > 0) {
        p1.lp -= Math.floor((m2.baseDamage || 80) * (0.85 + Math.random() * 0.3));
      }

      if (k1.startsWith('D')) p1.chi = Math.min(16, p1.chi + 2);
      if (k2.startsWith('D')) p2.chi = Math.min(16, p2.chi + 2);
    }

    stats.totalRounds += rounds;
    stats.p1EndLpSum += Math.max(0, p1.lp);
    stats.p1EndChiSum += p1.chi;
    stats.p2EndLpSum += Math.max(0, p2.lp);
    stats.p2EndChiSum += p2.chi;

    if (p1.lp > 0 && p2.lp <= 0) stats.p1Wins++;
    else if (p2.lp > 0 && p1.lp <= 0) stats.p2Wins++;
    else stats.draws++;
  }

  return {
    p1Name: p1Rider.name, p2Name: p2Rider.name, totalMatches: count,
    p1Wins: stats.p1Wins, p2Wins: stats.p2Wins, draws: stats.draws,
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
  const keys = Object.keys(avail);
  return keys[Math.floor(Math.random() * keys.length)] || 'D+J';
}

window.runBatchSimulation = runBatchSimulation;
