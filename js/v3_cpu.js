/**
 * Kamen Rider V3 Tactical CPU AI Module
 * Path: js/v3_cpu.js
 */

function selectV3CPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty = 'normal') {
  const chi = cpuPlayer.chi || 0;
  const oppFaint = opponentPlayer.faintMeter || 0;
  const oppLP = opponentPlayer.lp || 0;
  const activeBuffs = cpuPlayer.activeBuffs || [];

  const hasSpeedBuff = activeBuffs.some(b => b.id === 'double_typhoon_speed');
  const hasAttackBuff = activeBuffs.some(b => b.id === 'red_lamp_boost');
  const isAirborne = cpuPlayer.airborneTicks > 0;

  // ----------------------------------------------------
  // EASY DIFFICULTY: Mostly Random Selection
  // ----------------------------------------------------
  if (difficulty === 'easy') {
    const keys = Object.keys(availableMoves);
    return keys[Math.floor(Math.random() * keys.length)];
  }

  // ----------------------------------------------------
  // 1. FAINTED OPPONENT PUNISHMENT (MAX DAMAGE)
  // ----------------------------------------------------
  if (opponentPlayer.isFainted) {
    if (chi >= 11 && availableMoves['S+I']) return 'S+I'; // Triple Kick (580 Dmg)
    if (chi >= 8 && availableMoves['S+L']) return 'S+L';  // Screw Kick (460 Dmg)
    if (chi >= 6 && availableMoves['S+K']) return 'S+K';  // Return Kick (260 Dmg)
    if (chi >= 4 && availableMoves['S+J']) return 'S+J';  // V3 Kick (215 Dmg)
    if (chi >= 1 && availableMoves['D+L']) return 'D+L';  // Chop Combo (136 Dmg)
    return availableMoves['D+K'] ? 'D+K' : 'D+J';
  }

  // ----------------------------------------------------
  // 2. HARD MODE: TACTICAL INTERCEPT & FAINT TRAP
  // ----------------------------------------------------
  if (difficulty === 'hard') {
    // FAINT TRAP: Opponent faint meter >= 70 -> REACH priority + 30 Faint Dmg forces FAINT
    if (oppFaint >= 70 && chi >= 3 && availableMoves['W+L']) {
      return 'W+L';
    }

    // LETHAL FINISHER CHECK
    if (hasAttackBuff || chi >= 11) {
      if (oppLP <= 650 && chi >= 11 && availableMoves['S+I']) return 'S+I';
      if (oppLP <= 500 && chi >= 8 && availableMoves['S+L']) return 'S+L';
    }

    // BUFF SETUP ROTATION
    // Priority A: Charge Speed Boost (W+J) when Chi >= 7
    if (!hasSpeedBuff && chi >= 7 && availableMoves['W+J']) {
      return 'W+J';
    }

    // Priority B: Red Lamp Attack Boost (W+K) when preparing an S-Attack string
    if (!hasAttackBuff && chi >= 6 && availableMoves['W+K'] && Math.random() < 0.65) {
      return 'W+K';
    }
  }

  // ----------------------------------------------------
  // 3. NORMAL MODE / GENERAL NEUTRAL STRATEGY
  // ----------------------------------------------------
  // Mid-range Faint Intercept
  if (oppFaint >= 75 && chi >= 3 && availableMoves['W+L'] && Math.random() < 0.50) {
    return 'W+L';
  }

  // Fire S-Attacks if heavily buffed
  if (hasAttackBuff) {
    if (chi >= 8 && availableMoves['S+L']) return 'S+L';
    if (chi >= 6 && availableMoves['S+K']) return 'S+K';
    if (chi >= 4 && availableMoves['S+J']) return 'S+J';
  }

  // Mid-Chi Special Harassment
  if (chi >= 8 && Math.random() < 0.40) {
    if (availableMoves['S+L']) return 'S+L';
  }

  if (chi >= 4 && Math.random() < 0.35) {
    if (availableMoves['S+J']) return 'S+J';
  }

  // ----------------------------------------------------
  // 4. CHI REGENERATION & PHYSICAL COMBOS (0-2 Chi)
  // ----------------------------------------------------
  if (chi >= 1 && Math.random() < 0.50) {
    if (availableMoves['D+L']) return 'D+L'; // Chop Combo
    if (availableMoves['D+I']) return 'D+I'; // Mixed Hits
  }

  // Default 0-Chi neutral physicals
  if (availableMoves['D+K'] && Math.random() < 0.60) return 'D+K'; // High Kick
  if (availableMoves['D+J']) return 'D+J';                         // Chop

  // Fallback
  const fallbackKeys = Object.keys(availableMoves);
  return fallbackKeys[Math.floor(Math.random() * fallbackKeys.length)];
}

if (typeof window !== 'undefined') {
  window.selectV3CPUMove = selectV3CPUMove;
}
