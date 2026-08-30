/**
 * Shared 3-Turn / 4-Turn Foresee Simulation Engine (Minimax / Expectimax Tree)
 * Path: js/foresee_engine.js
 * Compatible with CPU vs. CPU and CPU vs. Human matches.
 */

(function (window) {
  'use strict';

  /**
   * HELPER: CALCULATE RANGE & MOVE TYPE PRIORITY 
   * Hierarchy: PROJECTILE (4) > REACH/ROPE (3) > W SKILLS / UTILITY (2) > MELEE (1)
   */
  function getMoveRangePrioritySim(move, moveKey = '') {
    if (!move) return 1;
    const range = (move.rangeType || 'MELEE').toUpperCase();
    const type = (move.type || '').toUpperCase();
    const isWSkill = (moveKey && moveKey.startsWith('W')) || type === 'UTILITY' || type === 'BUFF';

    if (range === 'PROJECTILE') return 4;
    if (range === 'REACH' || range === 'ROPE' || range === 'MID_RANGE') return 3;
    if (isWSkill) return 2; // All W skills execute before standard D/S melee attacks!
    return 1;               // Standard D / S Melee
  }

  /**
   * Deterministically projects player state changes for one single turn without UI side-effects.
   * Incorporates Low Power (< 5 Chi) & Full Power (> 14 Chi) combat modifiers.
   */
  function simulateTurnState(selfState, oppState, selfMoveKey, oppMoveKey, selfMovesData, oppMovesData) {
    const nextSelf = JSON.parse(JSON.stringify(selfState));
    const nextOpp = JSON.parse(JSON.stringify(oppState));

    const rules = window.COMBAT_RULES || {
      FAINT_THRESHOLD: 100,
      ROUND_RECOVERY: 13,
      FAINT_PENALTY_CHI_GUARD: 15,
      FAINT_PENALTY_STANDARD_GUARD: 25,
      MAX_CHI: 16
    };

    const selfMove = selfMovesData[selfMoveKey] || { name: 'Idle', type: 'IDLE', baseDamage: 0, chiCost: 0 };
    const oppMove = oppMovesData[oppMoveKey] || { name: 'Idle', type: 'IDLE', baseDamage: 0, chiCost: 0 };

    // 1. Deduct Chi Costs
    nextSelf.chi = Math.max(0, nextSelf.chi - (selfMove.chiCost || 0));
    nextOpp.chi = Math.max(0, nextOpp.chi - (oppMove.chiCost || 0));

    // 2. Determine Turn Priority
    const selfPri = getMoveRangePrioritySim(selfMove, selfMoveKey);
    const oppPri = getMoveRangePrioritySim(oppMove, oppMoveKey);

    let selfGoesFirst = true;
    if (oppPri > selfPri) {
      selfGoesFirst = false;
    } else if (selfPri === oppPri) {
      // Tie-breakers within the same priority tier
      if (selfMoveKey.startsWith('W') && !oppMoveKey.startsWith('W')) selfGoesFirst = true;
      else if (!selfMoveKey.startsWith('W') && oppMoveKey.startsWith('W')) selfGoesFirst = false;
      else if (selfMoveKey.startsWith('D') && oppMoveKey.startsWith('S')) selfGoesFirst = false;
      else if (selfMoveKey.startsWith('S') && oppMoveKey.startsWith('D')) selfGoesFirst = true;
    }

    const steps = selfGoesFirst
      ? [
          { atk: nextSelf, def: nextOpp, move: selfMove, key: selfMoveKey, oppMove: oppMove, isSelf: true },
          { atk: nextOpp, def: nextSelf, move: oppMove, key: oppMoveKey, oppMove: selfMove, isSelf: false }
        ]
      : [
          { atk: nextOpp, def: nextSelf, move: oppMove, key: oppMoveKey, oppMove: selfMove, isSelf: false },
          { atk: nextSelf, def: nextOpp, move: selfMove, key: selfMoveKey, oppMove: oppMove, isSelf: true }
        ];

    let turn1Interrupted = false;

    // 3. Process Sequence Steps
    steps.forEach((step, idx) => {
      if (idx === 1 && (step.atk.isFainted || turn1Interrupted)) return;
      if (step.move.type === 'IDLE' || step.key === 'DO_NOTHING') return;

      const wasTargetFainted = step.def.isFainted || step.def.faintMeter >= rules.FAINT_THRESHOLD || step.def.cashedInFaint;

      // Process Faint Recovery Utility Moves (e.g., W+K Battle Cry)
      if (step.move.faintRecovery && step.move.faintRecovery > 0) {
        step.atk.faintMeter = Math.max(0, step.atk.faintMeter - step.move.faintRecovery);
      }

      if (step.move.type === 'DEFENSE') {
        const penalty = (step.move.chiCost || 0) > 0 ? rules.FAINT_PENALTY_CHI_GUARD : rules.FAINT_PENALTY_STANDARD_GUARD;
        step.atk.faintMeter = Math.min(rules.FAINT_THRESHOLD, step.atk.faintMeter + penalty);
        if (step.atk.faintMeter >= rules.FAINT_THRESHOLD) step.atk.isFainted = true;
        return;
      }

      // --- CHI THRESHOLD FLAGS ---
      const isFullPowerAtk = step.atk.chi > 14;
      const isLowPowerDef = step.def.chi < 5;

      // Calculate Hit Rate (+20% Accuracy if Full Power)
      let hitRate = ((step.move.hitChance || 80) / 100);
      if (isFullPowerAtk) {
        hitRate = Math.min(1.0, hitRate + 0.20);
      }
      if (step.atk.activeBuffs && step.atk.activeBuffs.some(b => b.id === 'arm_calibration' || b.id === 'red_lamp_boost' || b.id === 'accuracy_focus')) {
        hitRate = Math.min(1.0, hitRate + 0.15);
      }

      let isGuarded = step.oppMove.type === 'DEFENSE' && !step.def.isFainted;
      let damageMult = (isGuarded && !step.move.unblockable) ? 0.30 : 1.0;

      // Calculate Damage (+20% dealt if Full Power, +25% taken if Low Power)
      let baseDmg = step.move.baseDamage || 0;
      if (isFullPowerAtk) baseDmg *= 1.20;
      if (isLowPowerDef) baseDmg *= 1.25;

      let expectedDmg = Math.floor(baseDmg * hitRate * damageMult);

      // Calculate Faint Damage (+25% taken if Low Power)
      let baseFaintDmg = step.move.baseFaintDamage || 25;
      if (isLowPowerDef) baseFaintDmg *= 1.25;
      let expectedFaint = Math.floor(baseFaintDmg * hitRate);

      step.def.lp = Math.max(0, step.def.lp - expectedDmg);

      if (wasTargetFainted && expectedDmg > 0) {
        step.def.cashedInFaint = true;
      }

      if (!isGuarded) {
        step.def.faintMeter = Math.min(rules.FAINT_THRESHOLD, step.def.faintMeter + expectedFaint);
        if (step.def.faintMeter >= rules.FAINT_THRESHOLD) step.def.isFainted = true;
        if (idx === 0) turn1Interrupted = true;
      }

      // Process Standard D-Tree Chi Generation
      if (step.key.startsWith('D')) {
        const chiGain = (step.key === 'D+J' || step.key === 'D+K') ? 2 : 3;
        step.atk.chi = Math.min(rules.MAX_CHI, step.atk.chi + Math.floor(chiGain * hitRate));
      }

      // Process Special Move Chi Refunds (e.g., Riderman D+I Rope Arm Hook)
      if (step.move.chiRefundOnHit && step.move.chiRefundOnHit > 0) {
        step.atk.chi = Math.min(rules.MAX_CHI, step.atk.chi + Math.floor(step.move.chiRefundOnHit * hitRate));
      }
    });

    // 4. End-of-Round Recovery & Buff Decay
    [nextSelf, nextOpp].forEach(p => {
      if (!p.isFainted && p.faintMeter > 0) {
        p.faintMeter = Math.max(0, p.faintMeter - rules.ROUND_RECOVERY);
      }
      if (p.isFainted) p.isFainted = false;

      if (p.airborneTicks > 0) p.airborneTicks--;
      if (p.activeBuffs && p.activeBuffs.length > 0) {
        p.activeBuffs.forEach(b => { if (b.roundsLeft) b.roundsLeft--; });
        p.activeBuffs = p.activeBuffs.filter(b => b.roundsLeft === undefined || b.roundsLeft > 0);
      }
    });

    return { nextSelf, nextOpp };
  }

  /**
   * Dynamic Non-Linear Evaluation Function
   * Scores leaf states based on LP, Chi, Faint, Low/Full Power Thresholds, and 套路 (Routine) Continuity.
   */
  function evaluateLeafState(selfState, oppState, characterWeights = {}) {
    if (oppState.lp <= 0) return 10000;
    if (selfState.lp <= 0) return -10000;

    const selfMaxLp = selfState.maxLp || 2300;
    const selfHpRatio = selfState.lp / selfMaxLp;

    let lpUrgencyMultiplier = 1.0;
    if (selfHpRatio < 0.30) {
      lpUrgencyMultiplier = 1.0 + ((0.30 - selfHpRatio) / 0.30) * 2.0;
    }

    let resourceDiscount = Math.min(1.0, Math.max(0.15, selfHpRatio / 0.35));

    const W_LP = (characterWeights.W_LP || 1.0) * lpUrgencyMultiplier;
    const W_CHI = (characterWeights.W_CHI || 8.0) * resourceDiscount;
    const W_FAINT = (characterWeights.W_FAINT || 2.0) * resourceDiscount;

    let selfEffectiveChi = selfState.chi;
    let oppEffectiveChi = oppState.chi;

    let score = ((selfState.lp - oppState.lp) * W_LP) +
                ((selfEffectiveChi - oppEffectiveChi) * W_CHI);

    // --- Dynamic Threshold Valuation ---
    if (selfState.chi < 5) score -= 80 * resourceDiscount;      // Low Power Vulnerability Penalty
    if (oppState.chi < 5) score += 80 * resourceDiscount;       // Target Low Power Opponent Bonus
    if (selfState.chi > 14) score += 100 * resourceDiscount;    // Full Power Bonus
    if (oppState.chi > 14) score -= 100 * resourceDiscount;     // Opponent Full Power Threat

    // --- Faint Valuation ---
    let oppFaintVal = (oppState.isFainted || oppState.faintMeter >= 100 || oppState.cashedInFaint) ? 100 : oppState.faintMeter;
    let selfFaintVal = (selfState.isFainted || selfState.faintMeter >= 100 || selfState.cashedInFaint) ? 100 : selfState.faintMeter;

    score += (oppFaintVal - selfFaintVal) * W_FAINT;

    if (oppState.isFainted || oppState.faintMeter >= 100 || oppState.cashedInFaint) {
      score += 300 * resourceDiscount;
    }
    if (selfState.isFainted || selfState.faintMeter >= 100 || selfState.cashedInFaint) {
      score -= 300 * lpUrgencyMultiplier;
    }

    // --- 套路 (ROUTINE & SYNERGY) CONTINUITY BONUSES ---
    // 1. Buff Synergy Bonus: Reward holding an active ATK buff if Chi is available to launch a Special
    const hasAtkBuff = selfState.activeBuffs && selfState.activeBuffs.some(b => b.id === 'atk_up' || b.id === 'typhoon_focus');
    if (hasAtkBuff && selfState.chi >= 6) {
      score += 120;
    }

    // 2. Faint Cash-In Bonus: Strongly encourage executing high-damage finishers on fainted/stunned targets
    if (oppState.isFainted || oppState.faintMeter >= 80) {
      if (selfState.chi >= 6) {
        score += 180;
      }
    }

    // 3. Nigo Full Power Hoarding Bonus: Encourage holding Chi when close to Full Power milestone (>14 Chi)
    if (selfState.id === 'nigo' && selfState.chi >= 12 && selfState.chi < 15) {
      score += 90;
    }

    return score;
  }

  /**
   * Main Decision Search Function (Supports Minimax & Expectimax with Alpha-Beta Pruning)
   */
  function run3TurnForeseeSearch(cpuPlayer, opponentPlayer, selfMovesData, oppMovesData, options = {}) {
    const maxDepth = options.maxDepth || 2;
    const characterWeights = options.characterWeights || {};
    const isOpponentLocked = options.isOpponentLocked || false;
    const lockedOpponentMoveKey = options.lockedOpponentMoveKey || null;

    // Use Expectimax for depths 1-2; switch to Minimax for depths 3+ to assume worst-case opponent play
    const useExpectimax = options.useExpectimax !== undefined ? options.useExpectimax : (maxDepth < 3);

    const getValidMoves = (player, moves) => {
      const valid = Object.keys(moves || {}).filter(k => (moves[k].chiCost || 0) <= player.chi);
      return valid.length > 0 ? valid : ['D+J'];
    };

    function searchTree(selfState, oppState, depth, alpha = -Infinity, beta = Infinity) {
      if (depth === 0 || selfState.lp <= 0 || oppState.lp <= 0) {
        return evaluateLeafState(selfState, oppState, characterWeights);
      }

      const selfValid = getValidMoves(selfState, selfMovesData);
      const oppValid = getValidMoves(oppState, oppMovesData);

      let bestSelfVal = -Infinity;

      for (let sMove of selfValid) {
        let oppBranchVal = 0;

        if (useExpectimax) {
          let sumVal = 0;
          for (let oMove of oppValid) {
            const { nextSelf, nextOpp } = simulateTurnState(
              selfState, oppState, sMove, oMove, selfMovesData, oppMovesData
            );
            sumVal += searchTree(nextSelf, nextOpp, depth - 1, alpha, beta);
          }
          oppBranchVal = sumVal / oppValid.length;
        } else {
          // Minimax: Assume opponent selects the response that minimizes CPU score
          let worstVal = Infinity;
          for (let oMove of oppValid) {
            const { nextSelf, nextOpp } = simulateTurnState(
              selfState, oppState, sMove, oMove, selfMovesData, oppMovesData
            );
            const nodeVal = searchTree(nextSelf, nextOpp, depth - 1, alpha, beta);
            worstVal = Math.min(worstVal, nodeVal);

            // Alpha-Beta Pruning
            beta = Math.min(beta, worstVal);
            if (beta <= alpha) break;
          }
          oppBranchVal = worstVal;
        }

        bestSelfVal = Math.max(bestSelfVal, oppBranchVal);
        alpha = Math.max(alpha, bestSelfVal);
        if (beta <= alpha) break;
      }

      return bestSelfVal;
    }

    const selfValid = getValidMoves(cpuPlayer, selfMovesData);
    let oppValid = getValidMoves(opponentPlayer, oppMovesData);

    if (isOpponentLocked && lockedOpponentMoveKey && oppMovesData[lockedOpponentMoveKey]) {
      oppValid = [lockedOpponentMoveKey];
    }

    let bestMove = selfValid[0] || 'D+J';
    let bestScore = -Infinity;
    let alpha = -Infinity;
    let beta = Infinity;

    for (let sMove of selfValid) {
      let moveScore = 0;

      if (useExpectimax) {
        let sumVal = 0;
        for (let oMove of oppValid) {
          const { nextSelf, nextOpp } = simulateTurnState(
            cpuPlayer, opponentPlayer, sMove, oMove, selfMovesData, oppMovesData
          );
          sumVal += searchTree(nextSelf, nextOpp, maxDepth - 1, alpha, beta);
        }
        moveScore = sumVal / oppValid.length;
      } else {
        let worstVal = Infinity;
        for (let oMove of oppValid) {
          const { nextSelf, nextOpp } = simulateTurnState(
            cpuPlayer, opponentPlayer, sMove, oMove, selfMovesData, oppMovesData
          );
          const score = searchTree(nextSelf, nextOpp, maxDepth - 1, alpha, beta);
          worstVal = Math.min(worstVal, score);

          beta = Math.min(beta, worstVal);
          if (beta <= alpha) break;
        }
        moveScore = worstVal;
      }

      if (moveScore > bestScore) {
        bestScore = moveScore;
        bestMove = sMove;
      }

      alpha = Math.max(alpha, bestScore);
    }

    return bestMove;
  }

  // EXPORT UNIFIED FORESEE ENGINE TO WINDOW
  window.ForeseeEngine = {
    getBestMove: function (cpuPlayer, opponentPlayer, availableMoves, profile = {}, depth = 2) {
      const oppMovesData = (typeof window.getOpponentMovesData === 'function') 
        ? window.getOpponentMovesData(opponentPlayer) 
        : (slotKey => slotKey === 'p1' ? window.gameState.p1Moves : window.gameState.p2Moves)(cpuPlayer.isCPU && cpuPlayer.slot === 'p1' ? 'p2' : 'p1') || {};

      return run3TurnForeseeSearch(cpuPlayer, opponentPlayer, availableMoves, oppMovesData, {
        maxDepth: depth,
        characterWeights: profile.weights || {}
      });
    }
  };

})(window);
