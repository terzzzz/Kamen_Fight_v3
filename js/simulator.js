/**
 * Headless Match Simulator Engine
 * Path: js/simulator.js
 */

// Cache loaded move data
let cachedSimulatorMoves = null;

async function loadSimulatorMoves() {
  if (cachedSimulatorMoves) return cachedSimulatorMoves;

  try {
    const res = await fetch('data/moves.json');
    if (res.ok) {
      cachedSimulatorMoves = await res.json();
      return cachedSimulatorMoves;
    }
  } catch (e) {
    console.warn("Simulator: Could not load data/moves.json, using fallback roster.");
  }

  // Fallback if fetch fails or running offline
  const fallback = typeof FALLBACK_ICHIGO_MOVES !== 'undefined' ? FALLBACK_ICHIGO_MOVES : {};
  cachedSimulatorMoves = {
    'ichigo': fallback,
    'nigo': fallback,
    'v3': fallback
  };
  return cachedSimulatorMoves;
}

function getSimMove(moves, key) {
  if (moves && moves[key]) return moves[key];
  // Offline / missing key fallback
  return {
    name: "Standard Punch",
    type: "PHYSICAL",
    chiCost: 0,
    baseDamage: 66,
    hitChance: 85
  };
}

function selectCPUMoveSim(cpu, opp, moves, difficulty) {
  if (cpu.isFainted) return 'DO_NOTHING';

  // Filter available moves by Chi cost
  const availableKeys = Object.keys(moves || {}).filter(k => {
    const m = moves[k];
    return m && (m.chiCost || 0) <= cpu.chi;
  });

  if (availableKeys.length === 0) return 'D+J';

  // Prioritize offensive moves during simulation
  const offensiveKeys = availableKeys.filter(k => !k.startsWith('A+'));
  const choices = offensiveKeys.length > 0 ? offensiveKeys : availableKeys;

  return choices[Math.floor(Math.random() * choices.length)];
}

async function runBatchSimulation(p1Rider, p2Rider, count = 20, p1Difficulty = 'normal', p2Difficulty = 'normal') {
  const allMoves = await loadSimulatorMoves();
  const rules = window.COMBAT_RULES || {
    STARTING_CHI: 8,
    MAX_CHI: 16,
    FAINT_THRESHOLD: 100,
    HIT_BUILDUP: 25,
    ROUND_RECOVERY: 13
  };

  const p1Moves = (allMoves && allMoves[p1Rider.id]) || allMoves['ichigo'] || {};
  const p2Moves = (allMoves && allMoves[p2Rider.id]) || allMoves['ichigo'] || {};

  const stats = {
    totalMatches: count,
    p1Wins: 0,
    p2Wins: 0,
    draws: 0,
    totalRounds: 0,
    p1EndLpSum: 0,
    p2EndLpSum: 0,
    p1EndChiSum: 0,
    p2EndChiSum: 0
  };

  for (let matchIndex = 0; matchIndex < count; matchIndex++) {
    let p1 = {
      id: p1Rider.id || 'ichigo',
      name: p1Rider.name || 'P1',
      maxLp: p1Rider.maxLp || 1850,
      lp: p1Rider.maxLp || 1850,
      chi: rules.STARTING_CHI || 8,
      maxChi: rules.MAX_CHI || 16,
      faintMeter: 0,
      isFainted: false
    };

    let p2 = {
      id: p2Rider.id || 'nigo',
      name: p2Rider.name || 'P2',
      maxLp: p2Rider.maxLp || 2000,
      lp: p2Rider.maxLp || 2000,
      chi: rules.STARTING_CHI || 8,
      maxChi: rules.MAX_CHI || 16,
      faintMeter: 0,
      isFainted: false
    };

    let roundCounter = 1;
    const MAX_ROUNDS = 40;

    while (p1.lp > 0 && p2.lp > 0 && roundCounter <= MAX_ROUNDS) {
      // Chi regeneration per round
      if (roundCounter > 1) {
        p1.chi = Math.min(p1.maxChi, p1.chi + 1);
        p2.chi = Math.min(p2.maxChi, p2.chi + 1);
      }

      let p1Key = selectCPUMoveSim(p1, p2, p1Moves, p1Difficulty);
      let p2Key = selectCPUMoveSim(p2, p1, p2Moves, p2Difficulty);

      let m1 = getSimMove(p1Moves, p1Key);
      let m2 = getSimMove(p2Moves, p2Key);

      // Deduct Chi costs
      p1.chi = Math.max(0, p1.chi - (m1.chiCost || 0));
      p2.chi = Math.max(0, p2.chi - (m2.chiCost || 0));

      // Resolve P1 Attack
      if (m1.type !== 'IDLE' && m1.type !== 'DEFENSE') {
        let hitRoll = Math.random() * 100 < (m1.hitChance || 80);
        if (hitRoll) {
          let dmg = Math.floor((m1.baseDamage || 60) * (0.85 + Math.random() * 0.30));
          p2.lp = Math.max(0, p2.lp - dmg);
          
          if (p1Key.startsWith('D')) p1.chi = Math.min(p1.maxChi, p1.chi + 2);
        }
      }

      // Resolve P2 Attack (if still standing)
      if (p2.lp > 0 && m2.type !== 'IDLE' && m2.type !== 'DEFENSE') {
        let hitRoll = Math.random() * 100 < (m2.hitChance || 80);
        if (hitRoll) {
          let dmg = Math.floor((m2.baseDamage || 60) * (0.85 + Math.random() * 0.30));
          p1.lp = Math.max(0, p1.lp - dmg);

          if (p2Key.startsWith('D')) p2.chi = Math.min(p2.maxChi, p2.chi + 2);
        }
      }

      roundCounter++;
    }

    stats.totalRounds += Math.min(roundCounter, MAX_ROUNDS);
    stats.p1EndLpSum += p1.lp;
    stats.p2EndLpSum += p2.lp;
    stats.p1EndChiSum += p1.chi;
    stats.p2EndChiSum += p2.chi;

    if (p1.lp > 0 && p2.lp <= 0) {
      stats.p1Wins++;
    } else if (p2.lp > 0 && p1.lp <= 0) {
      stats.p2Wins++;
    } else {
      stats.draws++;
    }
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
    p1AvgLpLeft: Math.round(stats.p1EndLpSum / count),
    p2AvgLpLeft: Math.round(stats.p2EndLpSum / count),
    p1AvgChiLeft: (stats.p1EndChiSum / count).toFixed(1),
    p2AvgChiLeft: (stats.p2EndChiSum / count).toFixed(1),
    avgRounds: (stats.totalRounds / count).toFixed(1)
  };
}

window.runBatchSimulation = runBatchSimulation;
