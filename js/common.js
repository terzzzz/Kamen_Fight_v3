/**
 * Shared Game & Combat Configuration & Global Helpers
 * Path: js/common.js
 */

window.COMBAT_RULES = {
  FAINT_THRESHOLD: 100,
  HIT_BUILDUP: 25,
  ROUND_RECOVERY: 13,
  FAINT_PENALTY_CHI_GUARD: 15,
  FAINT_PENALTY_STANDARD_GUARD: 25,
  FAINT_PENALTY_IDLE_GUARD: 5,
  STARTING_CHI: 8,
  MAX_CHI: 16,
  OFFENSIVE_TYPES: ['MELEE', 'PROJECTILE', 'SPECIAL', 'FINISHER', 'PHYSICAL']
};

window.GAME_CONFIG = {
  ROUND_TIME_LIMIT: 8.0,
  CHARGE_TIME_REQUIRED: 2.5,
  LATE_EXTENSION_BONUS: 1.0,
  LATE_DECISION_THRESHOLD: 7.0,
  HARD_CPU_HP_MULTIPLIER: 1.30
};

function getOpponentMovesData(opponentPlayer) {
  if (typeof gameState !== 'undefined') {
    if (opponentPlayer === gameState.p1 && gameState.p1Moves) return gameState.p1Moves;
    if (opponentPlayer === gameState.p2 && gameState.p2Moves) return gameState.p2Moves;
  }
  return typeof FALLBACK_ICHIGO_MOVES !== 'undefined' ? FALLBACK_ICHIGO_MOVES : {};
}

function getMatchTimingConfig() {
  const matchCfg = (typeof gameState !== 'undefined' && gameState.matchConfig) ? gameState.matchConfig : {};
  const sysCfg = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG : (window.GAME_CONFIG || {});

  const baseRoundWindow = (typeof gameState !== 'undefined' && gameState.roundTimeLimit !== undefined)
    ? gameState.roundTimeLimit
    : (matchCfg.roundTimeLimit || sysCfg.ROUND_TIME_LIMIT || 8.0);

  const chargeTimeRequired = (typeof gameState !== 'undefined' && gameState.chargeTimeRequired !== undefined)
    ? gameState.chargeTimeRequired
    : (matchCfg.chargeTimeRequired || sysCfg.CHARGE_TIME_REQUIRED || 2.5);

  const extensionBonus = (typeof gameState !== 'undefined' && gameState.lateExtensionBonus !== undefined)
    ? gameState.lateExtensionBonus
    : (matchCfg.lateExtensionBonus || sysCfg.LATE_EXTENSION_BONUS || 1.0);

  const lateThreshold = (typeof gameState !== 'undefined' && gameState.lateDecisionThreshold !== undefined)
    ? gameState.lateDecisionThreshold
    : (matchCfg.lateDecisionThreshold || sysCfg.LATE_DECISION_THRESHOLD || (baseRoundWindow - 1.0));

  return { baseRoundWindow, chargeTimeRequired, extensionBonus, lateThreshold };
}

/**
 * Balanced AI Profiles
 */
window.RIDER_AI_PROFILES = {
  ichigo: {
    weights: { W_LP: 1.0, W_CHI: 8.0, W_FAINT: 2.0 },
    dChargeRange: [88, 95]
  },
  nigo: {
    weights: { W_LP: 1.4, W_CHI: 6.0, W_FAINT: 1.5 },
    dChargeRange: [85, 92]
  },
  v3: {
    weights: { W_LP: 1.1, W_CHI: 10.0, W_FAINT: 2.5 },
    dChargeRange: [85, 95]
  },
  riderman: {
    weights: { W_LP: 1.2, W_CHI: 9.0, W_FAINT: 2.2 },
    dChargeRange: [85, 95]
  }
};
