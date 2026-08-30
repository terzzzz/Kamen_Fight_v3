/**
 * Combat Engine & Turn Resolution Manager
 * Path: js/combat_engine.js (or js/combat.js)
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

var CHARGE_TIMES = CHARGE_TIMES || {
  'A': 1280,  // Defense
  'D': 2080,  // Offense
  'W': 3200,  // Air/Buffs
  'S': 4160   // Energy/Specials
};

var DO_NOTHING_MOVE = DO_NOTHING_MOVE || {
  name: "Do Nothing",
  type: "IDLE",
  chiCost: 0,
  baseDamage: 0,
  hitChance: 100,
  video: "idle.mp4"
};

var FALLBACK_ICHIGO_MOVES = {
  "W+I": { name: "Rider High Jump", type: "UTILITY", chiCost: 3, baseDamage: 0, hitChance: 100, video: "jump.mp4", grantsAirborne: 2 },
  "W+J": { name: "Typhoon Charge", type: "UTILITY", chiCost: 3, baseDamage: 0, hitChance: 100, video: "charge_up.mp4", buff: { id: "charge_speed", label: "CHARGE SPEED +25%", type: "speed", duration: 3 } },
  "W+K": { name: "Typhoon Focus", type: "UTILITY", chiCost: 2, baseDamage: 0, hitChance: 100, video: "charge_up.mp4", buff: { id: "focus", label: "S-ATK +20%", type: "attack", duration: 2 } },
  "W+L": { name: "Typhoon Emission", type: "UTILITY", chiCost: 1, baseDamage: 0, hitChance: 100, video: "mind.mp4", faintRecovery: 15 },
  "D+J": { name: "Standard Punch", type: "PHYSICAL", chiCost: 0, baseDamage: 66, hitChance: 85, video: "punch.mp4" },
  "D+K": { name: "Standard Kick", type: "PHYSICAL", chiCost: 0, baseDamage: 88, hitChance: 88, video: "kick.mp4" },
  "D+L": { name: "Combo Punch", type: "PHYSICAL", chiCost: 1, baseDamage: 132, hitChance: 82, video: "combo_punch.mp4" },
  "D+I": { name: "Combo Kick", type: "PHYSICAL", chiCost: 1, baseDamage: 121, hitChance: 85, video: "combo_kick.mp4", unmirrored: true },
  "S+J": { name: "Rider Power Chop", type: "SPECIAL", chiCost: 3, baseDamage: 200, hitChance: 80, video: "power_chop.mp4" },
  "S+K": { name: "Rider Head Crusher", type: "SPECIAL", chiCost: 4, baseDamage: 240, hitChance: 75, video: "head_crusher.mp4" },
  "S+L": { name: "Rider Kick", type: "SPECIAL", chiCost: 6, baseDamage: 430, hitChance: 70, video: "rider_kick.mp4" },
  "S+I": { name: "Kirimomi Kick", type: "SPECIAL", chiCost: 10, baseDamage: 550, hitChance: 76, video: "kirimomi_kick.mp4" },
  "A+I": { name: "Windmill Guard", type: "DEFENSE", chiCost: 3, baseDamage: 0, hitChance: 100, video: "windmill_guard.mp4", unmirrored: true },
  "A+J": { name: "High Guard", type: "DEFENSE", chiCost: 0, baseDamage: 0, hitChance: 100, video: "guard.mp4" },
  "A+K": { name: "Mid Guard", type: "DEFENSE", chiCost: 0, baseDamage: 0, hitChance: 100, video: "guard.mp4" },
  "A+L": { name: "Side Guard", type: "DEFENSE", chiCost: 0, baseDamage: 0, hitChance: 100, video: "guard.mp4" }
};

if (!window.gameState) {
  window.gameState = {
    roundCounter: 1,
    roundPhase: 'IDLE',
    turnTimerSeconds: 8,
    timerInterval: null,
    p1Moves: {},
    p2Moves: {},
    videoCache: {},
    p1: null,
    p2: null,
    p2AlwaysIdle: false,
    canContinueFromGameOver: false,
    p1SelectedMoveKey: null,
    p2SelectedMoveKey: null,
    p1IsConfirmed: false,
    p2IsConfirmed: false,
    p1LockInTime: 0,
    p2LockInTime: 0,
    p2ActiveChargePercent: 100,
    input: {
      acceptingInputs: false,
      heldDirection: null,
      chargeStartTime: 0,
      currentPercent: 0,
      isConfirmed: false,
      selectedMoveKey: null,
      lockInTime: 0,
      chargeInterval: null
    },
    p2Input: {
      heldDirection: null
    }
  };
}

/* Combat Logic Helpers */
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

/**
 * Range & Type Priority Hierarchy:
 * Priority 4: PROJECTILE
 * Priority 3: REACH / ROPE / MID_RANGE
 * Priority 2: W SKILLS / UTILITY / BUFF (Executes before standard D/S melee!)
 * Priority 1: Standard MELEE Attacks
 */
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

function triggerLPFlash(slotKey, isHeal = false) {
  const lpContainer = document.getElementById(`${slotKey}-lp`);
  if (!lpContainer) return;

  const targetEl = lpContainer.querySelector('.stat-value-styled') || lpContainer;
  const flashClass = isHeal ? 'lp-flash-heal' : 'lp-flash-damage';

  targetEl.classList.remove('lp-flash-heal', 'lp-flash-damage');
  void targetEl.offsetWidth;
  targetEl.classList.add(flashClass);

  setTimeout(() => {
    targetEl.classList.remove(flashClass);
  }, 1000);
}

function triggerFloatingNumber(slotKey, amount, isHeal = false) {
  const container = document.getElementById(`${slotKey}-box`) || document.querySelector(`.${slotKey}-hud`);
  if (!container) return;

  const roundedAmount = Math.round(amount);
  if (roundedAmount <= 0) return;

  triggerLPFlash(slotKey, isHeal);

  const activePopups = container.querySelectorAll('.damage-popup');
  const stackIndex = activePopups.length;

  const popup = document.createElement('div');
  popup.className = `damage-popup popup-number ${isHeal ? 'heal' : 'damage'}`;
  popup.textContent = isHeal ? `+${roundedAmount}` : `-${roundedAmount}`;

  if (stackIndex > 0) {
    popup.style.marginTop = `${stackIndex * -30}px`;
    popup.style.marginLeft = `${(stackIndex % 2 === 1 ? 15 : -15)}px`;
  }

  container.appendChild(popup);

  setTimeout(() => {
    popup.remove();
  }, 1800);
}

function triggerFloatingText(slotKey, text, customClass = '') {
  const container = document.getElementById(`${slotKey}-box`) || document.querySelector(`.${slotKey}-hud`);
  if (!container) return;

  const activePopups = container.querySelectorAll('.damage-popup');
  const stackIndex = activePopups.length;

  const popup = document.createElement('div');
  popup.className = `damage-popup popup-text ${customClass}`;
  popup.textContent = text;

  if (stackIndex > 0) {
    popup.style.marginTop = `${stackIndex * -30}px`;
    popup.style.marginLeft = `${(stackIndex % 2 === 1 ? -15 : 15)}px`;
  }

  container.appendChild(popup);

  setTimeout(() => {
    popup.remove();
  }, 1800);
}

function triggerStaggeredPopups(slotKey, popups) {
  popups.forEach((item, index) => {
    setTimeout(() => {
      if (item.type === 'text') {
        triggerFloatingText(slotKey, item.text, item.customClass || '');
      } else if (item.type === 'number') {
        triggerFloatingNumber(slotKey, item.amount, item.isHeal || false);
      }
    }, index * 700);
  });
}

function applyBuff(player, buffId, label, buffType, durationRounds) {
  if (!player.activeBuffs) player.activeBuffs = [];
  player.activeBuffs = player.activeBuffs.filter(b => b.id !== buffId);
  player.activeBuffs.push({
    id: buffId,
    label: label,
    type: buffType,
    roundsLeft: durationRounds,
    appliedRound: window.gameState.roundCounter
  });
  if (typeof updatePlayerHUD === 'function') {
    updatePlayerHUD(player === window.gameState.p1 ? 'p1' : 'p2', player);
  }
}

function processRoundBuffs(player) {
  if (!player.activeBuffs) return;
  player.activeBuffs.forEach(b => {
    if (b.appliedRound !== window.gameState.roundCounter) {
      b.roundsLeft--;
    }
  });
  player.activeBuffs = player.activeBuffs.filter(b => b.roundsLeft > 0);
  if (typeof updatePlayerHUD === 'function') {
    updatePlayerHUD(player === window.gameState.p1 ? 'p1' : 'p2', player);
  }
}

function handleAirborneState(player, moveKey, move) {
  if (move && move.grantsAirborne) {
    player.airborneTicks = move.grantsAirborne;
    player.airborneAppliedRound = window.gameState.roundCounter;
    player.airborneChargePercent = player.activeChargePercent !== undefined ? player.activeChargePercent : 100;
  } else if (player.airborneTicks > 0) {
    if (move && move.forcesLanding) {
      player.airborneTicks = 0;
    } else if (player.airborneAppliedRound !== window.gameState.roundCounter) {
      player.airborneTicks--;
    }
  }
  if (typeof updatePlayerHUD === 'function') {
    updatePlayerHUD(player === window.gameState.p1 ? 'p1' : 'p2', player);
  }
}

function setSideBoxesBlank(isBlank) {
  const p1Box = document.getElementById('p1-box');
  const p2Box = document.getElementById('p2-box');
  if (p1Box) p1Box.classList.toggle('blanked', isBlank);
  if (p2Box) p2Box.classList.toggle('blanked', isBlank);
}

function updateHUD() {
  if (typeof window.updatePlayerHUD === 'function') {
    window.updatePlayerHUD('p1', window.gameState.p1);
    window.updatePlayerHUD('p2', window.gameState.p2);
  }

  const turnDisp = document.getElementById('turn-display');
  if (turnDisp) turnDisp.textContent = `ROUND ${window.gameState.roundCounter}`;
}

async function applyFaintBuildUp(player, playerKey, customAmount = null) {
  if (!player || player.lp <= 0 || player.isFainted) return;

  const rules = window.COMBAT_RULES || COMBAT_RULES;
  player.tookCleanHitThisRound = true;
  let amount = customAmount !== null ? customAmount : rules.HIT_BUILDUP;

  // LOW POWER DEFENDER VULNERABILITY (+25% Faint Buildup Taken)
  if (player.chi < 5) {
    amount = Math.floor(amount * 1.25);
  }

  player.faintMeter = Math.min(rules.FAINT_THRESHOLD, player.faintMeter + amount);

  if (player.faintMeter >= rules.FAINT_THRESHOLD) {
    player.isFainted = true;
    player.willBeFaintedNextRound = true;

    const stunOverlay = document.getElementById(`${playerKey}-stun-overlay`);
    if (stunOverlay) stunOverlay.hidden = false;

    triggerFloatingText(playerKey, 'FAINTED!!', 'scratch');

    if (typeof window.playCenterVideo === 'function') {
      await window.playCenterVideo(playerKey, 'faint.mp4', 'FAINTED!');
    }

    if (typeof window.updateCharacterMedia === 'function') {
      window.updateCharacterMedia(playerKey, 'IDLE');
    }
  }
}

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
    const faintPenalty = guardChiCost > 0 
      ? rules.FAINT_PENALTY_CHI_GUARD 
      : rules.FAINT_PENALTY_STANDARD_GUARD;

    defender.tookCleanHitThisRound = true;
    
    // Apply Faint Penalty on Guard (incorporates Low Power +25% if applicable)
    let finalFaintPenalty = faintPenalty;
    if (defender.chi < 5) finalFaintPenalty = Math.floor(finalFaintPenalty * 1.25);

    defender.faintMeter = Math.min(rules.FAINT_THRESHOLD, defender.faintMeter + finalFaintPenalty);
    if (defender.faintMeter >= rules.FAINT_THRESHOLD) {
      defender.isFainted = true;
      defender.willBeFaintedNextRound = true;
      const stunOverlay = document.getElementById(`${defenderKey}-stun-overlay`);
      if (stunOverlay) stunOverlay.hidden = false;
      triggerFloatingText(defenderKey, 'FAINTED!!', 'scratch');
    }

    let defenderChargeRatio = Math.min(1.0, Math.max(0.0, (defender.activeChargePercent !== undefined ? defender.activeChargePercent : 100) / 100));
    let defenderChargeFactor = Math.sqrt(0.5 + (0.5 * defenderChargeRatio));
    let effectiveGuardChance = 70 * defenderChargeFactor;

    const isSpecialGuard = (defMoveKey === 'A+I' && guardChiCost > 0) || defMove.name === 'Windmill Guard' || defMove.name === 'Cutter Blade Block' || defMove.isSpecialGuard === true;

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

  if (defender.isFainted) {
    rolledHit = true;
    isGlancing = false;
  } else if (isGuarding) {
    rolledHit = true;
  } else if (defMove.type === 'IDLE' || defMoveKey === 'DO_NOTHING' || defMove.name === 'Do Nothing') {
    rolledHit = true;
  } else {
    let baseHitChance = atkMove.hitChance || 80;

    let isDOrS = atkMoveKey.startsWith('D') || atkMoveKey.startsWith('S') || atkMove.category === 'D' || atkMove.category === 'S' || atkMove.tier === 'S';
    let accuracyDiscount = isDOrS ? chargeFactor : 1.0;

    let attackerHitBonus = (attacker.id === 'nigo' && attacker.airborneTicks > 0) ? 15 : 0;

    // FULL POWER ATTACKER BONUS (+20% Accuracy)
    if (attacker.chi > 14) {
      attackerHitBonus += 20;
    }

    if (attacker.activeBuffs && attacker.activeBuffs.some(b => b.id === 'arm_calibration' || b.id === 'accuracy_focus' || b.id === 'red_lamp_boost')) {
      attackerHitBonus += 15;
    }

    let rawHitRate = (baseHitChance * accuracyDiscount) + attackerHitBonus;

    let baseEvasionPct = (defender && defender.evasionRate !== undefined) ? defender.evasionRate : 0.0;
    if (defender.airborneTicks > 0 && defender.activeBuffs) {
      if (defender.activeBuffs.some(b => b.id === 'airborne_evasion')) {
        baseEvasionPct += 0.20;
      } else if (defender.activeBuffs.some(b => b.id === 'airborne_boost')) {
        baseEvasionPct += (defender.id === 'ichigo' ? 0.20 : 0.15);
      }
    }

    let instabilityMult = 1.0;
    if (defender.airborneTicks > 0 && defender.airborneAppliedRound === window.gameState.roundCounter) {
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
  let typhoonMultiplier = (isDOrS && attacker.activeBuffs && attacker.activeBuffs.some(b => b.id === 'typhoon' || b.id === 'typhoon_speed' || b.id === 'double_typhoon' || b.id === 'charge_speed')) ? 1.25 : 1.0;

  let focusMultiplier = 1.0;
  if (attacker.activeBuffs) {
    if (atkMoveKey.startsWith('S') && attacker.activeBuffs.some(b => b.id === 'focus' || b.id === 'v3_focus')) {
      focusMultiplier = 1.20;
    } else if (atkMoveKey.startsWith('D') && attacker.activeBuffs.some(b => b.id === 'power_focus')) {
      focusMultiplier = 1.30;
    } else if (attacker.activeBuffs.some(b => b.id === 'red_lamp_boost')) {
      focusMultiplier = 1.15;
    }
  }

  let jumpAtkMultiplier = attacker.airborneTicks > 0 ? 1.15 : 1.0;

  // CHI THRESHOLD & HARD CPU DAMAGE MULTIPLIERS
  let fullPowerMultiplier = attacker.chi > 14 ? 1.20 : 1.0;    // FULL POWER: +20% Damage Dealt
  let lowPowerDefMultiplier = defender.chi < 5 ? 1.25 : 1.0;   // LOW POWER: +25% Damage Taken
  let hardDmgMultiplier = (attacker.isCPU && attacker.difficulty === 'hard') ? (config.HARD_CPU_DMG_MULTIPLIER || 1.10) : 1.0;

  let baseDamage = atkMove.baseDamage || 0;
  let calculatedDmg = baseDamage * chargeFactor * typhoonMultiplier * focusMultiplier * jumpAtkMultiplier * fullPowerMultiplier * lowPowerDefMultiplier * hardDmgMultiplier * damageRatio;

  let finalDmg = (isGlancing && calculatedDmg > 0) ? Math.max(1, Math.floor(calculatedDmg * 0.20)) : Math.floor(calculatedDmg);

  return { isOffensive: true, hitLanded: true, isGlancing: isGlancing, guardSuccess: guardSuccess, isMatchingGuard: isMatchingGuard, chiGained: chiGained, finalDmg: finalDmg };
}

async function executeTurnResolutionPhase() {
  const rules = window.COMBAT_RULES || COMBAT_RULES;
  window.gameState.roundPhase = 'RESOLUTION';

  const p1StartLp = window.gameState.p1.lp;
  const p2StartLp = window.gameState.p2.lp;
  const p1StartFaint = window.gameState.p1.faintMeter;
  const p2StartFaint = window.gameState.p2.faintMeter;

  let p1MoveKey = null;
  let p2MoveKey = null;

  if (window.gameState.p1.isCPU && window.gameState.p2.isCPU) {
    if (Math.random() < 0.5) {
      p1MoveKey = typeof window.getCPUMoveChoice === 'function' ? window.getCPUMoveChoice(window.gameState.p1, window.gameState.p2, 'p1') : 'D+J';
      p2MoveKey = typeof window.getCPUMoveChoice === 'function' ? window.getCPUMoveChoice(window.gameState.p2, window.gameState.p1, 'p2') : 'D+J';
    } else {
      p2MoveKey = typeof window.getCPUMoveChoice === 'function' ? window.getCPUMoveChoice(window.gameState.p2, window.gameState.p1, 'p2') : 'D+J';
      p1MoveKey = typeof window.getCPUMoveChoice === 'function' ? window.getCPUMoveChoice(window.gameState.p1, window.gameState.p2, 'p1') : 'D+J';
    }

    window.gameState.p1SelectedMoveKey = p1MoveKey;
    window.gameState.p2SelectedMoveKey = p2MoveKey;
  } else {
    if (window.gameState.p1.isCPU) {
      p1MoveKey = typeof window.getCPUMoveChoice === 'function' ? window.getCPUMoveChoice(window.gameState.p1, window.gameState.p2, 'p1') : 'D+J';
    } else {
      p1MoveKey = window.gameState.input ? window.gameState.input.selectedMoveKey : null;
      if (window.gameState.p1.activeChargePercent === undefined) {
        window.gameState.p1.activeChargePercent = (window.gameState.input && typeof window.gameState.input.currentPercent === 'number' && window.gameState.input.currentPercent > 0) ? window.gameState.input.currentPercent : 100;
      }
    }

    p2MoveKey = window.gameState.p2AlwaysIdle ? 'DO_NOTHING' : window.gameState.p2SelectedMoveKey;
    if (!p2MoveKey && window.gameState.p2.isCPU && !window.gameState.p2AlwaysIdle) {
      p2MoveKey = typeof window.getCPUMoveChoice === 'function' ? window.getCPUMoveChoice(window.gameState.p2, window.gameState.p1, 'p2') : 'D+J';
    } else if (!window.gameState.p2.isCPU && window.gameState.p2.activeChargePercent === undefined) {
      window.gameState.p2.activeChargePercent = typeof window.gameState.p2ChargePercent === 'number' ? window.gameState.p2ChargePercent : 100;
    }
  }

  if (!p1MoveKey) p1MoveKey = 'DO_NOTHING';
  if (!p2MoveKey) p2MoveKey = 'DO_NOTHING';

  if (window.gameState.p1.isCPU && p1MoveKey !== 'DO_NOTHING' && typeof window.simulateCPUButtonPress === 'function') {
    window.simulateCPUButtonPress(p1MoveKey, 'p1');
  }
  if (window.gameState.p2.isCPU && !window.gameState.p2AlwaysIdle && p2MoveKey !== 'DO_NOTHING' && typeof window.simulateCPUButtonPress === 'function') {
    window.simulateCPUButtonPress(p2MoveKey, 'p2');
  }

  const defaultMove = { name: 'Do Nothing', type: 'IDLE', baseDamage: 0, chiCost: 0 };
  let p1Move = (typeof window.getMoveForPlayer === 'function' ? window.getMoveForPlayer('p1', p1MoveKey) : null) || defaultMove;
  let p2Move = (typeof window.getMoveForPlayer === 'function' ? window.getMoveForPlayer('p2', p2MoveKey) : null) || defaultMove;

  const battleMsg = document.getElementById('battle-message');
  if (battleMsg) {
    battleMsg.hidden = false;
    const p1Charge = window.gameState.p1.activeChargePercent !== undefined ? window.gameState.p1.activeChargePercent : 100;
    const p2Charge = window.gameState.p2.activeChargePercent !== undefined ? window.gameState.p2.activeChargePercent : 100;
    battleMsg.innerHTML = `P1: ${p1Move.name} (${p1Charge}%) VS P2: ${p2Move.name} (${p2Charge}%)`;
  }

  setSideBoxesBlank(true);

  let p1IsIdle = p1MoveKey === 'DO_NOTHING';
  let p2IsIdle = p2MoveKey === 'DO_NOTHING';
  let p1GoesFirst = false;

  let p1IsS = p1MoveKey.startsWith('S');
  let p2IsS = p2MoveKey.startsWith('S');
  let p1IsD = p1MoveKey.startsWith('D');
  let p2IsD = p2MoveKey.startsWith('D');

  let p1RangePriority = getMoveRangePriority(p1Move, p1MoveKey);
  let p2RangePriority = getMoveRangePriority(p2Move, p2MoveKey);

  if (!p1IsIdle && p2IsIdle) {
    p1GoesFirst = true;
  } else if (p1IsIdle && !p2IsIdle) {
    p1GoesFirst = false;
  } else if (p1RangePriority > p2RangePriority) {
    p1GoesFirst = true;
  } else if (p1RangePriority < p2RangePriority) {
    p1GoesFirst = false;
  } else if (p1MoveKey.startsWith('W') && !p2MoveKey.startsWith('W')) {
    p1GoesFirst = true;
  } else if (!p1MoveKey.startsWith('W') && p2MoveKey.startsWith('W')) {
    p1GoesFirst = false;
  } else if (p1IsS && p2IsD) {
    p1GoesFirst = true;
  } else if (p1IsD && p2IsS) {
    p1GoesFirst = false;
  } else {
    let p1Charge = window.gameState.p1.activeChargePercent !== undefined ? window.gameState.p1.activeChargePercent : 100;
    let p2Charge = window.gameState.p2.activeChargePercent !== undefined ? window.gameState.p2.activeChargePercent : 100;

    let p1Elapsed = p1Charge * 0.025;
    let p2Elapsed = p2Charge * 0.025;

    if (p1Elapsed < p2Elapsed) {
      p1GoesFirst = true;
    } else if (p1Elapsed > p2Elapsed) {
      p1GoesFirst = false;
    } else {
      p1GoesFirst = Math.random() < 0.5;
    }
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

  let defender1WasInterrupted = false;
  let defender1GuardDeducted = false;

  // STEP 1 EXECUTION
  if (move1.type !== 'IDLE' && key1 !== 'DO_NOTHING') {
    if (move1.buff) applyBuff(attacker1, move1.buff.id, move1.buff.label, move1.buff.type, move1.buff.duration);
    if (move1.debuff) applyBuff(defender1, move1.debuff.id, move1.debuff.label, move1.debuff.type, move1.debuff.duration);
    handleAirborneState(attacker1, key1, move1);

    if (move1.faintRecovery && attacker1.faintMeter > 0) {
      const recovered = Math.min(attacker1.faintMeter, move1.faintRecovery);
      attacker1.faintMeter = Math.max(0, attacker1.faintMeter - move1.faintRecovery);
      triggerFloatingText(atkKey1, `FAINT -${recovered}`, 'heal');
    }

    attacker1.chi = Math.max(0, attacker1.chi - (move1.chiCost || 0));
    updateHUD();

    if (move1.type === 'DEFENSE') {
      let isOpponentOffensive = !!(move2 && rules.OFFENSIVE_TYPES.includes(move2.type?.toUpperCase()));
      if (!isOpponentOffensive && (move1.chiCost || 0) === 0) {
        await applyFaintBuildUp(attacker1, atkKey1, rules.FAINT_PENALTY_IDLE_GUARD);
      }

      if (!isOpponentOffensive && typeof window.playCenterVideo === 'function') {
        await window.playCenterVideo(atkKey1, move1.video || 'guard.mp4', move1.name, null, move1);
      }
    } else {
      if (typeof window.playCenterVideo === 'function') {
        await window.playCenterVideo(atkKey1, move1.video || 'idle.mp4', move1.name, null, move1);
      }

      let result = resolveAttack(attacker1, defender1, move1, key1, move2, key2, defKey1);

      if (result.isOffensive) {
        if (move2.type === 'DEFENSE' && !defender1.isFainted) {
          defender1.chi = Math.max(0, defender1.chi - (move2.chiCost || 0));
          defender1GuardDeducted = true;
          updateHUD();

          if (result.guardSuccess) {
            const guardVid = move2.video || 'guard.mp4';
            if (typeof window.playCenterVideo === 'function') {
              await window.playCenterVideo(defKey1, guardVid, 'GUARDED!', null, move2);
            }

            if (result.finalDmg === 0) {
              triggerFloatingText(defKey1, 'BLOCKED!', 'heal');
            } else {
              const queue = [
                { type: 'text', text: 'GUARDED!', customClass: 'scratch' },
                { type: 'number', amount: result.finalDmg, isHeal: false }
              ];
              if (result.chiGained > 0 && !defender1.isFainted) {
                defender1.chi = Math.min(defender1.maxChi || rules.MAX_CHI, defender1.chi + result.chiGained);
                queue.push({ type: 'text', text: 'CHI UP! (+2)', customClass: 'heal' });
              }
              triggerStaggeredPopups(defKey1, queue);
            }

            defender1.lp = Math.max(0, defender1.lp - result.finalDmg);
            updateHUD();
          } else {
            defender1WasInterrupted = true;

            const hitVid = key1.startsWith('S') ? 'hit.mp4' : 'hit_physical.mp4';
            if (typeof window.playCenterVideo === 'function') {
              await window.playCenterVideo(defKey1, hitVid, 'TAKING DAMAGE');
            }

            defender1.lp = Math.max(0, defender1.lp - result.finalDmg);
            updateHUD();

            triggerStaggeredPopups(defKey1, [
              { type: 'text', text: 'GUARD FAIL!', customClass: 'scratch' },
              { type: 'number', amount: result.finalDmg, isHeal: false }
            ]);

            await applyFaintBuildUp(defender1, defKey1, getFaintDamageForMove(move1));
          }
        } else if (!result.hitLanded) {
          if (typeof window.playCenterVideo === 'function') {
            await window.playCenterVideo(defKey1, 'dodge.mp4', 'DODGED!');
          }
          triggerFloatingText(defKey1, 'MISS!!', 'miss');
        } else if (result.isGlancing) {
          if (typeof window.playCenterVideo === 'function') {
            await window.playCenterVideo(defKey1, 'dodge.mp4', 'EVADED!');
          }
          defender1.lp = Math.max(0, defender1.lp - result.finalDmg);

          const chiGain1 = getAttackerChiGainOnHit(move1, key1);
          if (chiGain1 > 0) {
            attacker1.chi = Math.min(rules.MAX_CHI, attacker1.chi + chiGain1);
            triggerFloatingText(atkKey1, `CHI +${chiGain1}!`, 'heal');
          }

          updateHUD();

          triggerStaggeredPopups(defKey1, [
            { type: 'text', text: 'SCRATCH!', customClass: 'scratch' },
            { type: 'number', amount: result.finalDmg, isHeal: false }
          ]);

          await applyFaintBuildUp(defender1, defKey1, 10);
        } else {
          defender1WasInterrupted = true;

          const hitVid = key1.startsWith('S') ? 'hit.mp4' : 'hit_physical.mp4';
          if (typeof window.playCenterVideo === 'function') {
            await window.playCenterVideo(defKey1, hitVid, 'TAKING DAMAGE');
          }

          defender1.lp = Math.max(0, defender1.lp - result.finalDmg);

          const chiGain1 = getAttackerChiGainOnHit(move1, key1);
          if (chiGain1 > 0) {
            attacker1.chi = Math.min(rules.MAX_CHI, attacker1.chi + chiGain1);
            triggerFloatingText(atkKey1, `CHI +${chiGain1}!`, 'heal');
          }

          updateHUD();

          triggerStaggeredPopups(defKey1, [
            { type: 'number', amount: result.finalDmg, isHeal: false }
          ]);

          await applyFaintBuildUp(defender1, defKey1, getFaintDamageForMove(move1));
        }
      }
    }
  }

  // STEP 2 EXECUTION
  if (defender2.lp > 0 && !attacker2.isFainted && !defender1WasInterrupted && move2.type !== 'IDLE' && key2 !== 'DO_NOTHING' && move2.type !== 'DEFENSE') {
    if (move2.buff) applyBuff(attacker2, move2.buff.id, move2.buff.label, move2.buff.type, move2.buff.duration);
    if (move2.debuff) applyBuff(defender2, move2.debuff.id, move2.debuff.label, move2.debuff.type, move2.debuff.duration);
    handleAirborneState(attacker2, key2, move2);

    if (move2.faintRecovery && attacker2.faintMeter > 0) {
      const recovered = Math.min(attacker2.faintMeter, move2.faintRecovery);
      attacker2.faintMeter = Math.max(0, attacker2.faintMeter - move2.faintRecovery);
      triggerFloatingText(atkKey2, `FAINT -${recovered}`, 'heal');
    }

    attacker2.chi = Math.max(0, attacker2.chi - (move2.chiCost || 0));
    updateHUD();

    if (typeof window.playCenterVideo === 'function') {
      await window.playCenterVideo(atkKey2, move2.video || 'idle.mp4', move2.name, null, move2);
    }
    let result = resolveAttack(attacker2, defender2, move2, key2, move1, key1, defKey2);

    if (result.isOffensive) {
      if (move1.type === 'DEFENSE' && !defender2.isFainted) {
        if (result.guardSuccess) {
          const guardVid = move1.video || 'guard.mp4';
          if (typeof window.playCenterVideo === 'function') {
            await window.playCenterVideo(defKey2, guardVid, 'GUARDED!', null, move1);
          }

          if (result.finalDmg === 0) {
            triggerFloatingText(defKey2, 'BLOCKED!', 'heal');
          } else {
            const queue = [
              { type: 'text', text: 'GUARDED!', customClass: 'scratch' },
              { type: 'number', amount: result.finalDmg, isHeal: false }
            ];
            if (result.chiGained > 0 && !defender2.isFainted) {
              defender2.chi = Math.min(defender2.maxChi || rules.MAX_CHI, defender2.chi + result.chiGained);
              queue.push({ type: 'text', text: 'CHI UP! (+2)', customClass: 'heal' });
            }
            triggerStaggeredPopups(defKey2, queue);
          }

          defender2.lp = Math.max(0, defender2.lp - result.finalDmg);
          updateHUD();
        } else {
          const hitVid = key2.startsWith('S') ? 'hit.mp4' : 'hit_physical.mp4';
          if (typeof window.playCenterVideo === 'function') {
            await window.playCenterVideo(defKey2, hitVid, 'TAKING DAMAGE');
          }

          defender2.lp = Math.max(0, defender2.lp - result.finalDmg);
          updateHUD();

          triggerStaggeredPopups(defKey2, [
            { type: 'text', text: 'GUARD FAIL!', customClass: 'scratch' },
            { type: 'number', amount: result.finalDmg, isHeal: false }
          ]);

          await applyFaintBuildUp(defender2, defKey2, getFaintDamageForMove(move2));
        }
      } else if (!result.hitLanded) {
        if (typeof window.playCenterVideo === 'function') {
          await window.playCenterVideo(defKey2, 'dodge.mp4', 'DODGED!');
        }
        triggerFloatingText(defKey2, 'MISS!!', 'miss');
      } else if (result.isGlancing) {
        if (typeof window.playCenterVideo === 'function') {
          await window.playCenterVideo(defKey2, 'dodge.mp4', 'EVADED!');
        }
        defender2.lp = Math.max(0, defender2.lp - result.finalDmg);

        const chiGain2 = getAttackerChiGainOnHit(move2, key2);
        if (chiGain2 > 0) {
          attacker2.chi = Math.min(rules.MAX_CHI, attacker2.chi + chiGain2);
          triggerFloatingText(atkKey2, `CHI +${chiGain2}!`, 'heal');
        }

        updateHUD();

        triggerStaggeredPopups(defKey2, [
          { type: 'text', text: 'SCRATCH!', customClass: 'scratch' },
          { type: 'number', amount: result.finalDmg, isHeal: false }
        ]);

        await applyFaintBuildUp(defender2, defKey2, 10);
      } else {
        const hitVid = key2.startsWith('S') ? 'hit.mp4' : 'hit_physical.mp4';
        if (typeof window.playCenterVideo === 'function') {
          await window.playCenterVideo(defKey2, hitVid, 'TAKING DAMAGE');
        }

        defender2.lp = Math.max(0, defender2.lp - result.finalDmg);

        const chiGain2 = getAttackerChiGainOnHit(move2, key2);
        if (chiGain2 > 0) {
          attacker2.chi = Math.min(rules.MAX_CHI, attacker2.chi + chiGain2);
          triggerFloatingText(atkKey2, `CHI +${chiGain2}!`, 'heal');
        }

        updateHUD();

        triggerStaggeredPopups(defKey2, [
          { type: 'number', amount: result.finalDmg, isHeal: false }
        ]);

        await applyFaintBuildUp(defender2, defKey2, getFaintDamageForMove(move2));
      }
    }
  } else if (move2.type === 'DEFENSE' && !attacker2.isFainted && defender2.lp > 0) {
    let isOpponentOffensive = !!(move1 && rules.OFFENSIVE_TYPES.includes(move1.type?.toUpperCase()));
    if (!isOpponentOffensive && (move2.chiCost || 0) === 0) {
      await applyFaintBuildUp(attacker2, atkKey2, rules.FAINT_PENALTY_IDLE_GUARD);
    }
    if (!defender1GuardDeducted) {
      attacker2.chi = Math.max(0, attacker2.chi - (move2.chiCost || 0));
      updateHUD();
    }
  } else if ((attacker2.isFainted || defender1WasInterrupted) && move2.type !== 'IDLE' && key2 !== 'DO_NOTHING' && move2.type !== 'DEFENSE') {
    triggerFloatingText(atkKey2, 'INTERRUPTED!', 'scratch');
  }

  // Round conclusion
  setTimeout(() => {
    if (typeof window.hideCenterScreen === 'function') window.hideCenterScreen();
    setSideBoxesBlank(false);

    if (battleMsg) battleMsg.hidden = true;

    const p1DmgTaken = p1StartLp - window.gameState.p1.lp;
    const p2DmgTaken = p2StartLp - window.gameState.p2.lp;

    if (window.gameState.p2.isCPU && window.globalAIKnowledge && typeof window.calculateMoveSuccess === 'function') {
      const wasSuccessful = window.calculateMoveSuccess(window.gameState.p2, window.gameState.p1, p2MoveKey, {
        damageDealt: p1DmgTaken,
        damageTaken: p2DmgTaken,
        oppChargePercent: window.gameState.p1.activeChargePercent || 100,
        cpuWasHit: p2DmgTaken > 0,
        cpuWasInterrupted: defender1WasInterrupted && attacker2 === window.gameState.p1,
        oppWasGuarded: p1Move.type === 'DEFENSE',
        chiSpent: p2Move.chiCost || 0,
        oppAttemptedAttack: p1Move.type !== 'DEFENSE' && p1Move.type !== 'IDLE',
        faintRecovered: Math.max(0, p2StartFaint - window.gameState.p2.faintMeter)
      });
      window.globalAIKnowledge.recordTurnOutcome(window.gameState.p2, window.gameState.p1, p1MoveKey, p2MoveKey, wasSuccessful);
    }

    if (window.gameState.p1.isCPU && window.globalAIKnowledge && typeof window.calculateMoveSuccess === 'function') {
      const wasSuccessful = window.calculateMoveSuccess(window.gameState.p1, window.gameState.p2, p1MoveKey, {
        damageDealt: p2DmgTaken,
        damageTaken: p1DmgTaken,
        oppChargePercent: window.gameState.p2.activeChargePercent || 100,
        cpuWasHit: p1DmgTaken > 0,
        cpuWasInterrupted: defender1WasInterrupted && attacker2 === window.gameState.p2,
        oppWasGuarded: p2Move.type === 'DEFENSE',
        chiSpent: p1Move.chiCost || 0,
        oppAttemptedAttack: p2Move.type !== 'DEFENSE' && p2Move.type !== 'IDLE',
        faintRecovered: Math.max(0, p1StartFaint - window.gameState.p1.faintMeter)
      });
      window.globalAIKnowledge.recordTurnOutcome(window.gameState.p1, window.gameState.p2, p2MoveKey, p1MoveKey, wasSuccessful);
    }

    processRoundBuffs(window.gameState.p1);
    processRoundBuffs(window.gameState.p2);

    ['p1', 'p2'].forEach(slot => {
      const player = window.gameState[slot];
      if (player) {
        if (!player.isFainted && !player.tookCleanHitThisRound && player.faintMeter > 0) {
          player.faintMeter = Math.max(0, player.faintMeter - rules.ROUND_RECOVERY);
        }
        player.tookCleanHitThisRound = false;
      }
    });

    updateHUD();

    if (window.gameState.p1.lp > 0 && window.gameState.p2.lp > 0) {
      window.gameState.roundCounter++;
      if (typeof window.resetRoundState === 'function') window.resetRoundState();

      if (typeof window.launchRoundTimer === 'function') window.launchRoundTimer();

      if (window.gameState.p1.isCPU && window.gameState.p2.isCPU) {
        setTimeout(() => {
          if (window.gameState.roundPhase === 'INPUT') {
            executeTurnResolutionPhase();
          }
        }, 1200);
      }
    } else {
      window.gameState.roundPhase = 'GAME_OVER';
      if (battleMsg) battleMsg.hidden = false;

      if (typeof window.saveAIKnowledge === 'function') {
        window.saveAIKnowledge();
      }

      ['p1', 'p2'].forEach(slot => {
        const stunOverlay = document.getElementById(`${slot}-stun-overlay`);
        if (stunOverlay) stunOverlay.hidden = true;
        if (window.gameState[slot]) window.gameState[slot].isFainted = false;
      });

      let resultText = "";
      if (window.gameState.p1.lp <= 0 && window.gameState.p2.lp <= 0) {
        resultText = "DOUBLE KO!<br>DRAW MATCH!";
        if (typeof window.updateCharacterMedia === 'function') {
          window.updateCharacterMedia('p1', 'KO');
          window.updateCharacterMedia('p2', 'KO');
        }
      } else if (window.gameState.p1.lp <= 0) {
        resultText = `KO!<br>P2 ${window.gameState.p2.name.toUpperCase()} WINS!`;
        if (typeof window.updateCharacterMedia === 'function') {
          window.updateCharacterMedia('p1', 'KO');
          window.updateCharacterMedia('p2', 'VICTORY');
        }
      } else {
        resultText = `KO!<br>P1 ${window.gameState.p1.name.toUpperCase()} WINS!`;
        if (typeof window.updateCharacterMedia === 'function') {
          window.updateCharacterMedia('p1', 'VICTORY');
          window.updateCharacterMedia('p2', 'KO');
        }
      }

      battleMsg.innerHTML = `${resultText}<br><span class="continue-prompt">PRESS ANY KEY TO CONTINUE</span>`;

      window.gameState.canContinueFromGameOver = false;
      setTimeout(() => {
        window.gameState.canContinueFromGameOver = true;
      }, 1000);
    }
  }, 1000);
}

// Global Window Exports
window.getMoveRangePriority = getMoveRangePriority;
window.resolveAttack = resolveAttack;
window.executeTurnResolutionPhase = executeTurnResolutionPhase;
window.applyFaintBuildUp = applyFaintBuildUp;
window.getFaintDamageForMove = getFaintDamageForMove;
window.getAttackerChiGainOnHit = getAttackerChiGainOnHit;
window.triggerFloatingNumber = triggerFloatingNumber;
window.triggerFloatingText = triggerFloatingText;
window.triggerStaggeredPopups = triggerStaggeredPopups;
