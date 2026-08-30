/**
 * Combat Engine, Attack Resolution & Damage Calculations
 * Path: js/combat_engine.js
 */

const COMBAT_RULES = window.COMBAT_RULES || {
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

const GAME_CONFIG = window.GAME_CONFIG || {
  ROUND_TIME_LIMIT: 8.0,
  CHARGE_TIME_REQUIRED: 2.5,
  LATE_EXTENSION_BONUS: 1.0,
  LATE_DECISION_THRESHOLD: 7.0,
  HARD_CPU_HP_MULTIPLIER: 1.10,
  HARD_CPU_DMG_MULTIPLIER: 1.10
};

var DO_NOTHING_MOVE = window.DO_NOTHING_MOVE || {
  name: "Do Nothing",
  type: "IDLE",
  chiCost: 0,
  baseDamage: 0,
  hitChance: 100,
  video: "idle.mp4"
};

/* --- MOVE PRIORITY & FAINT HELPERS --- */

function getAttackerChiGainOnHit(atkMove, atkMoveKey) {
  if (!atkMove || !atkMoveKey) return 0;
  if (typeof atkMove.chiRefundOnHit === 'number' && atkMove.chiRefundOnHit > 0) return atkMove.chiRefundOnHit;
  if (atkMoveKey.startsWith('D')) {
    const cost = atkMove.chiCost || 0;
    if (cost === 0) return 2;
    if (cost === 1) return 3;
  }
  return 0;
}

function getMoveRangePriority(move, moveKey = '') {
  if (!move) return 1;
  const range = (move.rangeType || 'MELEE').toUpperCase();
  const type = (move.type || '').toUpperCase();
  const isWSkill = (moveKey && moveKey.startsWith('W')) || type === 'UTILITY' || type === 'BUFF';

  if (range === 'PROJECTILE') return 4;
  if (range === 'REACH' || range === 'ROPE' || range === 'MID_RANGE') return 3;
  if (isWSkill) return 2;
  return 1;
}

function getFaintDamageForMove(move) {
  if (move && typeof move.baseFaintDamage === 'number') {
    return move.baseFaintDamage;
  }
  return (window.COMBAT_RULES || COMBAT_RULES).HIT_BUILDUP || 25;
}

async function applyFaintBuildUp(player, playerKey, customAmount = null) {
  if (!player || player.lp <= 0 || player.isFainted) return;

  const rules = window.COMBAT_RULES || COMBAT_RULES;
  player.tookCleanHitThisRound = true;
  let amount = customAmount !== null ? customAmount : rules.HIT_BUILDUP;

  if (player.chi < 5) {
    amount = Math.floor(amount * 1.25);
  }

  player.faintMeter = Math.min(rules.FAINT_THRESHOLD, player.faintMeter + amount);

  if (player.faintMeter >= rules.FAINT_THRESHOLD) {
    player.isFainted = true;
    player.willBeFaintedNextRound = true;

    const stunOverlay = document.getElementById(`${playerKey}-stun-overlay`);
    if (stunOverlay) stunOverlay.hidden = false;

    if (typeof window.triggerFloatingText === 'function') {
      window.triggerFloatingText(playerKey, 'FAINTED!!', 'scratch');
    }

    if (typeof window.playCenterVideo === 'function') {
      await window.playCenterVideo(playerKey, 'faint.mp4', 'FAINTED!');
    }

    if (typeof window.updateCharacterMedia === 'function') {
      window.updateCharacterMedia(playerKey, 'IDLE');
    }
  }
}

/* --- COMBAT DAMAGE RESOLUTION --- */

function resolveAttack(attacker, defender, atkMove, atkMoveKey, defMove, defMoveKey, defenderKey) {
  const rules = window.COMBAT_RULES || COMBAT_RULES;
  const config = window.GAME_CONFIG || GAME_CONFIG;
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
    let finalFaintPenalty = defender.chi < 5 ? Math.floor(faintPenalty * 1.25) : faintPenalty;

    defender.faintMeter = Math.min(rules.FAINT_THRESHOLD, defender.faintMeter + finalFaintPenalty);
    if (defender.faintMeter >= rules.FAINT_THRESHOLD) {
      defender.isFainted = true;
      defender.willBeFaintedNextRound = true;
      const stunOverlay = document.getElementById(`${defenderKey}-stun-overlay`);
      if (stunOverlay) stunOverlay.hidden = false;
      if (typeof window.triggerFloatingText === 'function') {
        window.triggerFloatingText(defenderKey, 'FAINTED!!', 'scratch');
      }
    }

    let defenderChargeRatio = Math.min(1.0, Math.max(0.0, (defender.activeChargePercent !== undefined ? defender.activeChargePercent : 100) / 100));
    let defenderChargeFactor = Math.sqrt(0.5 + (0.5 * defenderChargeRatio));
    let effectiveGuardChance = 70 * defenderChargeFactor;

    const isSpecialGuard = (defMoveKey === 'A+I' && guardChiCost > 0) || defMove.name === 'Windmill Guard' || defMove.isSpecialGuard === true;

    if (isSpecialGuard) {
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

  if (defender.isFainted || isGuarding || defMove.type === 'IDLE' || defMoveKey === 'DO_NOTHING') {
    rolledHit = true;
  } else {
    let baseHitChance = atkMove.hitChance || 80;
    let isDOrS = atkMoveKey.startsWith('D') || atkMoveKey.startsWith('S');
    let accuracyDiscount = isDOrS ? chargeFactor : 1.0;
    let attackerHitBonus = (attacker.chi > 14) ? 20 : 0;

    let rawHitRate = (baseHitChance * accuracyDiscount) + attackerHitBonus;
    let baseEvasionPct = (defender && defender.evasionRate !== undefined) ? defender.evasionRate : 0.0;
    let effectiveHitChance = Math.max(10, Math.min(100, rawHitRate * (1.0 - baseEvasionPct)));

    rolledHit = Math.random() * 100 < effectiveHitChance;
  }

  if (!rolledHit) {
    return { isOffensive: true, hitLanded: false, isGlancing: false, guardSuccess: false, isMatchingGuard: false, chiGained: 0, finalDmg: 0 };
  }

  if (!isGuarding && !defender.isFainted) {
    isGlancing = Math.random() * 100 < (atkMove.scratchRate || 20);
  }

  let fullPowerMultiplier = attacker.chi > 14 ? 1.20 : 1.0;
  let lowPowerDefMultiplier = defender.chi < 5 ? 1.25 : 1.0;
  let hardDmgMultiplier = (attacker.isCPU && attacker.difficulty === 'hard') ? (config.HARD_CPU_DMG_MULTIPLIER || 1.10) : 1.0;

  let baseDamage = atkMove.baseDamage || 0;
  let calculatedDmg = baseDamage * chargeFactor * fullPowerMultiplier * lowPowerDefMultiplier * hardDmgMultiplier * damageRatio;
  let finalDmg = (isGlancing && calculatedDmg > 0) ? Math.max(1, Math.floor(calculatedDmg * 0.20)) : Math.floor(calculatedDmg);

  return { isOffensive: true, hitLanded: true, isGlancing: isGlancing, guardSuccess: guardSuccess, isMatchingGuard: isMatchingGuard, chiGained: chiGained, finalDmg: finalDmg };
}

/* --- TURN RESOLUTION ORCHESTRATION --- */

async function executeTurnResolutionPhase() {
  const rules = window.COMBAT_RULES || COMBAT_RULES;
  window.gameState.roundPhase = 'RESOLUTION';

  let p1MoveKey = window.gameState.p1SelectedMoveKey || window.gameState.input?.selectedMoveKey || 'DO_NOTHING';
  let p2MoveKey = window.gameState.p2AlwaysIdle ? 'DO_NOTHING' : (window.gameState.p2SelectedMoveKey || 'DO_NOTHING');

  const defaultMove = window.DO_NOTHING_MOVE || { name: 'Do Nothing', type: 'IDLE', baseDamage: 0, chiCost: 0 };
  let p1Move = (typeof window.getMoveForPlayer === 'function' ? window.getMoveForPlayer('p1', p1MoveKey) : null) || defaultMove;
  let p2Move = (typeof window.getMoveForPlayer === 'function' ? window.getMoveForPlayer('p2', p2MoveKey) : null) || defaultMove;

  // Deduct Chi
  if (p1MoveKey !== 'DO_NOTHING' && p1Move.chiCost) {
    window.gameState.p1.chi = Math.max(0, window.gameState.p1.chi - p1Move.chiCost);
  }
  if (p2MoveKey !== 'DO_NOTHING' && p2Move.chiCost) {
    window.gameState.p2.chi = Math.max(0, window.gameState.p2.chi - p2Move.chiCost);
  }

  if (typeof window.updatePlayerHUD === 'function') {
    window.updatePlayerHUD('p1', window.gameState.p1);
    window.updatePlayerHUD('p2', window.gameState.p2);
  }

  const p1Charge = window.gameState.p1.activeChargePercent !== undefined ? window.gameState.p1.activeChargePercent : 100;
  const p2Charge = window.gameState.p2.activeChargePercent !== undefined ? window.gameState.p2.activeChargePercent : 100;

  const battleMsg = document.getElementById('battle-message');
  if (battleMsg) {
    battleMsg.hidden = false;
    battleMsg.innerHTML = `P1: ${p1Move.name} (${p1Charge}%) VS P2: ${p2Move.name} (${p2Charge}%)`;
  }

  let p1GoesFirst = true;
  let p1Priority = getMoveRangePriority(p1Move, p1MoveKey);
  let p2Priority = getMoveRangePriority(p2Move, p2MoveKey);

  if (p1Priority < p2Priority) {
    p1GoesFirst = false;
  } else if (p1Priority === p2Priority) {
    p1GoesFirst = p1Charge >= p2Charge;
  }

  let attacker1 = p1GoesFirst ? window.gameState.p1 : window.gameState.p2;
  let defender1 = p1GoesFirst ? window.gameState.p2 : window.gameState.p1;
  let move1 = p1GoesFirst ? p1Move : p2Move;
  let key1 = p1GoesFirst ? p1MoveKey : p2MoveKey;
  let atkKey1 = p1GoesFirst ? 'p1' : 'p2';
  let defKey1 = p1GoesFirst ? 'p2' : 'p1';

  let attacker2 = p1GoesFirst ? window.gameState.p2 : window.gameState.p1;
  let defender2 = p1GoesFirst ? window.gameState.p1 : window.gameState.p2;
  let move2 = p1GoesFirst ? p2Move : p1Move;
  let key2 = p1GoesFirst ? p2MoveKey : p1MoveKey;
  let atkKey2 = p1GoesFirst ? 'p2' : 'p1';
  let defKey2 = p1GoesFirst ? 'p1' : 'p2';

  // Act 1
  if (move1.type !== 'IDLE' && key1 !== 'DO_NOTHING') {
    if (typeof window.playCenterVideo === 'function') {
      await window.playCenterVideo(atkKey1, move1.video || 'idle.mp4', move1.name, null, move1);
    }

    let res = resolveAttack(attacker1, defender1, move1, key1, move2, key2, defKey1);
    if (res.isOffensive && res.hitLanded) {
      defender1.lp = Math.max(0, defender1.lp - res.finalDmg);
      if (typeof window.showDamagePopup === 'function') {
        window.showDamagePopup(`${defKey1}-box`, `-${res.finalDmg}`, 'damage');
      }
      await applyFaintBuildUp(defender1, defKey1, getFaintDamageForMove(move1));
    }
  }

  // Act 2
  if (defender1.lp > 0 && !attacker2.isFainted && move2.type !== 'IDLE' && key2 !== 'DO_NOTHING') {
    if (typeof window.playCenterVideo === 'function') {
      await window.playCenterVideo(atkKey2, move2.video || 'idle.mp4', move2.name, null, move2);
    }

    let res = resolveAttack(attacker2, defender2, move2, key2, move1, key1, defKey2);
    if (res.isOffensive && res.hitLanded) {
      defender2.lp = Math.max(0, defender2.lp - res.finalDmg);
      if (typeof window.showDamagePopup === 'function') {
        window.showDamagePopup(`${defKey2}-box`, `-${res.finalDmg}`, 'damage');
      }
      await applyFaintBuildUp(defender2, defKey2, getFaintDamageForMove(move2));
    }
  }

  // Round Cleanup
  setTimeout(() => {
    if (typeof window.hideCenterScreen === 'function') window.hideCenterScreen();
    if (battleMsg) battleMsg.hidden = true;

    if (typeof window.updatePlayerHUD === 'function') {
      window.updatePlayerHUD('p1', window.gameState.p1);
      window.updatePlayerHUD('p2', window.gameState.p2);
    }

    if (window.gameState.p1.lp > 0 && window.gameState.p2.lp > 0) {
      window.gameState.roundCounter++;
      if (typeof window.startRoundCountdown === 'function') {
        window.startRoundCountdown();
      }
    } else {
      window.gameState.roundPhase = 'GAME_OVER';
      let text = window.gameState.p1.lp <= 0 ? "P2 WINS!" : "P1 WINS!";
      if (battleMsg) {
        battleMsg.hidden = false;
        battleMsg.innerHTML = `GAME OVER!<br>${text}<br><small>TAP TO CONTINUE</small>`;
      }
      window.gameState.canContinueFromGameOver = true;
    }
  }, 1000);
}

// Global Exports
window.executeTurnResolutionPhase = executeTurnResolutionPhase;
window.applyFaintBuildUp = applyFaintBuildUp;
window.resolveAttack = resolveAttack;
window.getMoveRangePriority = getMoveRangePriority;
window.getAttackerChiGainOnHit = getAttackerChiGainOnHit;
window.getFaintDamageForMove = getFaintDamageForMove;
