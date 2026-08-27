/**
 * Headless Match Simulator Engine
 * Path: js/simulator.js
 */

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
  if (key === 'DO_NOTHING') return { name: "Do Nothing", type: "IDLE", chiCost: 0, baseDamage: 0, hitChance: 100 };
  return { name: "Standard Punch", type: "PHYSICAL", chiCost: 0, baseDamage: 66, hitChance: 85 };
}

function selectCPUMoveSim(cpu, opp, moves, difficulty) {
  if (cpu.isFainted) return 'DO_NOTHING';

  const diff = String(difficulty || 'normal').toLowerCase();

  // Filter moves affordable with current Chi
  const availableKeys = Object.keys(moves || {}).filter(k => (moves[k]?.chiCost || 0) <= cpu.chi);
  if (availableKeys.length === 0) return 'D+J';

  const offensiveKeys = availableKeys.filter(k => (moves[k].baseDamage || 0) > 0 && !k.startsWith('A+'));
  const specialKeys = availableKeys.filter(k => k.startsWith('S+') && (moves[k].baseDamage || 0) > 0);
  const physicalKeys = availableKeys.filter(k => k.startsWith('D+') && (moves[k].baseDamage || 0) > 0);
  const defenseKeys = availableKeys.filter(k => k.startsWith('A+'));

  // HARD AI: Optimal move evaluation & high-value special usage
  if (diff === 'hard') {
    if (specialKeys.length > 0 && cpu.chi >= 4 && Math.random() < 0.85) {
      specialKeys.sort((a, b) => ((moves[b].baseDamage || 0) * (moves[b].hitChance || 80)) - ((moves[a].baseDamage || 0) * (moves[a].hitChance || 80)));
      return specialKeys[0];
    }
    if (offensiveKeys.length > 0) {
      offensiveKeys.sort((a, b) => ((moves[b].baseDamage || 0) * (moves[b].hitChance || 80)) - ((moves[a].baseDamage || 0) * (moves[a].hitChance || 80)));
      return offensiveKeys[0];
    }
    return 'D+J';
  }

  // NORMAL AI: Balanced offense & physical chi generation
  if (diff === 'normal') {
    const roll = Math.random();
    if (roll < 0.35 && specialKeys.length > 0 && cpu.chi >= 3) {
      return specialKeys[Math.floor(Math.random() * specialKeys.length)];
    }
    if (roll < 0.85 && physicalKeys.length > 0) {
      return physicalKeys[Math.floor(Math.random() * physicalKeys.length)];
    }
    if (defenseKeys.length > 0 && roll >= 0.85 && roll < 0.95) {
      return defenseKeys[Math.floor(Math.random() * defenseKeys.length)];
    }
    return offensiveKeys.length > 0 ? offensiveKeys[Math.floor(Math.random() * offensiveKeys.length)] : 'D+J';
  }

  // EASY AI: Active enough to finish matches, but relies on low-damage basic physical strikes and rarely uses high-tier Specials
  const roll = Math.random();
  if (roll < 0.15) return 'DO_NOTHING'; // 15% slight hesitation
  if (roll < 0.70 && physicalKeys.length > 0) {
    // 55% simple basic physical pokes (D+J, D+K)
    return physicalKeys[Math.floor(Math.random() * physicalKeys.length)];
  }
  // 30% random affordable action
  return availableKeys[Math.floor(Math.random() * availableKeys.length)];
}

async function runBatchSimulation(p1Rider, p2Rider, count = 50, p1Difficulty = 'normal', p2Difficulty = 'normal') {
  const allMoves = await loadSimulatorMoves();
  const rules = window.COMBAT_RULES || { STARTING_CHI: 8, MAX_CHI: 16, FAINT_THRESHOLD: 100, HIT_BUILDUP: 25 };
  const hpMultiplier = (window.GAME_CONFIG && window.GAME_CONFIG.HARD_CPU_HP_MULTIPLIER) || 1.30;

  const p1Diff = String(p1Difficulty || 'normal').toLowerCase();
  const p2Diff = String(p2Difficulty || 'normal').toLowerCase();

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
    let p1MaxLp = p1Rider.maxLp || 1850;
    if (p1Diff === 'hard') p1MaxLp = Math.floor(p1MaxLp * hpMultiplier);

    let p2MaxLp = p2Rider.maxLp || 2000;
    if (p2Diff === 'hard') p2MaxLp = Math.floor(p2MaxLp * hpMultiplier);

    let p1 = { id: p1Rider.id || 'ichigo', name: p1Rider.name || 'P1', maxLp: p1MaxLp, lp: p1MaxLp, chi: rules.STARTING_CHI || 8, maxChi: rules.MAX_CHI || 16, faintMeter: 0, isFainted: false, willBeFainted: false };
    let p2 = { id: p2Rider.id || 'nigo', name: p2Rider.name || 'P2', maxLp: p2MaxLp, lp: p2MaxLp, chi: rules.STARTING_CHI || 8, maxChi: rules.MAX_CHI || 16, faintMeter: 0, isFainted: false, willBeFainted: false };

    let roundCounter = 1;
    const MAX_ROUNDS = 40;

    while (p1.lp > 0 && p2.lp > 0 && roundCounter <= MAX_ROUNDS) {
      if (roundCounter > 1) {
        p1.chi = Math.min(p1.maxChi, p1.chi + 1);
        p2.chi = Math.min(p2.maxChi, p2.chi + 1);
      }

      // Handle Faint State Progression
      [p1, p2].forEach(p => {
        if (p.willBeFainted) {
          p.isFainted = true;
          p.willBeFainted = false;
          p.faintMeter = rules.FAINT_THRESHOLD;
        } else if (p.isFainted) {
          p.isFainted = false;
          p.faintMeter = 0;
        }
      });

      let p1Key = selectCPUMoveSim(p1, p2, p1Moves, p1Diff);
      let p2Key = selectCPUMoveSim(p2, p1, p2Moves, p2Diff);

      let m1 = getSimMove(p1Moves, p1Key);
      let m2 = getSimMove(p2Moves, p2Key);

      // Alternate turn initiative each round to remove first-strike bias
      let p1GoesFirst = (roundCounter % 2 === 1);

      let first = p1GoesFirst ? p1 : p2;
      let second = p1GoesFirst ? p2 : p1;
      let mFirst = p1GoesFirst ? m1 : m2;
      let mSecond = p1GoesFirst ? m2 : m1;
      let keyFirst = p1GoesFirst ? p1Key : p2Key;
      let keySecond = p1GoesFirst ? p2Key : p1Key;

      // Execute First Attacker
      first.chi = Math.max(0, first.chi - (mFirst.chiCost || 0));
      if (mFirst.baseDamage > 0 && keyFirst !== 'DO_NOTHING' && !first.isFainted) {
        let hitRoll = second.isFainted || keySecond === 'DO_NOTHING' || mSecond.type === 'DEFENSE' || (Math.random() * 100 < (mFirst.hitChance || 80));
        if (hitRoll) {
          let damageMult = mSecond.type === 'DEFENSE' ? 0.30 : 1.0;
          let dmg = Math.floor((mFirst.baseDamage || 60) * damageMult * (0.85 + Math.random() * 0.30));
          second.lp = Math.max(0, second.lp - dmg);

          if (!second.isFainted) {
            second.faintMeter += (mFirst.baseFaintDamage || rules.HIT_BUILDUP || 25);
            if (second.faintMeter >= rules.FAINT_THRESHOLD) {
              second.isFainted = true;
              second.willBeFainted = true;
            }
          }
          if (keyFirst.startsWith('D')) first.chi = Math.min(first.maxChi, first.chi + 2);
        }
      }

      // Execute Second Attacker (if alive and not fainted)
      second.chi = Math.max(0, second.chi - (mSecond.chiCost || 0));
      if (second.lp > 0 && mSecond.baseDamage > 0 && keySecond !== 'DO_NOTHING' && !second.isFainted) {
        let hitRoll = first.isFainted || keyFirst === 'DO_NOTHING' || mFirst.type === 'DEFENSE' || (Math.random() * 100 < (mSecond.hitChance || 80));
        if (hitRoll) {
          let damageMult = mFirst.type === 'DEFENSE' ? 0.30 : 1.0;
          let dmg = Math.floor((mSecond.baseDamage || 60) * damageMult * (0.85 + Math.random() * 0.30));
          first.lp = Math.max(0, first.lp - dmg);

          if (!first.isFainted) {
            first.faintMeter += (mSecond.baseFaintDamage || rules.HIT_BUILDUP || 25);
            if (first.faintMeter >= rules.FAINT_THRESHOLD) {
              first.isFainted = true;
              first.willBeFainted = true;
            }
          }
          if (keySecond.startsWith('D')) second.chi = Math.min(second.maxChi, second.chi + 2);
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
