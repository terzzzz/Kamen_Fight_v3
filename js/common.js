/**
 * Shared Game & Combat Configuration & Global Helpers
 * Path: js/common.js
 */

window.COMBAT_RULES = {
  FAINT_THRESHOLD: 100,
  HIT_BUILDUP: 25,
  ROUND_RECOVERY: 13,
  FAINT_PENALTY_CHI_GUARD: 15,
  FAINT_PENALTY_STANDARD_GUARD: 12,
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
  HARD_CPU_HP_MULTIPLIER: 1.10,
  HARD_CPU_DMG_MULTIPLIER: 1.10
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
