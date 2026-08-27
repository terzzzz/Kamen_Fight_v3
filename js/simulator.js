/**
 * In-Browser Headless Match Simulator (Full Mechanics Port)
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

function getFaintDamageForMoveSim(move) {
  if (move && typeof move.baseFaintDamage === 'number') {
    return move.baseFaintDamage;
  }
  return (window.COMBAT_RULES || {}).HIT_BUILDUP || 25;
}

function applyBuffSim(player, buffId, label, buffType, durationRounds, roundCounter) {
  if (!player.activeBuffs) player.activeBuffs = [];
  player.activeBuffs = player.activeBuffs.filter(b => b.id !== buffId);
  player.activeBuffs.push({
    id: buffId,
    label: label,
    type: buffType,
    roundsLeft: durationRounds,
    appliedRound: roundCounter
  });
}

function processRoundBuffsSim(player, roundCounter) {
  if (!player.activeBuffs) return;
  player.activeBuffs.forEach(b => {
    if (b.appliedRound !== roundCounter) {
      b.roundsLeft--;
    }
  });
  player.activeBuffs = player.activeBuffs.filter(b => b.roundsLeft > 0);
}

function handleAirborneStateSim(player, moveKey, move, roundCounter) {
  if (move && move.grantsAirborne) {
    player.airborneTicks = move.grantsAirborne;
    player.airborneAppliedRound = roundCounter;
    player.airborneChargePercent = player.activeChargePercent !== undefined ? player.activeChargePercent : 100;
  } else if (player.airborneTicks > 0) {
    if (move && move.forcesLanding) {
      player.airborneTicks = 0;
    } else if (player.airborneAppliedRound !== roundCounter) {
      player.airborneTicks--;
    }
  }
}

function applyFaintBuildUpSim(player, customAmount = null) {
  if (!player.isFainted) {
    const rules = window.COMBAT_RULES || { FAINT_THRESHOLD: 100, HIT_BUILDUP: 25 };
    player.tookCleanHitThisRound = true;
    const amount = customAmount !== null ? customAmount : rules.HIT_BUILDUP;
    player.faintMeter = Math.min(rules.FAINT_THRESHOLD, player.faintMeter + amount);

    if (player.faintMeter >= rules.FAINT_THRESHOLD) {
      player.isFainted = true;
      player.willBeFaintedNextRound = true;
    }
  }
}

function resolveAttackSim(attacker, defender, atkMove, atkMoveKey, defMove, defMoveKey) {
  const rules = window.COMBAT_RULES || {
    FAINT_THRESHOLD: 100,
    FAINT_PENALTY_CHI_GUARD: 15,
    FAINT_PENALTY_STANDARD_GUARD: 25,
    OFFENSIVE_TYPES: ['MELEE', 'PROJECTILE', 'SPECIAL', 'FINISHER', 'PHYSICAL']
  };

  const isOffensive = !!(atkMove && rules.OFFENSIVE_TYPES.includes(atkMove.type?.toUpperCase()));

  if (!isOffensive) {
    return { isOffensive: false, hitLanded: false, isGlancing: false, guardSuccess: false, isMatchingGuard: false, chiGained: 0, finalDmg: 0 };
  }

  const chargePercent = attacker.activeChargePercent !== undefined ? attacker.activeChargePercent : 100;
  const chargeRatio = Math.min(1.0, Math.max(0.0, chargePercent / 100));
  const chargeFactor = Math.sqrt(0.5 + (0.5 * chargeRatio));

  let isGuarding = defMove.type === 'DEFENSE' && !defender.isFainted;
  let guardSuccess = false;
  let isMatchingGuard = false;
  let chiGained = 0;
  let damageRatio = 1.0;

  if (isGuarding) {
    const atkButton = atkMoveKey ? atkMoveKey.split('+')[1] : null;
    const guardChiCost = defMove.chiCost || 0;
    const faintPenalty = guardChiCost > 0 ? rules.FAINT_PENALTY_CHI_GUARD : rules.FAINT_PENALTY_STANDARD_GUARD;

    defender.tookCleanHitThisRound = true;
    defender.faintMeter = Math.min(rules.FAINT_THRESHOLD, defender.faintMeter + faintPenalty);
    if (defender.faintMeter >= rules.FAINT_THRESHOLD) {
      defender.isFainted = true;
      defender.willBeFaintedNextRound = true;
    }

    let defenderChargeRatio = Math.min(1.0, Math.max(0.0, (defender.activeChargePercent !== undefined ? defender.activeChargePercent : 100) / 100));
    let defenderChargeFactor = Math.sqrt(0.5 + (0.5 * defenderChargeRatio));
    let effectiveGuardChance = 70 * defenderChargeFactor;

    if (defMoveKey === 'A+I' || defMove.name === 'Windmill Guard') {
      isMatchingGuard = true;
      if (!atkMove.unblockable && Math.random() * 100 < effectiveGuardChance) {
        guardSuccess = true;
        damageRatio = 0.0;
      }
    } else if (defMoveKey === `A+${atkButton}`) {
      isMatchingGuard = true;
      if (Math.random() * 100 < effectiveGuardChance) {
        guardSuccess = true;
        damageRatio = 0.30;
        chiGained = 2;
      } else {
        guardSuccess = false;
        damageRatio = 1.0;
      }
    } else {
      isMatchingGuard = false;
      guardSuccess = false;
      damageRatio = 1.0;
    }
  }

  let rolledHit = false;
  let isGlancing = false;

  if (defender.isFainted) {
    rolledHit = true;
    isGlancing = false;
  } else if (isGuarding) {
    rolledHit = true;
  } else if (defMove.type === 'IDLE' || defMoveKey === 'DO_NOTHING' || defMove.name === 'Do Nothing') {
    rolledHit = true;
  } else {
    let baseHitChance = atkMove.hitChance || 80;
    let isDOrS = atkMoveKey.startsWith('D') || atkMoveKey.startsWith('S');
    let accuracyDiscount = isDOrS ? chargeFactor : 1.0;
    let attackerHitBonus = (attacker.id === 'nigo' && attacker.airborneTicks > 0) ? 15 : 0;
    let rawHitRate = (baseHitChance * accuracyDiscount) + attackerHitBonus;

    let baseEvasionPct = (defender && defender.evasionRate !== undefined) ? defender.evasionRate : 0.0;
    if (defender.id === 'ichigo' && defender.airborneTicks > 0) baseEvasionPct += 0.20;

    let instabilityMult = 1.0;
    if (defender.airborneTicks > 0 && defender.airborneAppliedRound === attacker.roundCounter) {
      let jumpChargeRatio = Math.min(1.0, Math.max(0.0, (defender.airborneChargePercent !== undefined ? defender.airborneChargePercent : 100) / 100));
      instabilityMult = 1.8 - (0.8 * jumpChargeRatio);
    }

    let calculatedHitChance = rawHitRate * (1.0 - baseEvasionPct) * instabilityMult;
    let effectiveHitChance = Math.max(10, Math.min(100, calculatedHitChance));

    rolledHit = Math.random() * 100 < effectiveHitChance;
  }

  if (!rolledHit) {
    return { isOffensive: true, hitLanded: false, isGlancing: false, guardSuccess: false, isMatchingGuard: false, chiGained: 0, finalDmg: 0 };
  }

  if (!isGuarding && !defender.isFainted) {
    isGlancing = Math.random() * 100 < (atkMove.scratchRate || 20);
  }

  if (defender.activeBuffs && defender.activeBuffs.some(b => b.id === 'red_shutter')) {
    damageRatio *= 0.85;
  }

  let isDOrS = atkMoveKey.startsWith('D') || atkMoveKey.startsWith('S');
  let typhoonMultiplier = (isDOrS && attacker.activeBuffs && attacker.activeBuffs.some(b => b.id === 'typhoon' || b.id === 'typhoon_speed' || b.id === 'double_typhoon')) ? 1.25 : 1.0;

  let focusMultiplier = 1.0;
  if (attacker.activeBuffs) {
    if (atkMoveKey.startsWith('S') && attacker.activeBuffs.some(b => b.id === 'focus' || b.id === 'v3_focus' || b.id === 'red_lamp_boost')) {
      focusMultiplier = 1.20;
    } else if (atkMoveKey.startsWith('D') && attacker.activeBuffs.some(b => b.id === 'power_focus')) {
      focusMultiplier = 1.30;
    }
  }

  let jumpAtkMultiplier = attacker.airborneTicks > 0 ? 1.15 : 1.0;
  let baseDamage = atkMove.baseDamage || 0;
  let calculatedDmg = baseDamage * chargeFactor * typhoonMultiplier * focusMultiplier * jumpAtkMultiplier * damageRatio;

  let finalDmg = (isGlancing && calculatedDmg > 0) ? Math.max(1, Math.floor(calculatedDmg * 0.20)) : Math.floor(calculatedDmg);

  return { isOffensive: true, hitLanded: true, isGlancing: isGlancing, guardSuccess: guardSuccess, isMatchingGuard: isMatchingGuard, chiGained: chiGained, finalDmg: finalDmg };
}

/**
 * Universal Simulation CPU Move Choice Dispatcher
 */
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

  // DIRECT ROUTING TO CENTRAL CONTROLLER
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
        matchConfig: { p1Difficulty, p2Difficulty },
        input: null,
        p1SelectedMoveKey: null,
        p2SelectedMoveKey: null
      };

      let roundCounter = 1;
      const MAX_ROUNDS_LIMIT = 50;

      while (p1.lp > 0 && p2.lp > 0 && roundCounter <= MAX_ROUNDS_LIMIT) {
        window.gameState.roundCounter = roundCounter;
        p1.roundCounter = roundCounter;
        p2.roundCounter = roundCounter;

        let p1MoveKey, p2MoveKey;
        if (Math.random() < 0.5) {
          p1MoveKey = selectCPUMoveSim(p1, p2, p1Moves, p1Difficulty);
          p2MoveKey = selectCPUMoveSim(p2, p1, p2Moves, p2Difficulty);
        } else {
          p2MoveKey = selectCPUMoveSim(p2, p1, p2Moves, p2Difficulty);
          p1MoveKey = selectCPUMoveSim(p1, p2, p1Moves, p1Difficulty);
        }

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

        if (!p1IsIdle && p2IsIdle) p1GoesFirst = true;
        else if (p1IsIdle && !p2IsIdle) p1GoesFirst = false;
        else if (p1RangePriority > p2RangePriority) p1GoesFirst = true;
        else if (p1RangePriority < p2RangePriority) p1GoesFirst = false;
        else if (p1IsS && p2IsD) p1GoesFirst = true;
        else if (p1IsD && p2IsS) p1GoesFirst = false;
        else p1GoesFirst = Math.random() < 0.5;

        let atk1 = p1GoesFirst ? p1 : p2;
        let def1 = p1GoesFirst ? p2 : p1;
        let move1 = p1GoesFirst ? m1 : m2;
        let key1 = p1GoesFirst ? p1MoveKey : p2MoveKey;

        let atk2 = p1GoesFirst ? p2 : p1;
        let def2 = p1GoesFirst ? p1 : p2;
        let move2 = p1GoesFirst ? m2 : m1;
        let key2 = p1GoesFirst ? p2MoveKey : p1MoveKey;

        let def1WasInterrupted = false;

        // STEP 1 EXECUTION
        if (move1.type !== 'IDLE' && key1 !== 'DO_NOTHING') {
          if (move1.buff) applyBuffSim(atk1, move1.buff.id, move1.buff.label, move1.buff.type, move1.buff.duration, roundCounter);
          handleAirborneStateSim(atk1, key1, move1, roundCounter);

          if (move1.faintRecovery && atk1.faintMeter > 0) {
            atk1.faintMeter = Math.max(0, atk1.faintMeter - move1.faintRecovery);
          }

          atk1.chi = Math.max(0, atk1.chi - (move1.chiCost || 0));

          if (move1.type === 'DEFENSE') {
            let isOpponentOffensive = !!(move2 && rules.OFFENSIVE_TYPES.includes(move2.type?.toUpperCase()));
            if (!isOpponentOffensive && (move1.chiCost || 0) === 0) {
              applyFaintBuildUpSim(atk1, rules.FAINT_PENALTY_IDLE_GUARD);
            }
          } else {
            let result = resolveAttackSim(atk1, def1, move1, key1, move2, key2);

            if (result.isOffensive) {
              if (move2.type === 'DEFENSE' && !def1.isFainted) {
                def1.chi = Math.max(0, def1.chi - (move2.chiCost || 0));
                if (result.guardSuccess) {
                  if (result.chiGained > 0 && !def1.isFainted) {
                    def1.chi = Math.min(def1.maxChi || rules.MAX_CHI, def1.chi + result.chiGained);
                  }
                  def1.lp = Math.max(0, def1.lp - result.finalDmg);
                } else {
                  def1WasInterrupted = true;
                  def1.lp = Math.max(0, def1.lp - result.finalDmg);
                  applyFaintBuildUpSim(def1, getFaintDamageForMoveSim(move1));
                }
              } else if (result.hitLanded) {
                if (result.isGlancing) {
                  def1.lp = Math.max(0, def1.lp - result.finalDmg);
                  applyFaintBuildUpSim(def1, 10);
                } else {
                  def1WasInterrupted = true;
                  def1.lp = Math.max(0, def1.lp - result.finalDmg);
                  applyFaintBuildUpSim(def1, getFaintDamageForMoveSim(move1));
                }
              }
            }

            if (key1.startsWith('D')) {
              const chiGain = (key1 === 'D+J' || key1 === 'D+K') ? 2 : 3;
              atk1.chi = Math.min(rules.MAX_CHI, atk1.chi + chiGain);
            }
          }
        }

        // STEP 2 EXECUTION
        if (def2.lp > 0 && !atk2.isFainted && !def1WasInterrupted && move2.type !== 'IDLE' && key2 !== 'DO_NOTHING' && move2.type !== 'DEFENSE') {
          if (move2.buff) applyBuffSim(atk2, move2.buff.id, move2.buff.label, move2.buff.type, move2.buff.duration, roundCounter);
          handleAirborneStateSim(atk2, key2, move2, roundCounter);

          if (move2.faintRecovery && atk2.faintMeter > 0) {
            atk2.faintMeter = Math.max(0, atk2.faintMeter - move2.faintRecovery);
          }

          atk2.chi = Math.max(0, atk2.chi - (move2.chiCost || 0));

          let result = resolveAttackSim(atk2, def2, move2, key2, move1, key1);

          if (result.isOffensive) {
            if (move1.type === 'DEFENSE' && !def2.isFainted) {
              if (result.guardSuccess) {
                if (result.chiGained > 0 && !def2.isFainted) {
                  def2.chi = Math.min(def2.maxChi || rules.MAX_CHI, def2.chi + result.chiGained);
                }
                def2.lp = Math.max(0, def2.lp - result.finalDmg);
              } else {
                def2.lp = Math.max(0, def2.lp - result.finalDmg);
                applyFaintBuildUpSim(def2, getFaintDamageForMoveSim(move2));
              }
            } else if (result.hitLanded) {
              if (result.isGlancing) {
                def2.lp = Math.max(0, def2.lp - result.finalDmg);
                applyFaintBuildUpSim(def2, 10);
              } else {
                def2.lp = Math.max(0, def2.lp - result.finalDmg);
                applyFaintBuildUpSim(def2, getFaintDamageForMoveSim(move2));
              }
            }
          }

          if (key2.startsWith('D')) {
            const chiGain = (key2 === 'D+J' || key2 === 'D+K') ? 2 : 3;
            atk2.chi = Math.min(rules.MAX_CHI, atk2.chi + chiGain);
          }
        }

        processRoundBuffsSim(p1, roundCounter);
        processRoundBuffsSim(p2, roundCounter);

        [p1, p2].forEach(player => {
          if (player.willBeFaintedNextRound) {
            player.isFainted = true;
            player.faintMeter = 100;
          } else if (!player.tookCleanHitThisRound && player.faintMeter > 0) {
            player.faintMeter = Math.max(0, player.faintMeter - rules.ROUND_RECOVERY);
          }
          player.tookCleanHitThisRound = false;
          player.willBeFaintedNextRound = false;
        });

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
