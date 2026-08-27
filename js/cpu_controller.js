/**
 * Universal CPU Move & Charge Controller
 * Path: js/cpu_controller.js
 */

function setUniversalChargeTarget(cpuPlayer, moveKey, difficulty, profile) {
  let target = 100;

  if (moveKey.startsWith('A+')) {
    target = 15;
  } else if (difficulty === 'easy') {
    target = Math.floor(Math.random() * 16) + 65;
  } else if (difficulty === 'hard') {
    target = Math.floor(Math.random() * 9) + 92;
  } else if (moveKey.startsWith('D')) {
    const range = profile.dChargeRange || [85, 95];
    target = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
  } else {
    target = Math.floor(Math.random() * 11) + 85;
  }

  cpuPlayer.activeChargePercent = target;
}

function selectCPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty = 'normal') {
  if (!availableMoves || Object.keys(availableMoves).length === 0) return 'D+J';

  const riderId = cpuPlayer.id || 'ichigo';
  const profile = (window.RIDER_AI_PROFILES && window.RIDER_AI_PROFILES[riderId])
    ? window.RIDER_AI_PROFILES[riderId]
    : { weights: { W_LP: 1.0, W_CHI: 8.0, W_FAINT: 2.0 }, dChargeRange: [85, 95] };

  const keys = Object.keys(availableMoves);
  let chosenKey = null;

  // EASY MODE BLUNDER RATE
  if (difficulty === 'easy' && Math.random() < 0.40) {
    chosenKey = keys[Math.floor(Math.random() * keys.length)];
  }

  // LETHAL FINISHER CHECK
  if (!chosenKey) {
    for (let key of keys) {
      const move = availableMoves[key];
      if (move && move.baseDamage) {
        const estimatedDmg = Math.floor(move.baseDamage * Math.sqrt(0.5 + 0.5 * 0.90));
        if (estimatedDmg >= opponentPlayer.lp) {
          chosenKey = key;
          break;
        }
      }
    }
  }

  // SAFE FORESEE ENGINE EXECUTION
  if (!chosenKey && window.ForeseeEngine && typeof window.ForeseeEngine.getBestMove === 'function') {
    try {
      const depth = difficulty === 'hard' ? 3 : (difficulty === 'easy' ? 1 : 2);
      const bestMove = window.ForeseeEngine.getBestMove(cpuPlayer, opponentPlayer, availableMoves, profile, depth);
      if (bestMove && availableMoves[bestMove]) {
        chosenKey = bestMove;
      }
    } catch (err) {
      console.warn("ForeseeEngine fallback triggered:", err);
    }
  }

  // FALLBACK RANDOM MOVE
  if (!chosenKey) {
    chosenKey = keys[Math.floor(Math.random() * keys.length)] || 'D+J';
  }

  setUniversalChargeTarget(cpuPlayer, chosenKey, difficulty, profile);
  return chosenKey;
}

if (typeof window !== 'undefined') {
  window.selectCPUMove = selectCPUMove;
  window.setUniversalChargeTarget = setUniversalChargeTarget;
}
