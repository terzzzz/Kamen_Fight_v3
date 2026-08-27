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
   * Evaluates leaf states using weighted LP, Chi, Faint, and threshold step-bonuses.
   */
  function evaluateLeafState(selfState, oppState, characterWeights = {}) {
    if (oppState.lp <= 0) return 10000;
    if (selfState.lp <= 0) return -10000;

    const W_LP = characterWeights.W_LP || 1.0;
    const W_CHI = characterWeights.W_CHI || 45.0;
    const W_FAINT = characterWeights.W_FAINT || 3.0;

    let score = ((selfState.lp - oppState.lp) * W_LP) +
                ((Math.min(16, selfState.chi) - Math.min(16, oppState.chi)) * W_CHI) +
                ((oppState.faintMeter - selfState.faintMeter) * W_FAINT);

    // Stun Threshold Step-Bonuses
    if (oppState.faintMeter >= 100) score += 300;
    if (selfState.faintMeter >= 100) score -= 300;

    // Character Buff Synergies
    if (selfState.activeBuffs && selfState.activeBuffs.some(b => b.id === 'power_focus' || b.id === 'focus')) {
      score += 80;
    }
    if (selfState.activeBuffs && selfState.activeBuffs.some(b => b.id === 'double_typhoon_speed' || b.id === 'red_lamp_boost')) {
      score += 90;
    }

    return score;
  }

  /**
   * Main 3-Turn Minimax Decision Search Function
   */
  function run3TurnForeseeSearch(cpuPlayer, opponentPlayer, selfMovesData, oppMovesData, options = {}) {
    const maxDepth = options.maxDepth || 3;
    const characterWeights = options.characterWeights || {};
    const isOpponentLocked = options.isOpponentLocked || false;
    const lockedOpponentMoveKey = options.lockedOpponentMoveKey || null;

    const getValidMoves = (player, moves) => {
      const valid = Object.keys(moves).filter(k => (moves[k].chiCost || 0) <= player.chi);
      return valid.length > 0 ? valid : ['D+J'];
    };

    function minimax(selfState, oppState, depth) {
      if (depth === 0 || selfState.lp <= 0 || oppState.lp <= 0) {
        return evaluateLeafState(selfState, oppState, characterWeights);
      }

      const selfValid = getValidMoves(selfState, selfMovesData);
      const oppValid = getValidMoves(oppState, oppMovesData);

      let bestSelfVal = -Infinity;

      for (let sMove of selfValid) {
        let worstOppVal = Infinity;

        for (let oMove of oppValid) {
          const { nextSelf, nextOpp } = simulateTurnState(
            selfState, oppState, sMove, oMove, selfMovesData, oppMovesData
          );

          const nodeValue = minimax(nextSelf, nextOpp, depth - 1);
          worstOppVal = Math.min(worstOppVal, nodeValue);
        }

        bestSelfVal = Math.max(bestSelfVal, worstOppVal);
      }

      return bestSelfVal;
    }

    const selfValid = getValidMoves(cpuPlayer, selfMovesData);
    let oppValid = getValidMoves(opponentPlayer, oppMovesData);

    // IF HUMAN/OPPONENT HAS ALREADY LOCKED IN A MOVE, WE REACT DIRECTLY TO IT
    if (isOpponentLocked && lockedOpponentMoveKey && oppMovesData[lockedOpponentMoveKey]) {
      oppValid = [lockedOpponentMoveKey];
    }

    let bestMove = selfValid[0] || 'D+J';
    let bestScore = -Infinity;

    for (let sMove of selfValid) {
      let worstOppVal = Infinity;

      for (let oMove of oppValid) {
        const { nextSelf, nextOpp } = simulateTurnState(
          cpuPlayer, opponentPlayer, sMove, oMove, selfMovesData, oppMovesData
        );

        const score = minimax(nextSelf, nextOpp, maxDepth - 1);
        worstOppVal = Math.min(worstOppVal, score);
      }

      if (worstOppVal > bestScore) {
        bestScore = worstOppVal;
        bestMove = sMove;
      }
    }

    return bestMove;
  }

  window.ForeseeEngine = {
    simulateTurnState,
    evaluateLeafState,
    run3TurnForeseeSearch
  };

})(typeof window !== 'undefined' ? window : this);
