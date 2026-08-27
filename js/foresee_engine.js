/**
 * Shared 3-Turn Foresee Simulation Engine (Minimax / Expectimax Tree)
 * Path: js/foresee_engine.js
 * Compatible with CPU vs. CPU and CPU vs. Human matches.
 */

(function (window) {
  'use strict';

  // HELPER: CALCULATE RANGE PRIORITY (PROJECTILE > REACH > MELEE)
  function getMoveRangePrioritySim(move) {
    if (!move) return 1;
    const range = (move.rangeType || 'MELEE').toUpperCase();
    if (range === 'PROJECTILE') return 3;
    if (range === 'REACH' || range === 'ROPE' || range === 'MID_RANGE') return 2;
    return 1;
  }

  /**
   * Deterministically projects player state changes for one single turn without UI side-effects.
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
    const selfPri = getMoveRangePrioritySim(selfMove);
    const oppPri = getMoveRangePrioritySim(oppMove);

    let selfGoesFirst = true;
    if (oppPri > selfPri) {
      selfGoesFirst = false;
    } else if (selfPri === oppPri) {
      if (selfMoveKey.startsWith('D') && oppMoveKey.startsWith('S')) selfGoesFirst = false;
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

      // Track if target was already fainted/stunned before hit
      const wasTargetFainted = step.def.isFainted || step.def.faintMeter >= rules.FAINT_THRESHOLD || step.def.cashedInFaint;

      if (step.move.type === 'DEFENSE') {
        const penalty = (step.move.chiCost || 0) > 0 ? rules.FAINT_PENALTY_CHI_GUARD : rules.FAINT_PENALTY_STANDARD_GUARD;
        step.atk.faintMeter = Math.min(rules.FAINT_THRESHOLD, step.atk.faintMeter + penalty);
        if (step.atk.faintMeter >= rules.FAINT_THRESHOLD) step.atk.isFainted = true;
        return;
      }

      // Expected Hit Rate Calculation
      let hitRate = ((step.move.hitChance || 80) / 100);
      if (step.atk.activeBuffs && step.atk.activeBuffs.some(b => b.id === 'arm_calibration' || b.id === 'red_lamp_boost')) {
        hitRate = Math.min(1.0, hitRate + 0.15);
      }

      let isGuarded = step.oppMove.type === 'DEFENSE' && !step.def.isFainted;
      let damageMult = isGuarded ? 0.30 : 1.0;

      let baseDmg = step.move.baseDamage || 0;
      let expectedDmg = Math.floor(baseDmg * hitRate * damageMult);
      let expectedFaint = Math.floor((step.move.baseFaintDamage || 25) * hitRate);

      step.def.lp = Math.max(0, step.def.lp - expectedDmg);

      // CASH-IN FAINT FIX: Tag that faint value was converted into LP damage
      if (wasTargetFainted && expectedDmg > 0) {
        step.def.cashedInFaint = true;
      }

      if (!isGuarded) {
        step.def.faintMeter = Math.min(rules.FAINT_THRESHOLD, step.def.faintMeter + expectedFaint);
        if (step.def.faintMeter >= rules.FAINT_THRESHOLD) step.def.isFainted = true;
        if (idx === 0) turn1Interrupted = true;
      }

      // Chi Generation for D-Skills
      if (step.key.startsWith('D')) {
        const chiGain = (step.key === 'D+J' || step.key === 'D+K') ? 2 : 3;
        step.atk.chi = Math.min(rules.MAX_CHI, step.atk.chi + Math.floor(chiGain * hitRate));
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
   * Adjusts resource values based on LP survival thresholds & preserves cashed-in faint value.
   */
  function evaluateLeafState(selfState, oppState, characterWeights = {}) {
    // 1. Terminal KO Bounds
    if (oppState.lp <= 0) return 10000;
    if (selfState.lp <= 0) return -10000;

    const selfMaxLp = selfState.maxLp || 1850;
    const selfHpRatio = selfState.lp / selfMaxLp;

    // 2. Dynamic Survival Multipliers
    // As LP drops below 30%, LP protection urgency scales up to 3x
    let lpUrgencyMultiplier = 1.0;
    if (selfHpRatio < 0.30) {
      lpUrgencyMultiplier = 1.0 + ((0.30 - selfHpRatio) / 0.30) * 2.0;
    }

    // Future resource values (Chi & Faint) drop as HP enters danger zone
    let resourceDiscount = Math.min(1.0, Math.max(0.15, selfHpRatio / 0.35));

    // 3. Dynamic Weight Adjustments
    const W_LP = (characterWeights.W_LP || 1.0) * lpUrgencyMultiplier;
    const W_CHI = (characterWeights.W_CHI || 45.0) * resourceDiscount;
    const W_FAINT = (characterWeights.W_FAINT || 3.0) * resourceDiscount;

    // 4. Chi Diminishing Returns (Saturation Cap at 11 Chi)
    let selfEffectiveChi = selfState.chi > 11 ? 11 + (selfState.chi - 11) * 0.25 : selfState.chi;
    let oppEffectiveChi = oppState.chi > 11 ? 11 + (oppState.chi - 11) * 0.25 : oppState.chi;

    // 5. Base Weighted Score
    let score = ((selfState.lp - oppState.lp) * W_LP) +
                ((selfEffectiveChi - oppEffectiveChi) * W_CHI);

    // 6. Faint & Stun Evaluation with Cash-In Preservation
    let oppFaintVal = (oppState.isFainted || oppState.faintMeter >= 100 || oppState.cashedInFaint) ? 100 : oppState.faintMeter;
    let selfFaintVal = (selfState.isFainted || selfState.faintMeter >= 100 || selfState.cashedInFaint) ? 100 : selfState.faintMeter;

    score += (oppFaintVal - selfFaintVal) * W_FAINT;

    // Step-Bonuses for Stun States
    if (oppState.isFainted || oppState.faintMeter >= 100 || oppState.cashedInFaint) {
      score += 300 * resourceDiscount;
    }
    if (selfState.isFainted || selfState.faintMeter >= 100 || selfState.cashedInFaint) {
      score -= 300 * lpUrgencyMultiplier;
    }

    // Buff Synergies (Discounted if near death)
    if (selfState.activeBuffs && selfState.activeBuffs.some(b => b.id === 'power_focus' || b.id === 'focus')) {
      score += 80 * resourceDiscount;
    }
    if (selfState.activeBuffs && selfState.activeBuffs.some(b => b.id === 'double_typhoon_speed' || b.id === 'red_lamp_boost')) {
      score += 90 * resourceDiscount;
    }

    return score;
  }

/**
 * Main 3-Turn Decision Search Function (Supports Minimax & Expectimax)
 */
function run3TurnForeseeSearch(cpuPlayer, opponentPlayer, selfMovesData, oppMovesData, options = {}) {
  const maxDepth = options.maxDepth || 3;
  const characterWeights = options.characterWeights || {};
  const isOpponentLocked = options.isOpponentLocked || false;
  const lockedOpponentMoveKey = options.lockedOpponentMoveKey || null;

  // Use Expectimax (average valuation) for depth < 3 or when explicitly enabled
  const useExpectimax = options.useExpectimax !== undefined ? options.useExpectimax : (maxDepth < 3);

  const getValidMoves = (player, moves) => {
    const valid = Object.keys(moves).filter(k => (moves[k].chiCost || 0) <= player.chi);
    return valid.length > 0 ? valid : ['D+J'];
  };

  function searchTree(selfState, oppState, depth) {
    if (depth === 0 || selfState.lp <= 0 || oppState.lp <= 0) {
      return evaluateLeafState(selfState, oppState, characterWeights);
    }

    const selfValid = getValidMoves(selfState, selfMovesData);
    const oppValid = getValidMoves(oppState, oppMovesData);

    let bestSelfVal = -Infinity;

    for (let sMove of selfValid) {
      let oppBranchVal = 0;

      if (useExpectimax) {
        // EXPECTIMAX: Average expected outcome across all possible opponent responses
        let sumVal = 0;
        for (let oMove of oppValid) {
          const { nextSelf, nextOpp } = simulateTurnState(
            selfState, oppState, sMove, oMove, selfMovesData, oppMovesData
          );
          sumVal += searchTree(nextSelf, nextOpp, depth - 1);
        }
        oppBranchVal = sumVal / oppValid.length;
      } else {
        // MINIMAX: Worst-case counter-attack evaluation
        let worstVal = Infinity;
        for (let oMove of oppValid) {
          const { nextSelf, nextOpp } = simulateTurnState(
            selfState, oppState, sMove, oMove, selfMovesData, oppMovesData
          );
          const nodeVal = searchTree(nextSelf, nextOpp, depth - 1);
          worstVal = Math.min(worstVal, nodeVal);
        }
        oppBranchVal = worstVal;
      }

      bestSelfVal = Math.max(bestSelfVal, oppBranchVal);
    }

    return bestSelfVal;
  }

  // Root Level Decision
  const selfValid = getValidMoves(cpuPlayer, selfMovesData);
  let oppValid = getValidMoves(opponentPlayer, oppMovesData);

  // If opponent has locked in an action, evaluate against that exact choice
  if (isOpponentLocked && lockedOpponentMoveKey && oppMovesData[lockedOpponentMoveKey]) {
    oppValid = [lockedOpponentMoveKey];
  }

  let bestMove = selfValid[0] || 'D+J';
  let bestScore = -Infinity;

  for (let sMove of selfValid) {
    let moveScore = 0;

    if (useExpectimax) {
      let sumVal = 0;
      for (let oMove of oppValid) {
        const { nextSelf, nextOpp } = simulateTurnState(
          cpuPlayer, opponentPlayer, sMove, oMove, selfMovesData, oppMovesData
        );
        sumVal += searchTree(nextSelf, nextOpp, maxDepth - 1);
      }
      moveScore = sumVal / oppValid.length;
    } else {
      let worstVal = Infinity;
      for (let oMove of oppValid) {
        const { nextSelf, nextOpp } = simulateTurnState(
          cpuPlayer, opponentPlayer, sMove, oMove, selfMovesData, oppMovesData
        );
        const score = searchTree(nextSelf, nextOpp, maxDepth - 1);
        worstVal = Math.min(worstVal, score);
      }
      moveScore = worstVal;
    }

    if (moveScore > bestScore) {
      bestScore = moveScore;
      bestMove = sMove;
    }
  }

  return bestMove;
}

  return bestMove;
}
