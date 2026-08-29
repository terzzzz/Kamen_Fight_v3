/**
 * Combat Engine & Turn Resolution Manager
 * Path: js/combat.js
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
  HARD_CPU_HP_MULTIPLIER: 1.30
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

function simulateCPUButtonPress(btnKey, slotKey) {
  if (!btnKey) return;
  const possibleIds = [
    `${slotKey}-key-${btnKey}`,
    `key-${btnKey}`,
    `p2-key-${btnKey}`,
    `p1-key-${btnKey}`
  ];

  let btnEl = null;
  for (const id of possibleIds) {
    btnEl = document.getElementById(id);
    if (btnEl) break;
  }

  if (btnEl) {
    btnEl.classList.add('active');
    setTimeout(() => btnEl.classList.remove('active'), 220);
  }
}
window.simulateCPUButtonPress = simulateCPUButtonPress;

/* Real-Time Charge Progress Systems */
function startPlayerCharge(slotKey, dirKey, targetPercent = 100) {
  const player = window.gameState[slotKey];
  if (!player || player.isFainted || window.gameState.roundPhase !== 'INPUT') return;

  if (!player.chargeState) {
    player.chargeState = { interval: null, heldDir: null, startTime: 0, currentPercent: 0 };
  }

  if (player.chargeState.interval) clearInterval(player.chargeState.interval);

  player.chargeState.heldDir = dirKey;
  player.chargeState.startTime = Date.now();
  player.chargeState.currentPercent = 0;

  let baseDuration = (window.CHARGE_TIMES && window.CHARGE_TIMES[dirKey]) || 2000;

  if (player.activeBuffs && player.activeBuffs.some(b => b.type === 'speed' || b.id === 'charge_speed')) {
    baseDuration *= 0.75;
  }
  if (player.activeBuffs && player.activeBuffs.some(b => b.id === 'rope_bind')) {
    baseDuration *= 1.30;
  }

  const fillEl = document.getElementById(`${slotKey}-charge-fill`);
  const textEl = document.getElementById(`${slotKey}-charge-text`);

  if (fillEl) fillEl.classList.remove('locked');

  player.chargeState.interval = setInterval(() => {
    if (window.gameState.roundPhase !== 'INPUT') {
      clearInterval(player.chargeState.interval);
      return;
    }

    const elapsed = Date.now() - player.chargeState.startTime;
    let pct = Math.min(100, Math.floor((elapsed / baseDuration) * 100));

    player.chargeState.currentPercent = pct;
    player.activeChargePercent = pct;

    if (fillEl) fillEl.style.width = `${pct}%`;
    if (textEl) textEl.textContent = `CHARGING [${dirKey}] ${pct}%`;

    if (pct >= targetPercent) {
      clearInterval(player.chargeState.interval);
    }
  }, 20);
}

function freezePlayerChargeBar(slotKey, moveKey) {
  const player = window.gameState[slotKey];
  if (player && player.chargeState && player.chargeState.interval) {
    clearInterval(player.chargeState.interval);
  }

  const fillEl = document.getElementById(`${slotKey}-charge-fill`);
  const textEl = document.getElementById(`${slotKey}-charge-text`);

  const lockedPct = (player && player.activeChargePercent !== undefined) ? player.activeChargePercent : 100;

  if (fillEl) {
    fillEl.style.width = `${lockedPct}%`;
    fillEl.classList.add('locked');
  }

  if (textEl) {
    const moveName = moveKey === 'DO_NOTHING' ? 'IDLE' : moveKey;
    textEl.textContent = `LOCKED: ${moveName} (${lockedPct}%)`;
  }
}

function resetPlayerChargeBars() {
  ['p1', 'p2'].forEach(slot => {
    const player = window.gameState[slot];
    if (player && player.chargeState && player.chargeState.interval) {
      clearInterval(player.chargeState.interval);
    }

    const fillEl = document.getElementById(`${slot}-charge-fill`);
    const textEl = document.getElementById(`${slot}-charge-text`);

    if (fillEl) {
      fillEl.style.width = '0%';
      fillEl.classList.remove('locked');
    }
    if (textEl) textEl.textContent = 'READY';
  });
}

function updateControlPanelsVisibility() {
  const dualPanel = document.querySelector('.dual-controls-panel');
  const p1Panel = document.getElementById('p1-controls') || document.getElementById('human-control-panel');
  const p2Panel = document.getElementById('p2-controls');

  const p1IsHuman = window.gameState.p1 && !window.gameState.p1.isCPU;
  const p2IsHuman = window.gameState.p2 && !window.gameState.p2.isCPU;

  if (p1IsHuman && p2IsHuman) {
    if (dualPanel) dualPanel.style.display = 'flex';
    if (p1Panel) p1Panel.style.display = 'flex';
    if (p2Panel) p2Panel.style.display = 'flex';
  } else {
    if (dualPanel) dualPanel.style.display = 'none';
    if (p1Panel) {
      p1Panel.hidden = !p1IsHuman;
      p1Panel.style.display = p1IsHuman ? 'flex' : 'none';
    }
    if (p2Panel) {
      p2Panel.hidden = !p2IsHuman;
      p2Panel.style.display = p2IsHuman ? 'flex' : 'none';
    }
  }
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

function getMoveRangePriority(move) {
  if (!move) return 1;
  const range = (move.rangeType || 'MELEE').toUpperCase();
  if (range === 'PROJECTILE') return 3;
  if (range === 'REACH' || range === 'ROPE' || range === 'MID_RANGE') return 2;
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

function getMoveForPlayer(playerKey, moveKey) {
  if (moveKey === 'DO_NOTHING' || !moveKey) return DO_NOTHING_MOVE;
  const moves = playerKey === 'p1' ? window.gameState.p1Moves : window.gameState.p2Moves;
  return (moves && moves[moveKey]) || DO_NOTHING_MOVE;
}

function launchRoundTimer() {
  window.gameState.roundPhase = 'INPUT';
  startRoundCountdown();
}

function resetRoundState() {
  if (!window.gameState.input) {
    window.gameState.input = {
      acceptingInputs: false,
      heldDirection: null,
      chargeStartTime: 0,
      currentPercent: 0,
      isConfirmed: false,
      selectedMoveKey: null,
      lockInTime: 0,
      chargeInterval: null
    };
  } else {
    if (window.gameState.input.chargeInterval) clearInterval(window.gameState.input.chargeInterval);
    window.gameState.input.acceptingInputs = false;
    window.gameState.input.heldDirection = null;
    window.gameState.input.chargeStartTime = 0;
    window.gameState.input.currentPercent = 0;
    window.gameState.input.isConfirmed = false;
    window.gameState.input.selectedMoveKey = null;
    window.gameState.input.lockInTime = 0;
    window.gameState.input.chargeInterval = null;
  }

  window.gameState.p2Input = { heldDirection: null };

  window.gameState.p1SelectedMoveKey = null;
  window.gameState.p2SelectedMoveKey = null;
  window.gameState.p1IsConfirmed = false;
  window.gameState.p2IsConfirmed = false;

  if (window.gameState.p1) window.gameState.p1.activeChargePercent = undefined;
  if (window.gameState.p2) window.gameState.p2.activeChargePercent = undefined;

  window.gameState.roundPhase = 'INPUT';
}

function resetCharge() {
  resetPlayerChargeBars();
  if (window.gameState && window.gameState.input) {
    if (window.gameState.input.chargeInterval) clearInterval(window.gameState.input.chargeInterval);
    window.gameState.input.heldDirection = null;
    window.gameState.input.currentPercent = 0;
  }
  if (window.gameState) window.gameState.p2Input = { heldDirection: null };

  ['W', 'A', 'S', 'D'].forEach(dir => {
    const keyEl = document.getElementById(`key-${dir}`);
    if (keyEl) keyEl.classList.remove('active');
  });

  const statusEl = document.getElementById('charge-status-display') || document.getElementById('charge-status');
  if (statusEl) {
    statusEl.textContent = 'TAP DIRECTION TO START CHARGE';
    statusEl.style.color = '#00ffcc';
  }
}

function resetTurnInputState() {
  resetCharge();
  if (!window.gameState.input) window.gameState.input = {};
  window.gameState.input.acceptingInputs = false;
  window.gameState.input.isConfirmed = false;
  window.gameState.input.selectedMoveKey = null;
  window.gameState.input.lockInTime = 0;

  window.gameState.p2Input = { heldDirection: null };
  window.gameState.p1IsConfirmed = false;
  window.gameState.p2IsConfirmed = false;
  window.gameState.p1SelectedMoveKey = null;
  window.gameState.p2SelectedMoveKey = null;
  window.gameState.p1LockInTime = 0;
  window.gameState.p2LockInTime = 0;

  if (window.gameState.p1) delete window.gameState.p1.activeChargePercent;
  if (window.gameState.p2) delete window.gameState.p2.activeChargePercent;

  const flag1El = document.getElementById('p1-action-flag');
  if (flag1El) flag1El.hidden = true;

  const flag2El = document.getElementById('p2-action-flag');
  if (flag2El) flag2El.hidden = true;
}

function getCPUAggressiveFallback(playerKey) {
  const moves = playerKey === 'p1' ? window.gameState.p1Moves : window.gameState.p2Moves;
  const player = window.gameState[playerKey];
  const chi = player ? player.chi : 0;

  if (moves) {
    const offensiveKeys = Object.keys(moves).filter(k => {
      const m = moves[k];
      return !k.startsWith('A+') && 
             m.type !== 'DEFENSE' && 
             (m.chiCost || 0) <= chi;
    });

    if (offensiveKeys.length > 0) {
      const dKeys = offensiveKeys.filter(k => k.startsWith('D+'));
      return dKeys.length > 0 ? dKeys[Math.floor(Math.random() * dKeys.length)] : offensiveKeys[0];
    }
  }

  return 'D+J';
}

function getCPUMoveChoice(cpuPlayer, opponentPlayer, playerKey = 'p2') {
  if (cpuPlayer.isFainted || (playerKey === 'p2' && window.gameState.p2AlwaysIdle)) return 'DO_NOTHING';

  let movesData = playerKey === 'p1' ? window.gameState.p1Moves : window.gameState.p2Moves;
  if (!movesData || Object.keys(movesData).length === 0) {
    movesData = typeof FALLBACK_ICHIGO_MOVES !== 'undefined' ? FALLBACK_ICHIGO_MOVES : {};
  }

  const difficulty = playerKey === 'p1' 
    ? (window.gameState.matchConfig?.p1Difficulty || 'normal') 
    : (window.gameState.matchConfig?.p2Difficulty || 'normal');

  const isOpponentLocked = playerKey === 'p1'
    ? (window.gameState.p2IsConfirmed || (window.gameState.p2 && window.gameState.p2.isFainted) || window.gameState.p2AlwaysIdle)
    : ((window.gameState.input && window.gameState.input.isConfirmed) || window.gameState.p1IsConfirmed || (window.gameState.p1 && window.gameState.p1.isFainted));

  let availableMoves = {};
  Object.keys(movesData).forEach(key => {
    const m = movesData[key];
    if (m && typeof m === 'object' && (m.chiCost || 0) <= cpuPlayer.chi) {
      if (!isOpponentLocked && (key.startsWith('A+') || m.type === 'DEFENSE')) {
        return;
      }
      availableMoves[key] = m;
    }
  });

  if (Object.keys(availableMoves).length === 0) return 'D+J';

  let chosenKey = null;
  if (typeof window.selectCPUMove === 'function') {
    chosenKey = window.selectCPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty);
  }

  if (!chosenKey || !availableMoves[chosenKey]) {
    const keys = Object.keys(availableMoves);
    chosenKey = keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : 'D+J';
  }

  if (!isOpponentLocked && (chosenKey.startsWith('A+') || availableMoves[chosenKey]?.type === 'DEFENSE')) {
    chosenKey = getCPUAggressiveFallback(playerKey);
  }

  return chosenKey;
}

function confirmPlayerAction(moveKey, playerKey = 'p1') {
  if (typeof window.unlockMobileVideos === 'function') window.unlockMobileVideos();

  const player = window.gameState[playerKey];
  if (!player) return false;

  const isConfirmed = playerKey === 'p1' ? window.gameState.p1IsConfirmed : window.gameState.p2IsConfirmed;
  if (isConfirmed) return false;

  const isOpponentLocked = playerKey === 'p1' 
    ? (window.gameState.p2IsConfirmed || (window.gameState.p2 && window.gameState.p2.isFainted) || window.gameState.p2AlwaysIdle)
    : ((window.gameState.input && window.gameState.input.isConfirmed) || window.gameState.p1IsConfirmed || (window.gameState.p1 && window.gameState.p1.isFainted));

  const move = getMoveForPlayer(playerKey, moveKey);
  const isGuardMove = moveKey.startsWith('A+') || (move && move.type === 'DEFENSE');

  if (isGuardMove && !isOpponentLocked) {
    if (player.isCPU) {
      const fallbackKey = getCPUAggressiveFallback(playerKey);
      return confirmPlayerAction(fallbackKey, playerKey);
    }

    triggerFloatingText(playerKey, 'NO GUARD UNTIL OPPONENT ACTS!', 'scratch');
    if (playerKey === 'p1') resetCharge();
    return false;
  }

  if (moveKey !== 'DO_NOTHING') {
    const chiCost = move.chiCost || 0;
    if (player.chi < chiCost) {
      if (player.isCPU) {
        const fallbackKey = getCPUAggressiveFallback(playerKey);
        return confirmPlayerAction(fallbackKey, playerKey);
      }

      triggerFloatingText(playerKey, 'NOT ENOUGH CHI!', 'miss');
      return false;
    }
  }

  let newlyConfirmed = false;

  if (playerKey === 'p1' && (!window.gameState.input || !window.gameState.input.isConfirmed)) {
    if (!window.gameState.input) window.gameState.input = {};
    window.gameState.input.isConfirmed = true;
    window.gameState.input.selectedMoveKey = moveKey;
    window.gameState.input.lockInTime = window.gameState.turnTimerSeconds;
    window.gameState.p1IsConfirmed = true;
    window.gameState.p1SelectedMoveKey = moveKey;
    newlyConfirmed = true;

    if (!window.gameState.p1.isCPU) {
      const currentCharge = (player.chargeState && player.chargeState.currentPercent > 0)
        ? player.chargeState.currentPercent 
        : (window.gameState.input && window.gameState.input.currentPercent > 0 ? window.gameState.input.currentPercent : 100);
      window.gameState.p1.activeChargePercent = moveKey === 'DO_NOTHING' ? 100 : currentCharge;
    }

    freezePlayerChargeBar('p1', moveKey);

    const flagEl = document.getElementById('p1-action-flag');
    if (flagEl) {
      flagEl.hidden = false;
      flagEl.textContent = moveKey === 'DO_NOTHING' ? 'DO NOTHING' : `LOCKED ${window.gameState.p1.activeChargePercent || 100}%!`;
    }
  } else if (playerKey === 'p2' && !window.gameState.p2IsConfirmed) {
    window.gameState.p2IsConfirmed = true;
    window.gameState.p2SelectedMoveKey = moveKey;
    window.gameState.p2LockInTime = window.gameState.turnTimerSeconds;
    newlyConfirmed = true;

    if (!window.gameState.p2.isCPU && window.gameState.p2.activeChargePercent === undefined) {
      window.gameState.p2.activeChargePercent = (player.chargeState && player.chargeState.currentPercent > 0) 
        ? player.chargeState.currentPercent 
        : 100;
    }

    freezePlayerChargeBar('p2', moveKey);

    const flagEl = document.getElementById('p2-action-flag');
    if (flagEl) {
      flagEl.hidden = false;
      flagEl.textContent = moveKey === 'DO_NOTHING' ? 'DO NOTHING' : `LOCKED ${window.gameState.p2.activeChargePercent || 100}%!`;
    }
  }

  if (newlyConfirmed && window.gameState.roundPhase === 'INPUT') {
    const otherKey = playerKey === 'p1' ? 'p2' : 'p1';
    const otherPlayer = window.gameState[otherKey];
    const isOtherConfirmed = otherKey === 'p1' ? (window.gameState.input && window.gameState.input.isConfirmed) : window.gameState.p2IsConfirmed;

    if (otherPlayer && !otherPlayer.isFainted && !isOtherConfirmed && !(otherKey === 'p2' && window.gameState.p2AlwaysIdle)) {
      if (otherPlayer.isCPU) {
        const reactionDelay = Math.floor(Math.random() * 500 + 300);
        setTimeout(() => {
          if (window.gameState.roundPhase !== 'INPUT') return;
          const stillConfirmed = otherKey === 'p1' ? (window.gameState.input && window.gameState.input.isConfirmed) : window.gameState.p2IsConfirmed;
          if (!stillConfirmed) {
            const chosenKey = getCPUMoveChoice(otherPlayer, player, otherKey);
            confirmPlayerAction(chosenKey, otherKey);
          }
        }, reactionDelay);
      }
    }
  }

  checkBothPlayersLocked();
  return true;
}

function checkBothPlayersLocked() {
  if (window.gameState.roundPhase !== 'INPUT') return;

  const p1Ready = (window.gameState.input && window.gameState.input.isConfirmed) || window.gameState.p1IsConfirmed || (window.gameState.p1 && window.gameState.p1.isFainted);
  const p2Ready = window.gameState.p2IsConfirmed || (window.gameState.p2 && window.gameState.p2.isFainted) || window.gameState.p2AlwaysIdle;

  if (p1Ready && p2Ready) {
    if (window.gameState.timerInterval) clearInterval(window.gameState.timerInterval);
    setTimeout(() => {
      if (window.gameState.roundPhase === 'INPUT') {
        executeTurnResolutionPhase();
      }
    }, 200);
  }
}

function startRoundCountdown() {
  window.gameState.roundPhase = 'INPUT';
  resetTurnInputState();

  const rules = window.COMBAT_RULES || COMBAT_RULES;

  if (window.gameState.roundCounter > 1) {
    ['p1', 'p2'].forEach(slot => {
      const player = window.gameState[slot];
      if (player) {
        const maxChi = player.maxChi || 16;
        player.chi = Math.min(maxChi, player.chi + 1);
      }
    });
  }

  updateControlPanelsVisibility();

  setTimeout(() => {
    if (window.gameState.input) window.gameState.input.acceptingInputs = true;
  }, 300);

  // Faint state check
  ['p1', 'p2'].forEach(slot => {
    const player = window.gameState[slot];
    if (!player) return;

    if (player.willBeFaintedNextRound) {
      player.isFainted = true;
      player.willBeFaintedNextRound = false;
      player.faintMeter = rules.FAINT_THRESHOLD;
    } else if (player.isFainted) {
      player.isFainted = false;
      player.faintMeter = 0;
    }

    const stunOverlay = document.getElementById(`${slot}-stun-overlay`);
    const statusEl = document.getElementById(`${slot}-status`);

    if (player.isFainted) {
      if (stunOverlay) stunOverlay.hidden = false;
      if (statusEl) statusEl.textContent = 'FAINTED';
    } else if (slot === 'p2' && window.gameState.p2AlwaysIdle) {
      if (stunOverlay) stunOverlay.hidden = true;
      if (statusEl) statusEl.textContent = 'DUMMY (IDLE)';
    } else {
      if (stunOverlay) stunOverlay.hidden = true;
      if (statusEl) statusEl.textContent = 'NORMAL';
    }
  });

  updateHUD();
  setSideBoxesBlank(false);
  if (typeof window.hideCenterScreen === 'function') window.hideCenterScreen();

  if (typeof window.updateCharacterMedia === 'function') {
    window.updateCharacterMedia('p1', 'IDLE');
    window.updateCharacterMedia('p2', 'IDLE');
  }

  if (window.gameState.p1 && window.gameState.p1.isFainted) {
    confirmPlayerAction('DO_NOTHING', 'p1');
  }
  if (window.gameState.p2 && window.gameState.p2.isFainted) {
    confirmPlayerAction('DO_NOTHING', 'p2');
  }

  const battleMsg = document.getElementById('battle-message');
  if (battleMsg) {
    battleMsg.hidden = false;
    battleMsg.textContent = `ROUND ${window.gameState.roundCounter}: READY!`;
  }

  setTimeout(() => {
    if (window.gameState.roundPhase === 'INPUT' && battleMsg) {
      battleMsg.hidden = true;
    }
  }, 1200);

  if (window.gameState.timerInterval) clearInterval(window.gameState.timerInterval);
  window.gameState.turnTimerSeconds = 8;

  const timerEl = document.getElementById('turn-timer');
  if (timerEl) timerEl.textContent = `TIME: ${window.gameState.turnTimerSeconds}s`;

  // Real-Time CPU Charge Monitor Scheduler
  ['p1', 'p2'].forEach((slot, index) => {
    const player = window.gameState[slot];
    if (player && player.isCPU && !player.isFainted) {
      if (slot === 'p2' && window.gameState.p2AlwaysIdle) return;

      const startupStagger = Math.floor(Math.random() * 80) + (index * 40);

      setTimeout(() => {
        if (window.gameState.roundPhase !== 'INPUT') return;

        const oppSlot = slot === 'p1' ? 'p2' : 'p1';
        let decision = { moveKey: 'DO_NOTHING', targetChargePct: 100 };

        if (typeof window.selectCPUMoveAndCharge === 'function') {
          decision = window.selectCPUMoveAndCharge(player, window.gameState[oppSlot], slot);
        } else if (typeof getCPUMoveChoice === 'function') {
          decision.moveKey = getCPUMoveChoice(player, window.gameState[oppSlot], slot);
          decision.targetChargePct = 85;
        }

        const parts = decision.moveKey ? decision.moveKey.split('+') : ['DO_NOTHING'];
        const dirKey = parts[0];
        const actKey = parts[1];

        if (dirKey && dirKey !== 'DO_NOTHING') {
          simulateCPUButtonPress(dirKey, slot);
          startPlayerCharge(slot, dirKey, decision.targetChargePct);

          const monitorInterval = setInterval(() => {
            if (window.gameState.roundPhase !== 'INPUT') {
              clearInterval(monitorInterval);
              return;
            }

            const isAlreadyConfirmed = slot === 'p1' ? window.gameState.p1IsConfirmed : window.gameState.p2IsConfirmed;

            if (isAlreadyConfirmed) {
              clearInterval(monitorInterval);
              return;
            }

            const currentMeterLength = player.chargeState ? player.chargeState.currentPercent : 0;

            if (currentMeterLength >= decision.targetChargePct) {
              clearInterval(monitorInterval);

              if (actKey) {
                simulateCPUButtonPress(actKey, slot);
              }

              confirmPlayerAction(decision.moveKey, slot);
            }
          }, 20);
        } else {
          confirmPlayerAction('DO_NOTHING', slot);
        }
      }, startupStagger);
    }
  });

  // Countdown timer
  window.gameState.timerInterval = setInterval(() => {
    if (window.gameState.roundPhase !== 'INPUT') return;

    window.gameState.turnTimerSeconds--;
    if (timerEl) timerEl.textContent = `TIME: ${window.gameState.turnTimerSeconds}s`;

    if (window.gameState.turnTimerSeconds <= 0) {
      clearInterval(window.gameState.timerInterval);

      if (!window.gameState.input || !window.gameState.input.isConfirmed) {
        if (window.gameState.p1 && window.gameState.p1.isCPU) {
          let mk = getCPUAggressiveFallback('p1');
          confirmPlayerAction(mk, 'p1');
        } else {
          confirmPlayerAction('DO_NOTHING', 'p1');
        }
      }

      if (!window.gameState.p2IsConfirmed) {
        if (window.gameState.p2 && window.gameState.p2.isCPU && !window.gameState.p2AlwaysIdle) {
          let mk = getCPUAggressiveFallback('p2');
          confirmPlayerAction(mk, 'p2');
        } else {
          confirmPlayerAction('DO_NOTHING', 'p2');
        }
      }

      executeTurnResolutionPhase();
    }
  }, 1000);
}

function resolveAttack(attacker, defender, atkMove, atkMoveKey, defMove, defMoveKey, defenderKey) {
  const rules = window.COMBAT_RULES || COMBAT_RULES;
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

  // CHI THRESHOLD DAMAGE MULTIPLIERS
  let fullPowerMultiplier = attacker.chi > 14 ? 1.20 : 1.0; // FULL POWER: +20% Damage Dealt
  let lowPowerDefMultiplier = defender.chi < 5 ? 1.25 : 1.0;  // LOW POWER: +25% Damage Taken

  let baseDamage = atkMove.baseDamage || 0;
  let calculatedDmg = baseDamage * chargeFactor * typhoonMultiplier * focusMultiplier * jumpAtkMultiplier * fullPowerMultiplier * lowPowerDefMultiplier * damageRatio;

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
      p1MoveKey = getCPUMoveChoice(window.gameState.p1, window.gameState.p2, 'p1');
      p2MoveKey = getCPUMoveChoice(window.gameState.p2, window.gameState.p1, 'p2');
    } else {
      p2MoveKey = getCPUMoveChoice(window.gameState.p2, window.gameState.p1, 'p2');
      p1MoveKey = getCPUMoveChoice(window.gameState.p1, window.gameState.p2, 'p1');
    }

    window.gameState.p1SelectedMoveKey = p1MoveKey;
    window.gameState.p2SelectedMoveKey = p2MoveKey;
  } else {
    if (window.gameState.p1.isCPU) {
      p1MoveKey = getCPUMoveChoice(window.gameState.p1, window.gameState.p2, 'p1');
    } else {
      p1MoveKey = window.gameState.input ? window.gameState.input.selectedMoveKey : null;
      if (window.gameState.p1.activeChargePercent === undefined) {
        window.gameState.p1.activeChargePercent = (window.gameState.input && typeof window.gameState.input.currentPercent === 'number' && window.gameState.input.currentPercent > 0) ? window.gameState.input.currentPercent : 100;
      }
    }

    p2MoveKey = window.gameState.p2AlwaysIdle ? 'DO_NOTHING' : window.gameState.p2SelectedMoveKey;
    if (!p2MoveKey && window.gameState.p2.isCPU && !window.gameState.p2AlwaysIdle) {
      p2MoveKey = getCPUMoveChoice(window.gameState.p2, window.gameState.p1, 'p2');
    } else if (!window.gameState.p2.isCPU && window.gameState.p2.activeChargePercent === undefined) {
      window.gameState.p2.activeChargePercent = typeof window.gameState.p2ChargePercent === 'number' ? window.gameState.p2ChargePercent : 100;
    }
  }

  if (!p1MoveKey) p1MoveKey = 'DO_NOTHING';
  if (!p2MoveKey) p2MoveKey = 'DO_NOTHING';

  if (window.gameState.p1.isCPU && p1MoveKey !== 'DO_NOTHING' && typeof simulateCPUButtonPress === 'function') {
    simulateCPUButtonPress(p1MoveKey, 'p1');
  }
  if (window.gameState.p2.isCPU && !window.gameState.p2AlwaysIdle && p2MoveKey !== 'DO_NOTHING' && typeof simulateCPUButtonPress === 'function') {
    simulateCPUButtonPress(p2MoveKey, 'p2');
  }

  const defaultMove = { name: 'Do Nothing', type: 'IDLE', baseDamage: 0, chiCost: 0 };
  let p1Move = (typeof getMoveForPlayer === 'function' ? getMoveForPlayer('p1', p1MoveKey) : null) || defaultMove;
  let p2Move = (typeof getMoveForPlayer === 'function' ? getMoveForPlayer('p2', p2MoveKey) : null) || defaultMove;

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

  let p1RangePriority = getMoveRangePriority(p1Move);
  let p2RangePriority = getMoveRangePriority(p2Move);

  if (!p1IsIdle && p2IsIdle) {
    p1GoesFirst = true;
  } else if (p1IsIdle && !p2IsIdle) {
    p1GoesFirst = false;
  } else if (p1RangePriority > p2RangePriority) {
    p1GoesFirst = true;
  } else if (p1RangePriority < p2RangePriority) {
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
      resetRoundState();

      launchRoundTimer();

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

function startBattle(matchConfig) {
  if (!window.gameState) window.gameState = {};
  window.gameState.matchConfig = matchConfig || {};
  if (!window.gameState.videoCache) window.gameState.videoCache = {};

  resetRoundState();

  const transitionScreen = document.getElementById('match-transition-screen');
  const splashNames = document.getElementById('splash-names-text');
  const splashRound = document.getElementById('splash-round-text');
  const battleScreen = document.getElementById('battle-screen');

  try {
    try {
      const p1Id = matchConfig.p1Rider?.id || 'ichigo';
      const p2Id = matchConfig.p2Rider?.id || 'nigo';

      const fallback = typeof FALLBACK_ICHIGO_MOVES !== 'undefined' ? FALLBACK_ICHIGO_MOVES : {};
      window.gameState.p1Moves = fallback;
      window.gameState.p2Moves = fallback;

      fetch('data/moves.json')
        .then(res => res.ok ? res.json() : null)
        .then(allMoves => {
          if (allMoves) {
            window.gameState.p1Moves = allMoves[p1Id] || fallback;
            window.gameState.p2Moves = allMoves[p2Id] || fallback;
          }
        })
        .catch(() => {});
    } catch (e) {
      window.gameState.p1Moves = typeof FALLBACK_ICHIGO_MOVES !== 'undefined' ? FALLBACK_ICHIGO_MOVES : {};
      window.gameState.p2Moves = typeof FALLBACK_ICHIGO_MOVES !== 'undefined' ? FALLBACK_ICHIGO_MOVES : {};
    }

    const p1Rider = matchConfig.p1Rider || { id: 'ichigo', name: 'Kamen Rider Ichigo', maxLp: 1850, sourceFacing: 'left' };
    const p2Rider = matchConfig.p2Rider || { id: 'nigo', name: 'Kamen Rider Nigo', maxLp: 2000, sourceFacing: 'right' };

    const rules = window.COMBAT_RULES || COMBAT_RULES;
    const hpMultiplier = (window.GAME_CONFIG && window.GAME_CONFIG.HARD_CPU_HP_MULTIPLIER) || 1.30;

    let p1MaxLp = p1Rider.maxLp || 1850;
    if (matchConfig.p1IsCPU && matchConfig.p1Difficulty === 'hard') p1MaxLp = Math.floor(p1MaxLp * hpMultiplier);

    let p2MaxLp = p2Rider.maxLp || 2000;
    if (matchConfig.p2IsCPU && matchConfig.p2Difficulty === 'hard') p2MaxLp = Math.floor(p2MaxLp * hpMultiplier);

    window.gameState.p1 = {
      id: p1Rider.id || 'ichigo',
      name: p1Rider.name || 'Kamen Rider Ichigo',
      sourceFacing: p1Rider.sourceFacing || 'left',
      isCPU: !!matchConfig.p1IsCPU,
      maxLp: p1MaxLp,
      lp: p1MaxLp,
      chi: rules.STARTING_CHI || 8,
      maxChi: rules.MAX_CHI || 16,
      faintMeter: 0,
      activeBuffs: [],
      airborneTicks: 0,
      airborneAppliedRound: 0,
      airborneChargePercent: 100,
      activeChargePercent: 100,
      isFainted: false,
      willBeFaintedNextRound: false,
      tookCleanHitThisRound: false
    };

    window.gameState.p2 = {
      id: p2Rider.id || 'nigo',
      name: p2Rider.name || 'Kamen Rider Nigo',
      sourceFacing: p2Rider.sourceFacing || 'right',
      isCPU: !!matchConfig.p2IsCPU,
      maxLp: p2MaxLp,
      lp: p2MaxLp,
      chi: rules.STARTING_CHI || 8,
      maxChi: rules.MAX_CHI || 16,
      faintMeter: 0,
      activeBuffs: [],
      airborneTicks: 0,
      airborneAppliedRound: 0,
      airborneChargePercent: 100,
      activeChargePercent: 100,
      isFainted: false,
      willBeFaintedNextRound: false,
      tookCleanHitThisRound: false
    };

    window.gameState.roundCounter = 1;

    if (splashNames) splashNames.textContent = `${window.gameState.p1.name.toUpperCase()} VS ${window.gameState.p2.name.toUpperCase()}`;
    if (splashRound) splashRound.textContent = "PRELOADING ASSETS...";
    if (transitionScreen) transitionScreen.hidden = false;

    if (typeof window.preloadRiderVideos === 'function') {
      try {
        window.preloadRiderVideos(p1Rider.id, window.gameState.p1Moves);
        window.preloadRiderVideos(p2Rider.id, window.gameState.p2Moves);
      } catch (err) {
        console.warn("Video preload skipped:", err);
      }
    }

    if (splashRound) splashRound.textContent = "GET READY FOR THE FIGHT!";

  } catch (err) {
    console.error("Match initialization error:", err);
  } finally {
    if (transitionScreen) transitionScreen.hidden = true;
    if (battleScreen) battleScreen.hidden = false;

    updateHUD();

    if (typeof window.updateCharacterMedia === 'function') {
      window.updateCharacterMedia('p1', 'IDLE');
      window.updateCharacterMedia('p2', 'IDLE');
    }

    updateControlPanelsVisibility();
    launchRoundTimer();

    if (window.gameState.p1.isCPU && window.gameState.p2.isCPU) {
      setTimeout(() => {
        if (window.gameState.roundPhase === 'INPUT') {
          executeTurnResolutionPhase();
        }
      }, 1200);
    }
  }
}

function returnToSelectScreen() {
  window.gameState.roundPhase = 'IDLE';
  window.gameState.canContinueFromGameOver = false;

  if (typeof window.stopBattleBGM === 'function') window.stopBattleBGM();
  if (typeof window.playSelectionBGM === 'function') window.playSelectionBGM();

  const battleScreen = document.getElementById('battle-screen');
  const selectScreen = document.getElementById('vs-select-screen');
  const battleMsg = document.getElementById('battle-message');
  
  if (battleScreen) battleScreen.hidden = true;
  if (battleMsg) battleMsg.hidden = true;
  if (selectScreen) selectScreen.hidden = false;

  if (window.vsSelectionState) {
    window.vsSelectionState.step = 1;
    if (typeof window.updateSelectionUI === 'function') {
      window.updateSelectionUI();
    }
  }

  document.querySelectorAll('.damage-popup').forEach(el => el.remove());
}

function handleGameOverInput(e) {
  if (window.gameState && 
      window.gameState.roundPhase === 'GAME_OVER' && 
      window.gameState.canContinueFromGameOver) {
    returnToSelectScreen();
  }
}

/* Event Binds */
function bindKeyboardInputs() {
  window.addEventListener('keydown', (e) => {
    if (typeof window.unlockMobileVideos === 'function') window.unlockMobileVideos();

    if (window.gameState.roundPhase === 'GAME_OVER' && window.gameState.canContinueFromGameOver) {
      returnToSelectScreen();
      return;
    }

    if (window.gameState.roundPhase !== 'INPUT') return;

    const key = e.key ? e.key : '';
    const upperKey = key.toUpperCase();
    const code = e.code;

    if (e.key === '0') {
      window.gameState.p2AlwaysIdle = !window.gameState.p2AlwaysIdle;
      const statusEl = document.getElementById('p2-status');
      if (statusEl) {
        statusEl.textContent = window.gameState.p2AlwaysIdle ? 'DUMMY (IDLE)' : (window.gameState.p2 && window.gameState.p2.isFainted ? 'FAINTED' : 'NORMAL');
      }
      return;
    }

    // P1 Keyboard Mapping
    if (window.gameState.p1 && !window.gameState.p1.isCPU && !window.gameState.p1.isFainted && !window.gameState.p1IsConfirmed) {
      if (['A', 'D', 'W', 'S'].includes(upperKey)) {
        if (!window.gameState.p1.chargeState || window.gameState.p1.chargeState.heldDir !== upperKey) {
          startPlayerCharge('p1', upperKey, 100);
        }
      }

      if (['J', 'K', 'L', 'I'].includes(upperKey)) {
        if (!window.gameState.p1.chargeState || !window.gameState.p1.chargeState.heldDir) {
          triggerFloatingText('p1', 'TAP DIRECTION FIRST!', 'scratch');
          return;
        }
        confirmPlayerAction(`${window.gameState.p1.chargeState.heldDir}+${upperKey}`, 'p1');
      }
    }

    // P2 Keyboard Mapping
    if (window.gameState.p2 && !window.gameState.p2.isCPU && !window.gameState.p2.isFainted && !window.gameState.p2IsConfirmed) {
      let p2Dir = null;
      if (key === 'ArrowUp') p2Dir = 'W';
      if (key === 'ArrowLeft') p2Dir = 'A';
      if (key === 'ArrowDown') p2Dir = 'S';
      if (key === 'ArrowRight') p2Dir = 'D';

      if (p2Dir && (!window.gameState.p2.chargeState || window.gameState.p2.chargeState.heldDir !== p2Dir)) {
        startPlayerCharge('p2', p2Dir, 100);
      }

      let p2Act = null;
      if (key === '1' || code === 'Numpad1' || key.toLowerCase() === 'u') p2Act = 'J';
      if (key === '2' || code === 'Numpad2' || key.toLowerCase() === 'i') p2Act = 'K';
      if (key === '3' || code === 'Numpad3' || key.toLowerCase() === 'o') p2Act = 'L';
      if (key === '5' || code === 'Numpad5' || key.toLowerCase() === 'p') p2Act = 'I';

      if (p2Act) {
        if (!window.gameState.p2.chargeState || !window.gameState.p2.chargeState.heldDir) {
          triggerFloatingText('p2', 'TAP DIRECTION FIRST!', 'scratch');
          return;
        }
        confirmPlayerAction(`${window.gameState.p2.chargeState.heldDir}+${p2Act}`, 'p2');
      }
    }
  });
}

function bindCommandButtons() {
  const buttons = document.querySelectorAll('.pad-btn');
  buttons.forEach(btn => {
    const btnId = btn.id;

    const handlePressDown = (e) => {
      e.preventDefault();
      if (typeof window.unlockMobileVideos === 'function') window.unlockMobileVideos();

      btn.classList.add('active');
      setTimeout(() => btn.classList.remove('active'), 200);

      if (btnId.startsWith('p2-')) {
        handleP2TouchAction(btnId);
      } else {
        const key = btnId.replace('key-', '').replace('p1-key-', '');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
      }
    };

    btn.onmousedown = handlePressDown;
    btn.addEventListener('touchstart', handlePressDown, { passive: false });
  });
}

function handleP2TouchAction(btnId) {
  if (!window.gameState.p2 || window.gameState.p2.isCPU || window.gameState.p2IsConfirmed || window.gameState.roundPhase !== 'INPUT') return;

  const action = btnId.replace('p2-key-', '');

  if (['W', 'A', 'S', 'D', 'UP', 'LEFT', 'DOWN', 'RIGHT'].includes(action)) {
    let dir = action;
    if (action === 'UP') dir = 'W';
    if (action === 'LEFT') dir = 'A';
    if (action === 'DOWN') dir = 'S';
    if (action === 'RIGHT') dir = 'D';

    startPlayerCharge('p2', dir, 100);
  }

  if (['J', 'K', 'L', 'I', '1', '2', '3', '5'].includes(action)) {
    let act = action;
    if (action === '1') act = 'J';
    if (action === '2') act = 'K';
    if (action === '3') act = 'L';
    if (action === '5') act = 'I';

    if (!window.gameState.p2.chargeState || !window.gameState.p2.chargeState.heldDir) {
      triggerFloatingText('p2', 'TAP DIRECTION FIRST!', 'scratch');
      return;
    }
    confirmPlayerAction(`${window.gameState.p2.chargeState.heldDir}+${act}`, 'p2');
  }
}

document.addEventListener('keydown', handleGameOverInput);
document.addEventListener('click', handleGameOverInput);
document.addEventListener('touchstart', handleGameOverInput, { passive: true });

window.startRoundCountdown = startRoundCountdown;
window.confirmPlayerAction = confirmPlayerAction;
window.getCPUAggressiveFallback = getCPUAggressiveFallback;
window.getCPUMoveChoice = getCPUMoveChoice;
window.startBattle = startBattle;
window.startPlayerCharge = startPlayerCharge;
window.freezePlayerChargeBar = freezePlayerChargeBar;
window.resetPlayerChargeBars = resetPlayerChargeBars;

window.addEventListener('DOMContentLoaded', () => {
  bindKeyboardInputs();
  bindCommandButtons();
});
