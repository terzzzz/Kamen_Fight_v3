/**
 * Universal CPU AI Controller
 * Path: js/cpu_controller.js
 * Replaces all individual rider CPU files.
 */

/**
 * Universal CPU Move & Charge Controller
 * Path: js/cpu_controller.js
 */

function selectCPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty = 'normal') {
  if (!availableMoves || Object.keys(availableMoves).length === 0) return 'D+J';

  const riderId = cpuPlayer.id || 'ichigo';
  const profile = (window.RIDER_AI_PROFILES && window.RIDER_AI_PROFILES[riderId])
    ? window.RIDER_AI_PROFILES[riderId]
    : { weights: { W_LP: 1.0, W_CHI: 8.0, W_FAINT: 2.0 }, dChargeRange: [85, 95] };

  const keys = Object.keys(availableMoves);

  // EASY MODE: 40% Random Blunder Rate & Lower Charge Target (65% - 80%)
  if (difficulty === 'easy') {
    cpuPlayer.activeChargePercent = Math.floor(Math.random() * 16) + 65;
    if (Math.random() < 0.40) {
      return keys[Math.floor(Math.random() * keys.length)];
    }
  } 
  // NORMAL MODE: Optimal Charge Target (85% - 95%)
  else if (difficulty === 'normal') {
    cpuPlayer.activeChargePercent = Math.floor(Math.random() * 11) + 85;
  } 
  // HARD MODE: Peak Charge Target (92% - 100%)
  else if (difficulty === 'hard') {
    cpuPlayer.activeChargePercent = Math.floor(Math.random() * 9) + 92;
  }

  // IMMEDIATE LETHAL CHECK: If any move KOs opponent this turn, execute immediately
  for (let key of keys) {
    const move = availableMoves[key];
    if (move && move.baseDamage && move.baseDamage >= opponentPlayer.lp) {
      return key;
    }
  }

  // FORESEE ENGINE LOOKAHEAD DISPATCH
  if (window.ForeseeEngine && typeof window.ForeseeEngine.getBestMove === 'function') {
    const depth = difficulty === 'hard' ? 3 : (difficulty === 'easy' ? 1 : 2);
    const bestMove = window.ForeseeEngine.getBestMove(cpuPlayer, opponentPlayer, availableMoves, profile, depth);
    if (bestMove && availableMoves[bestMove]) {
      return bestMove;
    }
  }

  return keys[Math.floor(Math.random() * keys.length)] || 'D+J';
}

if (typeof window !== 'undefined') {
  window.selectCPUMove = selectCPUMove;
}

/**
 * Universal Charge Target Tuning
 */
function setUniversalChargeTarget(cpuPlayer, moveKey, maxAchievableCharge, difficulty, profile) {
  let target = 100;

  if (difficulty === 'hard') {
    target = 98 + Math.floor(Math.random() * 3);
  } else if (moveKey.startsWith('A+')) {
    target = 15;
  } else if (moveKey.startsWith('D')) {
    const range = profile.dChargeRange || [85, 95];
    target = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
  }

  cpuPlayer.activeChargePercent = Math.min(target, maxAchievableCharge);
}

if (typeof window !== 'undefined') {
  window.selectCPUMove = selectCPUMove;
}
