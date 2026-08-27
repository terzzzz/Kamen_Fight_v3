/**
 * In-Browser Headless Match Simulator
 * Path: js/simulator.js
 */

let simulatorMovesCache = null;

async function loadSimulatorMoves() {
  if (simulatorMovesCache) return simulatorMovesCache;
  if (window.gameState && window.gameState.p1Moves) {
    return {
      ichigo: window.gameState.p1Moves,
      nigo: window.gameState.p2Moves,
      v3: window.gameState.p1Moves
    };
  }
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

function getMoveRangePrioritySim(move) {
  if (!move) return 1;
  const range = (move.rangeType || 'MELEE').toUpperCase();
  if (range === 'PROJECTILE') return 3;
  if (range === 'REACH' || range === 'ROPE' || range === 'MID_RANGE') return 2;
  return 1;
}

function selectCPUMoveSim(cpuPlayer, opponentPlayer, movesData, difficulty) {
  if (cpuPlayer.isFainted) return 'DO_NOTHING';

  let availableMoves = {};
  Object.keys(movesData).forEach(key => {
    const m = movesData[key];
    if (m && typeof m === 'object' && (m.chiCost || 0) <= cpuPlayer.chi) {
      availableMoves[key] = m;
    }
  });

  if (Object.keys(availableMoves).length === 0) return 'D+J';

  if (typeof window.selectCPUMove === 'function') {
    return window.selectCPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty);
  }

  const keys = Object.keys(availableMoves);
  return keys[Math.floor(Math.random() * keys.length)] || 'D+J';
}

async function runBatchSimulation(p1Rider, p2Rider, count = 20, p1Difficulty = 'normal', p2Difficulty = 'normal') {
  const allMoves = await loadSimulatorMoves();
  const rules = window.COMBAT_RULES || {
    FAINT_THRESHOLD: 100,
    ROUND_RECOVERY: 13,
    FAINT_PENALTY_IDLE_GUARD: 5,
    MAX_CHI: 16,
    OFFENSIVE_TYPES: ['MELEE', 'PROJECTILE', 'SPECIAL', 'FINISHER', 'PHYSICAL']
  };

  const p1Moves = allMoves[p1Rider.id] || allMoves['ichigo'] || {};
  const p2Moves = allMoves[p2Rider.id] || allMoves['ichigo'] || {};

  const stats = {
    totalMatches: count,
    p1Wins: 0, p2Wins: 0, draws: 0, totalRounds: 0,
    p1EndLpSum: 0, p1EndChiSum: 0, p2EndLpSum: 0, p2EndChiSum: 0
  };

  const hpMultiplier = (window.GAME_CONFIG && window.GAME_CONFIG.HARD_CPU_HP_MULTIPLIER) || 1.30;
  const realGameState = window.gameState;

  try {
    for (let matchIndex = 0; matchIndex < count; matchIndex++) {
      let p1MaxLp = p1Rider.maxLp || 1850;
      let p2MaxLp = p2Rider.maxLp || 2000;

      if (p1Difficulty === 'hard') p1MaxLp = Math.floor(p1MaxLp * hpMultiplier);
      if (p2Difficulty === 'hard') p2MaxLp = Math.floor(p2MaxLp * hpMultiplier);

      let p1 = {
        id: p1Rider.id || 'ichigo', name: p1Rider.name || 'P1', maxLp: p1MaxLp, lp: p1MaxLp,
        chi: rules.STARTING_CHI || 8, maxChi: rules.MAX_CHI || 16, faintMeter: 0, activeBuffs: [],
        airborneTicks: 0, airborneAppliedRound: 0, activeChargePercent: 100, isFainted: false,
        willBeFaintedNextRound: false, tookCleanHitThisRound: false, isCPU: true
      };

      let p2 = {
        id: p2Rider.id || 'nigo', name: p2Rider.name || 'P2', maxLp: p2MaxLp, lp: p2MaxLp,
        chi: rules.STARTING_CHI || 8, maxChi: rules.MAX_CHI || 16, faintMeter: 0, activeBuffs: [],
        airborneTicks: 0, airborneAppliedRound: 0, activeChargePercent: 100, isFainted: false,
        willBeFaintedNextRound: false, tookCleanHitThisRound: false, isCPU: true
      };

      window.gameState = {
        p1: p1,
        p2: p2,
        p1Moves: p1Moves,
        p2Moves: p2Moves,
        roundCounter: 1,
        matchConfig: { p1Difficulty, p2Difficulty }
      };

      let roundCounter = 1;
      const MAX_ROUNDS_LIMIT = 50;

      while (p1.lp > 0 && p2.lp > 0 && roundCounter <= MAX_ROUNDS_LIMIT) {
        window.gameState.roundCounter = roundCounter;
        p1.roundCounter = roundCounter;
        p2.roundCounter = roundCounter;

        let p1MoveKey = selectCPUMoveSim(p1, p2, p1Moves, p1Difficulty);
        let p2MoveKey = selectCPUMoveSim(p2, p1, p2Moves, p2Difficulty);

        const defaultMove = { name: 'Do Nothing', type: 'IDLE', baseDamage: 0, chiCost: 0 };
        const m1 = p1Moves[p1MoveKey] || defaultMove;
        const m2 = p2Moves[p2MoveKey] || defaultMove;

        let p1IsIdle = p1MoveKey === 'DO_NOTHING';
        let p2IsIdle = p2MoveKey === 'DO_NOTHING';
        let p1GoesFirst = false;

        let p1IsS = p1MoveKey.startsWith('S');
        let p2IsS = p2MoveKey.startsWith('S');
        let p1IsD = p1MoveKey.startsWith('D');
        let p2IsD = p2MoveKey.startsWith('D');

        let p1RangePriority = getMoveRangePrioritySim(m1);
        let p2RangePriority = getMoveRangePrioritySim(m2);

        // SPEED PRIORITY MATCHING COMBAT.JS (Range Priority -> Move Type -> Charge Speed)
        if (!p1IsIdle && p2IsIdle) p1GoesFirst = true;
        else if (p1IsIdle && !p2IsIdle) p1GoesFirst = false;
        else if (p1RangePriority > p2RangePriority) p1GoesFirst = true;
        else if (p1RangePriority < p2RangePriority) p1GoesFirst = false;
        else if (p1IsS && p2IsD) p1GoesFirst = true;
        else if (p1IsD && p2IsS) p1GoesFirst = false;
        else {
          let p1Elapsed = (p1.activeChargePercent || 100) * 0.025;
          let p2Elapsed = (p2.activeChargePercent || 100) * 0.025;
          if (p1Elapsed < p2Elapsed) p1GoesFirst = true;
          else if (p1Elapsed > p2Elapsed) p1GoesFirst = false;
          else p1GoesFirst = Math.random() < 0.5;
        }

        let atk1 = p1GoesFirst ? p1 : p2;
        let def1 = p1GoesFirst ? p2 : p1;
        let move1 = p1GoesFirst ? m1 : m2;
        let key1 = p1GoesFirst ? p1MoveKey : p2MoveKey;

        let atk2 = p1GoesFirst ? p2 : p1;
        let def2 = p1GoesFirst ? p1 : p2;
        let move2 = p1GoesFirst ? m2 : m1;
        let key2 = p1GoesFirst ? p2MoveKey : p1MoveKey;

        let def1WasInterrupted = false;

        // EXECUTE TURN
        if (move1.type !== 'IDLE' && key1 !== 'DO_NOTHING') {
          atk1.chi = Math.max(0, atk1.chi - (move1.chiCost || 0));
          if (move1.type !== 'DEFENSE') {
            let dmg = Math.floor((move1.baseDamage || 0) * Math.sqrt(0.5 + 0.5 * ((atk1.activeChargePercent || 100) / 100)));
            def1.lp = Math.max(0, def1.lp - dmg);
            if (dmg > 0) def1WasInterrupted = true;
            if (key1.startsWith('D')) atk1.chi = Math.min(rules.MAX_CHI, atk1.chi + 2);
          }
        }

        if (def2.lp > 0 && !atk2.isFainted && !def1WasInterrupted && move2.type !== 'IDLE' && key2 !== 'DO_NOTHING') {
          atk2.chi = Math.max(0, atk2.chi - (move2.chiCost || 0));
          if (move2.type !== 'DEFENSE') {
            let dmg = Math.floor((move2.baseDamage || 0) * Math.sqrt(0.5 + 0.5 * ((atk2.activeChargePercent || 100) / 100)));
            def2.lp = Math.max(0, def2.lp - dmg);
            if (key2.startsWith('D')) atk2.chi = Math.min(rules.MAX_CHI, atk2.chi + 2);
          }
        }

        if (p1.lp <= 0 || p2.lp <= 0) break;
        roundCounter++;
      }

      stats.totalRounds += Math.min(roundCounter, MAX_ROUNDS_LIMIT);
      stats.p1EndLpSum += Math.max(0, p1.lp);
      stats.p1EndChiSum += p1.chi;
      stats.p2EndLpSum += Math.max(0, p2.lp);
      stats.p2EndChiSum += p2.chi;

      if (p1.lp > 0 && p2.lp <= 0) stats.p1Wins++;
      else if (p2.lp > 0 && p1.lp <= 0) stats.p2Wins++;
      else stats.draws++;
    }
  } finally {
    window.gameState = realGameState;
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

if (typeof window !== 'undefined') {
  window.runBatchSimulation = runBatchSimulation;
}
