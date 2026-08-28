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
    p2LockInTime: 0,
    input: {
      acceptingInputs: false,
      heldDirection: null,
      chargeStartTime: 0,
      currentPercent: 0,
      isConfirmed: false,
      selectedMoveKey: null,
      lockInTime: 0,
      chargeInterval: null
    }
  };
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
    appliedRound: gameState.roundCounter
  });
  renderBuffTrays();
}

function processRoundBuffs(player) {
  if (!player.activeBuffs) return;
  player.activeBuffs.forEach(b => {
    if (b.appliedRound !== gameState.roundCounter) {
      b.roundsLeft--;
    }
  });
  player.activeBuffs = player.activeBuffs.filter(b => b.roundsLeft > 0);
  renderBuffTrays();
}

function renderBuffTrays() {
  ['p1', 'p2'].forEach(slot => {
    const player = gameState[slot];
    const tray = document.getElementById(`${slot}-buff-tray`);
    if (!tray || !player) return;

    tray.innerHTML = '';

    if (player.activeBuffs && player.activeBuffs.length > 0) {
      player.activeBuffs.forEach(b => {
        const tag = document.createElement('div');
        tag.className = `buff-tag ${b.type || 'attack'}`;
        tag.textContent = `${b.label} (${b.roundsLeft}R)`;
        tray.appendChild(tag);
      });
    }
  });
}

function handleAirborneState(player, moveKey, move) {
  if (move && move.grantsAirborne) {
    player.airborneTicks = move.grantsAirborne;
    player.airborneAppliedRound = gameState.roundCounter;
    player.airborneChargePercent = player.activeChargePercent !== undefined ? player.activeChargePercent : 100;
  } else if (player.airborneTicks > 0) {
    if (move && move.forcesLanding) {
      player.airborneTicks = 0;
    } else if (player.airborneAppliedRound !== gameState.roundCounter) {
      player.airborneTicks--;
    }
  }
  renderBuffTrays();
}

function setSideBoxesBlank(isBlank) {
  const p1Box = document.getElementById('p1-box');
  const p2Box = document.getElementById('p2-box');
  if (p1Box) p1Box.classList.toggle('blanked', isBlank);
  if (p2Box) p2Box.classList.toggle('blanked', isBlank);
}

function updateHUD() {
  ['p1', 'p2'].forEach(slot => {
    const player = gameState[slot];
    if (!player) return;

    const nameEl = document.getElementById(`${slot}-name`);
    const lpEl = document.getElementById(`${slot}-lp`);
    const chiEl = document.getElementById(`${slot}-chi`);

    if (nameEl) nameEl.textContent = `[${slot.toUpperCase()}] ${player.name}`;

    if (lpEl) {
      if (lpEl.parentElement) {
        Array.from(lpEl.parentElement.childNodes).forEach(node => {
          if (node.nodeType === Node.TEXT_NODE && node.nodeValue.includes('LP:')) {
            node.nodeValue = node.nodeValue.replace(/LP:\s*/gi, '');
          }
        });
      }
      lpEl.innerHTML = `<span class="stat-label">LP:</span> <span class="stat-value-styled">${player.lp} / ${player.maxLp}</span>`;
    }

    if (chiEl) {
      if (chiEl.parentElement) {
        Array.from(chiEl.parentElement.childNodes).forEach(node => {
          if (node.nodeType === Node.TEXT_NODE && node.nodeValue.includes('CHI:')) {
            node.nodeValue = node.nodeValue.replace(/CHI:\s*/gi, '');
          }
        });
      }
      chiEl.className = 'stat-line stat-line-chi';
      const maxChi = player.maxChi || (window.COMBAT_RULES?.MAX_CHI || 16);
      const chiPct = Math.min(100, Math.max(0, (player.chi / maxChi) * 100));
      chiEl.innerHTML = `
        <span class="stat-label">CHI:</span> 
        <span class="stat-value-large">${player.chi}</span>
        <div class="chi-bar-track">
          <div class="chi-bar-fill" style="width: ${chiPct}%;"></div>
        </div>`;
    }
  });

  ['p1', 'p2'].forEach(slot => {
    const player = gameState[slot];
    const fillEl = document.getElementById(`${slot}-faint-fill`);
    if (fillEl && player) {
      fillEl.style.height = `${player.faintMeter}%`;
    }
  });

  const turnDisp = document.getElementById('turn-display');
  if (turnDisp) turnDisp.textContent = `ROUND ${gameState.roundCounter}`;
}

async function applyFaintBuildUp(player, playerKey, customAmount = null) {
  // Ignore faint buildup if player is already KO'd
  if (!player || player.lp <= 0 || player.isFainted) return;

  const rules = window.COMBAT_RULES || COMBAT_RULES;
  player.tookCleanHitThisRound = true;
  const amount = customAmount !== null ? customAmount : rules.HIT_BUILDUP;
  player.faintMeter = Math.min(rules.FAINT_THRESHOLD, player.faintMeter + amount);

  if (player.faintMeter >= rules.FAINT_THRESHOLD) {
    player.isFainted = true;
    player.willBeFaintedNextRound = true;

    const stunOverlay = document.getElementById(`${playerKey}-stun-overlay`);
    if (stunOverlay) stunOverlay.hidden = false;

    triggerFloatingText(playerKey, 'FAINTED!!', 'scratch');

    if (typeof playCenterVideo === 'function') {
      await playCenterVideo(playerKey, 'faint.mp4', 'FAINTED!');
    }

    if (typeof updateCharacterMedia === 'function') {
      updateCharacterMedia(playerKey, 'IDLE');
    }
  }
}

function getMoveForPlayer(playerKey, moveKey) {
  if (moveKey === 'DO_NOTHING' || !moveKey) return DO_NOTHING_MOVE;
  const moves = playerKey === 'p1' ? gameState.p1Moves : gameState.p2Moves;
  return (moves && moves[moveKey]) || DO_NOTHING_MOVE;
}

function launchRoundTimer() {
  gameState.roundPhase = 'INPUT';
  startRoundCountdown();
}

function resetRoundState() {
  if (!gameState.input) {
    gameState.input = {
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
    if (gameState.input.chargeInterval) clearInterval(gameState.input.chargeInterval);
    gameState.input.acceptingInputs = false;
    gameState.input.heldDirection = null;
    gameState.input.chargeStartTime = 0;
    gameState.input.currentPercent = 0;
    gameState.input.isConfirmed = false;
    gameState.input.selectedMoveKey = null;
    gameState.input.lockInTime = 0;
    gameState.input.chargeInterval = null;
  }

  gameState.p1SelectedMoveKey = null;
  gameState.p2SelectedMoveKey = null;
  gameState.p1IsConfirmed = false;
  gameState.p2IsConfirmed = false;

  if (gameState.p1) gameState.p1.activeChargePercent = undefined;
  if (gameState.p2) gameState.p2.activeChargePercent = undefined;
  gameState.p2ChargePercent = undefined;

  gameState.roundPhase = 'INPUT';
}

function resetCharge() {
  if (gameState && gameState.input) {
    if (gameState.input.chargeInterval) clearInterval(gameState.input.chargeInterval);
    gameState.input.heldDirection = null;
    gameState.input.currentPercent = 0;
  }

  ['W', 'A', 'S', 'D'].forEach(dir => {
    const keyEl = document.getElementById(`key-${dir}`);
    if (keyEl) keyEl.classList.remove('active');
  });

  const fillEl = document.getElementById('p1-charge-fill') || document.getElementById('charge-fill') || document.querySelector('.charge-fill');
  if (fillEl) {
    fillEl.style.width = '0%';
    fillEl.textContent = '0%';
  }

  const statusEl = document.getElementById('charge-status-display') || document.getElementById('charge-status');
  if (statusEl) {
    statusEl.textContent = 'TAP DIRECTION TO START CHARGE';
    statusEl.style.color = '#00ffcc';
  }
}

function resetTurnInputState() {
  resetCharge();
  if (!gameState.input) {
    gameState.input = {};
  }
  gameState.input.acceptingInputs = false;
  gameState.input.isConfirmed = false;
  gameState.input.selectedMoveKey = null;
  gameState.input.lockInTime = 0;
  gameState.p1IsConfirmed = false;
  gameState.p2IsConfirmed = false;
  gameState.p1SelectedMoveKey = null;
  gameState.p2SelectedMoveKey = null;
  gameState.p2LockInTime = 0;

  if (gameState.p1) delete gameState.p1.activeChargePercent;
  if (gameState.p2) delete gameState.p2.activeChargePercent;

  const flag1El = document.getElementById('p1-action-flag');
  if (flag1El) flag1El.hidden = true;

  const flag2El = document.getElementById('p2-action-flag');
  if (flag2El) flag2El.hidden = true;
}

function getCPUAggressiveFallback(playerKey) {
  const moves = playerKey === 'p1' ? gameState.p1Moves : gameState.p2Moves;
  const player = gameState[playerKey];
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
  if (cpuPlayer.isFainted || (playerKey === 'p2' && gameState.p2AlwaysIdle)) return 'DO_NOTHING';

  let movesData = playerKey === 'p1' ? gameState.p1Moves : gameState.p2Moves;
  if (!movesData || Object.keys(movesData).length === 0) {
    movesData = typeof FALLBACK_ICHIGO_MOVES !== 'undefined' ? FALLBACK_ICHIGO_MOVES : {};
  }

  const difficulty = playerKey === 'p1' 
    ? (gameState.matchConfig?.p1Difficulty || 'normal') 
    : (gameState.matchConfig?.p2Difficulty || 'normal');

  const isOpponentLocked = playerKey === 'p1'
    ? (gameState.p2IsConfirmed || (gameState.p2 && gameState.p2.isFainted) || gameState.p2AlwaysIdle)
    : (gameState.input?.isConfirmed || (gameState.p1 && gameState.p1.isFainted));

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

  if (cpuPlayer.activeChargePercent === undefined) {
    cpuPlayer.activeChargePercent = 100;
  }

  return chosenKey;
}

function confirmPlayerAction(moveKey, playerKey = 'p1') {
  if (typeof unlockMobileVideos === 'function') unlockMobileVideos();

  const player = gameState[playerKey];
  if (!player) return false;

  const isOpponentLocked = playerKey === 'p1' 
    ? (gameState.p2IsConfirmed || (gameState.p2 && gameState.p2.isFainted) || gameState.p2AlwaysIdle)
    : (gameState.input?.isConfirmed || (gameState.p1 && gameState.p1.isFainted));

  const move = getMoveForPlayer(playerKey, moveKey);
  const isGuardMove = moveKey.startsWith('A+') || (move && move.type === 'DEFENSE');

  if (isGuardMove && !isOpponentLocked) {
    if (player.isCPU) {
      const fallbackKey = getCPUAggressiveFallback(playerKey);
      return confirmPlayerAction(fallbackKey, playerKey);
    }

    triggerFloatingText(playerKey, 'NO GUARD UNTIL OPPONENT ACTS!', 'scratch');

    const statusEl = playerKey === 'p1' 
      ? (document.getElementById('charge-status-display') || document.getElementById('charge-status'))
      : document.getElementById('p2-charge-status-display');

    if (statusEl) {
      statusEl.textContent = 'CANNOT GUARD UNTIL OPPONENT SELECTS AN ACTION!';
      statusEl.style.color = '#ff0055';
    }
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

      const statusEl = playerKey === 'p1' 
        ? (document.getElementById('charge-status-display') || document.getElementById('charge-status'))
        : document.getElementById('p2-charge-status-display');

      if (statusEl) {
        statusEl.textContent = `NOT ENOUGH CHI FOR ${move.name.toUpperCase()}! (NEEDS ${chiCost} CHI)`;
        statusEl.style.color = '#ff0055';
      }
      return false;
    }
  }

  let newlyConfirmed = false;

  if (playerKey === 'p1' && (!gameState.input || !gameState.input.isConfirmed)) {
    if (!gameState.input) gameState.input = {};
    gameState.input.isConfirmed = true;
    gameState.input.selectedMoveKey = moveKey;
    gameState.input.lockInTime = gameState.turnTimerSeconds;
    gameState.p1IsConfirmed = true;
    gameState.p1SelectedMoveKey = moveKey;
    newlyConfirmed = true;
    
    if (gameState.p1.isCPU) {
      gameState.p1.activeChargePercent = gameState.p1.activeChargePercent !== undefined ? gameState.p1.activeChargePercent : 100;
    } else {
      const currentCharge = (typeof gameState.input.currentPercent === 'number' && gameState.input.currentPercent > 0)
        ? gameState.input.currentPercent 
        : 100;

      const lockedPercent = moveKey === 'DO_NOTHING' ? 100 : currentCharge;
      gameState.p1.activeChargePercent = lockedPercent;
      if (gameState.input.chargeInterval) clearInterval(gameState.input.chargeInterval);

      const flagEl = document.getElementById('p1-action-flag');
      if (flagEl) {
        flagEl.hidden = false;
        flagEl.textContent = moveKey === 'DO_NOTHING' ? 'DO NOTHING' : `LOCKED ${lockedPercent}%!`;
      }
    }
  } else if (playerKey === 'p2' && !gameState.p2IsConfirmed) {
    gameState.p2IsConfirmed = true;
    gameState.p2SelectedMoveKey = moveKey;
    gameState.p2LockInTime = gameState.turnTimerSeconds;
    newlyConfirmed = true;

    const flagEl = document.getElementById('p2-action-flag');
    if (flagEl) {
      flagEl.hidden = false;
      flagEl.textContent = moveKey === 'DO_NOTHING' ? 'DO NOTHING' : `LOCKED ${gameState.p2.activeChargePercent || 100}%!`;
    }
  }

  if (newlyConfirmed && gameState.roundPhase === 'INPUT') {
    const otherKey = playerKey === 'p1' ? 'p2' : 'p1';
    const otherPlayer = gameState[otherKey];
    const isOtherConfirmed = otherKey === 'p1' ? (gameState.input && gameState.input.isConfirmed) : gameState.p2IsConfirmed;

    if (otherPlayer && !otherPlayer.isFainted && !isOtherConfirmed && !(otherKey === 'p2' && gameState.p2AlwaysIdle)) {
      if (otherPlayer.isCPU) {
        const reactionDelay = Math.floor(Math.random() * 500 + 300);
        setTimeout(() => {
          if (gameState.roundPhase !== 'INPUT') return;
          const stillConfirmed = otherKey === 'p1' ? (gameState.input && gameState.input.isConfirmed) : gameState.p2IsConfirmed;
          if (!stillConfirmed) {
            const chosenKey = getCPUMoveChoice(otherPlayer, player, otherKey);
            if (otherPlayer.activeChargePercent === undefined) {
              otherPlayer.activeChargePercent = 100;
            }
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
  if (gameState.roundPhase !== 'INPUT') return;

  const p1Ready = (gameState.input && gameState.input.isConfirmed) || gameState.p1IsConfirmed || (gameState.p1 && gameState.p1.isFainted);
  const p2Ready = gameState.p2IsConfirmed || (gameState.p2 && gameState.p2.isFainted) || gameState.p2AlwaysIdle;

  if (p1Ready && p2Ready) {
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);
    setTimeout(() => {
      if (gameState.roundPhase === 'INPUT') {
        executeTurnResolutionPhase();
      }
    }, 200);
  }
}

function startRoundCountdown() {
  gameState.roundPhase = 'INPUT';
  resetTurnInputState();

  const rules = window.COMBAT_RULES || COMBAT_RULES;

  if (gameState.roundCounter > 1) {
    ['p1', 'p2'].forEach(slot => {
      const player = gameState[slot];
      if (player) {
        const maxChi = player.maxChi || 16;
        player.chi = Math.min(maxChi, player.chi + 1);
      }
    });
  }

  const humanControlPanel = document.getElementById('human-control-panel') || document.querySelector('.bottom-controls') || document.getElementById('p1-controls');
  const chargeStatusEl = document.getElementById('charge-status-display') || document.getElementById('charge-status');
  const p1ChargeFill = document.getElementById('p1-charge-fill') || document.getElementById('charge-fill');

  if (gameState.p1 && gameState.p1.isCPU && gameState.p2 && gameState.p2.isCPU) {
    if (humanControlPanel) humanControlPanel.style.display = 'none';
    if (chargeStatusEl) chargeStatusEl.style.display = 'none';
    if (p1ChargeFill) {
      p1ChargeFill.style.width = '0%';
      p1ChargeFill.textContent = '';
    }
  } else {
    if (humanControlPanel) {
      humanControlPanel.hidden = !!(gameState.p1 && gameState.p1.isCPU);
      humanControlPanel.style.display = (gameState.p1 && gameState.p1.isCPU) ? 'none' : 'flex';
    }
    if (chargeStatusEl) chargeStatusEl.style.display = 'block';
  }

  setTimeout(() => {
    if (gameState.input) gameState.input.acceptingInputs = true;
  }, 300);

  // FAINT STATE LIFECYCLE EVALUATION
  ['p1', 'p2'].forEach(slot => {
    const player = gameState[slot];
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
    } else if (slot === 'p2' && gameState.p2AlwaysIdle) {
      if (stunOverlay) stunOverlay.hidden = true;
      if (statusEl) statusEl.textContent = 'DUMMY (IDLE)';
    } else {
      if (stunOverlay) stunOverlay.hidden = true;
      if (statusEl) statusEl.textContent = 'NORMAL';
    }
  });

  updateHUD();
  setSideBoxesBlank(false);
  if (typeof hideCenterScreen === 'function') hideCenterScreen();

  if (typeof updateCharacterMedia === 'function') {
    updateCharacterMedia('p1', 'IDLE');
    updateCharacterMedia('p2', 'IDLE');
  }

  if (gameState.p1 && gameState.p1.isFainted) {
    confirmPlayerAction('DO_NOTHING', 'p1');
  }
  if (gameState.p2 && gameState.p2.isFainted) {
    confirmPlayerAction('DO_NOTHING', 'p2');
  }

  const battleMsg = document.getElementById('battle-message');
  if (battleMsg) {
    battleMsg.hidden = false;
    battleMsg.textContent = `ROUND ${gameState.roundCounter}: READY!`;
  }

  setTimeout(() => {
    if (gameState.roundPhase === 'INPUT' && battleMsg) {
      battleMsg.hidden = true;
    }
  }, 1200);

  if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  gameState.turnTimerSeconds = 8;

  const timerEl = document.getElementById('turn-timer');
  if (timerEl) timerEl.textContent = `TIME: ${gameState.turnTimerSeconds}s`;

  ['p1', 'p2'].forEach(slot => {
    const player = gameState[slot];
    if (player && player.isCPU && !player.isFainted) {
      if (slot === 'p2' && gameState.p2AlwaysIdle) return;

      const thinkTime = Math.floor(Math.random() * 1000 + 800);
      setTimeout(() => {
        if (gameState.roundPhase !== 'INPUT' || (slot === 'p1' ? (gameState.input && gameState.input.isConfirmed) : gameState.p2IsConfirmed)) return;
        const oppSlot = slot === 'p1' ? 'p2' : 'p1';
        let moveKey = getCPUMoveChoice(player, gameState[oppSlot], slot);
        
        if (player.activeChargePercent === undefined) {
          player.activeChargePercent = 100;
        }
        confirmPlayerAction(moveKey, slot);
      }, thinkTime);
    }
  });

  gameState.timerInterval = setInterval(() => {
    if (gameState.roundPhase !== 'INPUT') return;

    gameState.turnTimerSeconds--;
    if (timerEl) timerEl.textContent = `TIME: ${gameState.turnTimerSeconds}s`;

    const baseWindow = (window.GAME_CONFIG && window.GAME_CONFIG.ROUND_TIME_LIMIT) || 8.0;
    const halfTimeThreshold = Math.floor(baseWindow / 2);

    if (gameState.turnTimerSeconds <= halfTimeThreshold) {
      ['p1', 'p2'].forEach(slot => {
        const player = gameState[slot];
        const isConfirmed = slot === 'p1' ? (gameState.input && gameState.input.isConfirmed) : gameState.p2IsConfirmed;

        if (player && player.isCPU && !player.isFainted && !isConfirmed) {
          if (slot === 'p2' && gameState.p2AlwaysIdle) return;

          const oppSlot = slot === 'p1' ? 'p2' : 'p1';
          const isOpponentConfirmed = oppSlot === 'p1' ? (gameState.input && gameState.input.isConfirmed) : gameState.p2IsConfirmed;

          let moveKey = getCPUMoveChoice(player, gameState[oppSlot], slot);
          if (!isOpponentConfirmed && (moveKey.startsWith('A+') || getMoveForPlayer(slot, moveKey).type === 'DEFENSE')) {
            moveKey = getCPUAggressiveFallback(slot);
          }

          if (player.activeChargePercent === undefined) {
            player.activeChargePercent = 90;
          }

          confirmPlayerAction(moveKey, slot);
        }
      });
    }

    if (gameState.turnTimerSeconds <= 0) {
      clearInterval(gameState.timerInterval);

      if (!gameState.input || !gameState.input.isConfirmed) {
        if (gameState.p1 && gameState.p1.isCPU) {
          let mk = getCPUAggressiveFallback('p1');
          if (gameState.p1.activeChargePercent === undefined) gameState.p1.activeChargePercent = 85;
          confirmPlayerAction(mk, 'p1');
        } else {
          if (!gameState.input) gameState.input = {};
          gameState.input.isConfirmed = true;
          gameState.input.selectedMoveKey = 'DO_NOTHING';
          if (gameState.p1) gameState.p1.activeChargePercent = 100;
        }
      }

      if (!gameState.p2IsConfirmed) {
        if (gameState.p2 && gameState.p2.isCPU && !gameState.p2AlwaysIdle) {
          let mk = getCPUAggressiveFallback('p2');
          if (gameState.p2.activeChargePercent === undefined) gameState.p2.activeChargePercent = 85;
          confirmPlayerAction(mk, 'p2');
        } else {
          gameState.p2IsConfirmed = true;
          gameState.p2SelectedMoveKey = 'DO_NOTHING';
          if (gameState.p2) gameState.p2.activeChargePercent = 100;
        }
      }

      executeTurnResolutionPhase();
    }
  }, 1000);
}

function updateChargeProgress() {
  if (!gameState.input || !gameState.input.heldDirection || gameState.roundPhase !== 'INPUT' || (gameState.p1 && gameState.p1.isFainted)) return;

  let duration = CHARGE_TIMES[gameState.input.heldDirection] || 2000;
  
  if (gameState.p1 && gameState.p1.activeBuffs && gameState.p1.activeBuffs.some(b => b.id === 'charge_speed')) {
    duration = duration * 0.75;
  }

  const elapsed = Date.now() - gameState.input.chargeStartTime;
  gameState.input.currentPercent = Math.min(100, Math.floor((elapsed / duration) * 100));

  const fillEl = document.getElementById('p1-charge-fill') || document.getElementById('charge-fill') || document.querySelector('.charge-fill');
  if (fillEl) {
    fillEl.style.width = `${gameState.input.currentPercent}%`;
    fillEl.textContent = `${gameState.input.currentPercent}%`;
  }

  const statusEl = document.getElementById('charge-status-display') || document.getElementById('charge-status');
  if (statusEl) {
    statusEl.textContent = `CHARGING [${gameState.input.heldDirection}]: ${gameState.input.currentPercent}% (TAP ACTION TO LOCK)`;
    statusEl.style.color = gameState.input.currentPercent >= 100 ? '#00ffcc' : '#ffcc00';
  }
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
    defender.faintMeter = Math.min(rules.FAINT_THRESHOLD, defender.faintMeter + faintPenalty);
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

    if (attacker.activeBuffs && attacker.activeBuffs.some(b => b.id === 'arm_calibration')) {
      attackerHitBonus += 15;
    }

    let rawHitRate = (baseHitChance * accuracyDiscount) + attackerHitBonus;

    let baseEvasionPct = (defender && defender.evasionRate !== undefined) ? defender.evasionRate : 0.0;
    if (defender.id === 'ichigo' && defender.airborneTicks > 0) {
      baseEvasionPct += 0.20;
    }

    let instabilityMult = 1.0;
    if (defender.airborneTicks > 0 && defender.airborneAppliedRound === gameState.roundCounter) {
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
  let typhoonMultiplier = (isDOrS && attacker.activeBuffs && attacker.activeBuffs.some(b => b.id === 'typhoon' || b.id === 'typhoon_speed' || b.id === 'double_typhoon')) ? 1.25 : 1.0;

  let focusMultiplier = 1.0;
  if (attacker.activeBuffs) {
    if (atkMoveKey.startsWith('S') && attacker.activeBuffs.some(b => b.id === 'focus' || b.id === 'v3_focus')) {
      focusMultiplier = 1.20;
    } else if (atkMoveKey.startsWith('D') && attacker.activeBuffs.some(b => b.id === 'power_focus')) {
      focusMultiplier = 1.30;
    }
  }

  let jumpAtkMultiplier = attacker.airborneTicks > 0 ? 1.15 : 1.0;

  let baseDamage = atkMove.baseDamage || 0;
  let calculatedDmg = baseDamage * chargeFactor * typhoonMultiplier * focusMultiplier * jumpAtkMultiplier * damageRatio;

  let finalDmg = (isGlancing && calculatedDmg > 0) ? Math.max(1, Math.floor(calculatedDmg * 0.20)) : Math.floor(calculatedDmg);

  return { isOffensive: true, hitLanded: true, isGlancing: isGlancing, guardSuccess: guardSuccess, isMatchingGuard: isMatchingGuard, chiGained: chiGained, finalDmg: finalDmg };
}

async function executeTurnResolutionPhase() {
  const rules = window.COMBAT_RULES || COMBAT_RULES;
  gameState.roundPhase = 'RESOLUTION';

  const p1StartLp = gameState.p1.lp;
  const p2StartLp = gameState.p2.lp;
  const p1StartFaint = gameState.p1.faintMeter;
  const p2StartFaint = gameState.p2.faintMeter;

  let p1MoveKey = null;
  let p2MoveKey = null;

  if (gameState.p1.isCPU && gameState.p2.isCPU) {
    if (Math.random() < 0.5) {
      p1MoveKey = getCPUMoveChoice(gameState.p1, gameState.p2, 'p1');
      p2MoveKey = getCPUMoveChoice(gameState.p2, gameState.p1, 'p2');
    } else {
      p2MoveKey = getCPUMoveChoice(gameState.p2, gameState.p1, 'p2');
      p1MoveKey = getCPUMoveChoice(gameState.p1, gameState.p2, 'p1');
    }

    gameState.p1SelectedMoveKey = p1MoveKey;
    gameState.p2SelectedMoveKey = p2MoveKey;

    const flag1El = document.getElementById('p1-action-flag');
    if (flag1El) {
      flag1El.hidden = false;
      flag1El.textContent = p1MoveKey === 'DO_NOTHING' ? 'DO NOTHING' : `LOCKED ${gameState.p1.activeChargePercent || 100}%!`;
    }
    const flag2El = document.getElementById('p2-action-flag');
    if (flag2El) {
      flag2El.hidden = false;
      flag2El.textContent = p2MoveKey === 'DO_NOTHING' ? 'DO NOTHING' : `LOCKED ${gameState.p2.activeChargePercent || 100}%!`;
    }
  } else {
    if (gameState.p1.isCPU) {
      p1MoveKey = getCPUMoveChoice(gameState.p1, gameState.p2, 'p1');
    } else {
      p1MoveKey = gameState.input ? gameState.input.selectedMoveKey : null;
      if (gameState.p1.activeChargePercent === undefined) {
        if (gameState.input && typeof gameState.input.currentPercent === 'number' && gameState.input.currentPercent > 0) {
          gameState.p1.activeChargePercent = gameState.input.currentPercent;
        } else {
          gameState.p1.activeChargePercent = 100;
        }
      }
    }

    p2MoveKey = gameState.p2AlwaysIdle ? 'DO_NOTHING' : gameState.p2SelectedMoveKey;
    if (!p2MoveKey && gameState.p2.isCPU && !gameState.p2AlwaysIdle) {
      p2MoveKey = getCPUMoveChoice(gameState.p2, gameState.p1, 'p2');
    } else if (!gameState.p2.isCPU && gameState.p2.activeChargePercent === undefined) {
      gameState.p2.activeChargePercent = typeof gameState.p2ChargePercent === 'number' ? gameState.p2ChargePercent : 100;
    }
  }

  if (!p1MoveKey) p1MoveKey = 'DO_NOTHING';
  if (!p2MoveKey) p2MoveKey = 'DO_NOTHING';

  if (gameState.p1.isCPU && p1MoveKey !== 'DO_NOTHING' && typeof simulateCPUButtonPress === 'function') {
    simulateCPUButtonPress(p1MoveKey, 'p1');
  }
  if (gameState.p2.isCPU && !gameState.p2AlwaysIdle && p2MoveKey !== 'DO_NOTHING' && typeof simulateCPUButtonPress === 'function') {
    simulateCPUButtonPress(p2MoveKey, 'p2');
  }

  const defaultMove = { name: 'Do Nothing', type: 'IDLE', baseDamage: 0, chiCost: 0 };
  let p1Move = (typeof getMoveForPlayer === 'function' ? getMoveForPlayer('p1', p1MoveKey) : null) || defaultMove;
  let p2Move = (typeof getMoveForPlayer === 'function' ? getMoveForPlayer('p2', p2MoveKey) : null) || defaultMove;

  const battleMsg = document.getElementById('battle-message');
  if (battleMsg) {
    battleMsg.hidden = false;
    const p1Charge = gameState.p1.activeChargePercent !== undefined ? gameState.p1.activeChargePercent : 100;
    const p2Charge = gameState.p2.activeChargePercent !== undefined ? gameState.p2.activeChargePercent : 100;
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
    let p1Charge = gameState.p1.activeChargePercent !== undefined ? gameState.p1.activeChargePercent : 100;
    let p2Charge = gameState.p2.activeChargePercent !== undefined ? gameState.p2.activeChargePercent : 100;

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

  let attacker1 = p1GoesFirst ? gameState.p1 : gameState.p2;
  let defender1 = p1GoesFirst ? gameState.p2 : gameState.p1;
  let move1 = p1GoesFirst ? p1Move : p2Move;
  let key1 = p1GoesFirst ? p1MoveKey : p2MoveKey;
  let atkKey1 = p1GoesFirst ? 'p1' : 'p2';
  let defKey1 = p1GoesFirst ? 'p2' : 'p1';

  let attacker2 = p1GoesFirst ? gameState.p2 : gameState.p1;
  let defender2 = p1GoesFirst ? gameState.p1 : gameState.p2;
  let move2 = p1GoesFirst ? p2Move : p1Move;
  let key2 = p1GoesFirst ? p2MoveKey : p1MoveKey;
  let atkKey2 = p1GoesFirst ? 'p2' : 'p1';
  let defKey2 = p1GoesFirst ? 'p1' : 'p2';

  let defender1WasInterrupted = false;
  let defender1GuardDeducted = false;

  // STEP 1 EXECUTION
  if (move1.type !== 'IDLE' && key1 !== 'DO_NOTHING') {
    if (move1.buff) applyBuff(attacker1, move1.buff.id, move1.buff.label, move1.buff.type, move1.buff.duration);
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

      if (!isOpponentOffensive && typeof playCenterVideo === 'function') {
        await playCenterVideo(atkKey1, move1.video || 'guard.mp4', move1.name, null, move1);
      }
    } else {
      if (typeof playCenterVideo === 'function') {
        await playCenterVideo(atkKey1, move1.video || 'idle.mp4', move1.name, null, move1);
      }

      let result = resolveAttack(attacker1, defender1, move1, key1, move2, key2, defKey1);

      if (result.isOffensive) {
        if (move2.type === 'DEFENSE' && !defender1.isFainted) {
          defender1.chi = Math.max(0, defender1.chi - (move2.chiCost || 0));
          defender1GuardDeducted = true;
          updateHUD();

          if (result.guardSuccess) {
            const guardVid = move2.video || 'guard.mp4';
            if (typeof playCenterVideo === 'function') {
              await playCenterVideo(defKey1, guardVid, 'GUARDED!', null, move2);
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
            if (typeof playCenterVideo === 'function') {
              await playCenterVideo(defKey1, hitVid, 'TAKING DAMAGE');
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
          if (typeof playCenterVideo === 'function') {
            await playCenterVideo(defKey1, 'dodge.mp4', 'DODGED!');
          }
          triggerFloatingText(defKey1, 'MISS!!', 'miss');
        } else if (result.isGlancing) {
          if (typeof playCenterVideo === 'function') {
            await playCenterVideo(defKey1, 'dodge.mp4', 'EVADED!');
          }
          defender1.lp = Math.max(0, defender1.lp - result.finalDmg);

          if (key1.startsWith('D') && (move1.chiCost || 0) <= 0) {
            const chiGain = (key1 === 'D+J' || key1 === 'D+K') ? 2 : 3;
            attacker1.chi = Math.min(rules.MAX_CHI, attacker1.chi + chiGain);
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
          if (typeof playCenterVideo === 'function') {
            await playCenterVideo(defKey1, hitVid, 'TAKING DAMAGE');
          }

          defender1.lp = Math.max(0, defender1.lp - result.finalDmg);

          if (key1.startsWith('D') && (move1.chiCost || 0) <= 0) {
            const chiGain = (key1 === 'D+J' || key1 === 'D+K') ? 2 : 3;
            attacker1.chi = Math.min(rules.MAX_CHI, attacker1.chi + chiGain);
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
    handleAirborneState(attacker2, key2, move2);

    if (move2.faintRecovery && attacker2.faintMeter > 0) {
      const recovered = Math.min(attacker2.faintMeter, move2.faintRecovery);
      attacker2.faintMeter = Math.max(0, attacker2.faintMeter - move2.faintRecovery);
      triggerFloatingText(atkKey2, `FAINT -${recovered}`, 'heal');
    }

    attacker2.chi = Math.max(0, attacker2.chi - (move2.chiCost || 0));
    updateHUD();

    if (typeof playCenterVideo === 'function') {
      await playCenterVideo(atkKey2, move2.video || 'idle.mp4', move2.name, null, move2);
    }
    let result = resolveAttack(attacker2, defender2, move2, key2, move1, key1, defKey2);

    if (result.isOffensive) {
      if (move1.type === 'DEFENSE' && !defender2.isFainted) {
        if (result.guardSuccess) {
          const guardVid = move1.video || 'guard.mp4';
          if (typeof playCenterVideo === 'function') {
            await playCenterVideo(defKey2, guardVid, 'GUARDED!', null, move1);
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
          if (typeof playCenterVideo === 'function') {
            await playCenterVideo(defKey2, hitVid, 'TAKING DAMAGE');
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
        if (typeof playCenterVideo === 'function') {
          await playCenterVideo(defKey2, 'dodge.mp4', 'DODGED!');
        }
        triggerFloatingText(defKey2, 'MISS!!', 'miss');
      } else if (result.isGlancing) {
        if (typeof playCenterVideo === 'function') {
          await playCenterVideo(defKey2, 'dodge.mp4', 'EVADED!');
        }
        defender2.lp = Math.max(0, defender2.lp - result.finalDmg);

        if (key2.startsWith('D') && (move2.chiCost || 0) <= 0) {
          const chiGain = (key2 === 'D+J' || key2 === 'D+K') ? 2 : 3;
          attacker2.chi = Math.min(rules.MAX_CHI, attacker2.chi + chiGain);
        }
        updateHUD();

        triggerStaggeredPopups(defKey2, [
          { type: 'text', text: 'SCRATCH!', customClass: 'scratch' },
          { type: 'number', amount: result.finalDmg, isHeal: false }
        ]);

        await applyFaintBuildUp(defender2, defKey2, 10);
      } else {
        const hitVid = key2.startsWith('S') ? 'hit.mp4' : 'hit_physical.mp4';
        if (typeof playCenterVideo === 'function') {
          await playCenterVideo(defKey2, hitVid, 'TAKING DAMAGE');
        }

        defender2.lp = Math.max(0, defender2.lp - result.finalDmg);

        if (key2.startsWith('D') && (move2.chiCost || 0) <= 0) {
          const chiGain = (key2 === 'D+J' || key2 === 'D+K') ? 2 : 3;
          attacker2.chi = Math.min(rules.MAX_CHI, attacker2.chi + chiGain);
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

  // ROUND CONCLUSION
  setTimeout(() => {
    if (typeof hideCenterScreen === 'function') hideCenterScreen();
    setSideBoxesBlank(false);

    if (battleMsg) battleMsg.hidden = true;

    const p1DmgTaken = p1StartLp - gameState.p1.lp;
    const p2DmgTaken = p2StartLp - gameState.p2.lp;

    if (gameState.p2.isCPU && window.globalAIKnowledge && typeof window.calculateMoveSuccess === 'function') {
      const wasSuccessful = window.calculateMoveSuccess(gameState.p2, gameState.p1, p2MoveKey, {
        damageDealt: p1DmgTaken,
        damageTaken: p2DmgTaken,
        oppChargePercent: gameState.p1.activeChargePercent || 100,
        cpuWasHit: p2DmgTaken > 0,
        cpuWasInterrupted: defender1WasInterrupted && attacker2 === gameState.p1,
        oppWasGuarded: p1Move.type === 'DEFENSE',
        chiSpent: p2Move.chiCost || 0,
        oppAttemptedAttack: p1Move.type !== 'DEFENSE' && p1Move.type !== 'IDLE',
        faintRecovered: Math.max(0, p2StartFaint - gameState.p2.faintMeter)
      });
      window.globalAIKnowledge.recordTurnOutcome(gameState.p2, gameState.p1, p1MoveKey, p2MoveKey, wasSuccessful);
    }

    if (gameState.p1.isCPU && window.globalAIKnowledge && typeof window.calculateMoveSuccess === 'function') {
      const wasSuccessful = window.calculateMoveSuccess(gameState.p1, gameState.p2, p1MoveKey, {
        damageDealt: p2DmgTaken,
        damageTaken: p1DmgTaken,
        oppChargePercent: gameState.p2.activeChargePercent || 100,
        cpuWasHit: p1DmgTaken > 0,
        cpuWasInterrupted: defender1WasInterrupted && attacker2 === gameState.p2,
        oppWasGuarded: p2Move.type === 'DEFENSE',
        chiSpent: p1Move.chiCost || 0,
        oppAttemptedAttack: p2Move.type !== 'DEFENSE' && p2Move.type !== 'IDLE',
        faintRecovered: Math.max(0, p1StartFaint - gameState.p1.faintMeter)
      });
      window.globalAIKnowledge.recordTurnOutcome(gameState.p1, gameState.p2, p2MoveKey, p1MoveKey, wasSuccessful);
    }

    processRoundBuffs(gameState.p1);
    processRoundBuffs(gameState.p2);

    // PASSIVE RECOVERY CHECK (ONLY IF NOT FAINTED)
    ['p1', 'p2'].forEach(slot => {
      const player = gameState[slot];
      if (player) {
        if (!player.isFainted && !player.tookCleanHitThisRound && player.faintMeter > 0) {
          player.faintMeter = Math.max(0, player.faintMeter - rules.ROUND_RECOVERY);
        }
        player.tookCleanHitThisRound = false;
      }
    });

    updateHUD();

    if (gameState.p1.lp > 0 && gameState.p2.lp > 0) {
      gameState.roundCounter++;
      resetRoundState();

      launchRoundTimer();

      if (gameState.p1.isCPU && gameState.p2.isCPU) {
        setTimeout(() => {
          if (gameState.roundPhase === 'INPUT') {
            executeTurnResolutionPhase();
          }
        }, 1200);
      }
    } else {
      gameState.roundPhase = 'GAME_OVER';
      if (battleMsg) battleMsg.hidden = false;

      if (typeof saveAIKnowledge === 'function') {
        saveAIKnowledge();
      }

      if (typeof recordMatchStats === 'function') {
        const winner = gameState.p1.lp > 0 ? gameState.p1 : (gameState.p2.lp > 0 ? gameState.p2 : null);
        recordMatchStats({ winner });
      }

      ['p1', 'p2'].forEach(slot => {
        const stunOverlay = document.getElementById(`${slot}-stun-overlay`);
        if (stunOverlay) stunOverlay.hidden = true;
        if (gameState[slot]) gameState[slot].isFainted = false;
      });

      let resultText = "";
      if (gameState.p1.lp <= 0 && gameState.p2.lp <= 0) {
        resultText = "DOUBLE KO!<br>DRAW MATCH!";
        if (typeof updateCharacterMedia === 'function') {
          updateCharacterMedia('p1', 'KO');
          updateCharacterMedia('p2', 'KO');
        }
      } else if (gameState.p1.lp <= 0) {
        resultText = `KO!<br>P2 ${gameState.p2.name.toUpperCase()} WINS!`;
        if (typeof updateCharacterMedia === 'function') {
          updateCharacterMedia('p1', 'KO');
          updateCharacterMedia('p2', 'VICTORY');
        }
      } else {
        resultText = `KO!<br>P1 ${gameState.p1.name.toUpperCase()} WINS!`;
        if (typeof updateCharacterMedia === 'function') {
          updateCharacterMedia('p1', 'VICTORY');
          updateCharacterMedia('p2', 'KO');
        }
      }

      battleMsg.innerHTML = `${resultText}<br><span class="continue-prompt">PRESS ANY KEY TO CONTINUE</span>`;

      gameState.canContinueFromGameOver = false;
      setTimeout(() => {
        gameState.canContinueFromGameOver = true;
      }, 1000);
    }
  }, 1000);
}

function startBattle(matchConfig) {
  if (!window.gameState) window.gameState = {};
  gameState.matchConfig = matchConfig || {};
  if (!gameState.videoCache) gameState.videoCache = {};

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
      gameState.p1Moves = fallback;
      gameState.p2Moves = fallback;

      fetch('data/moves.json')
        .then(res => res.ok ? res.json() : null)
        .then(allMoves => {
          if (allMoves) {
            gameState.p1Moves = allMoves[p1Id] || fallback;
            gameState.p2Moves = allMoves[p2Id] || fallback;
          }
        })
        .catch(() => {});
    } catch (e) {
      gameState.p1Moves = typeof FALLBACK_ICHIGO_MOVES !== 'undefined' ? FALLBACK_ICHIGO_MOVES : {};
      gameState.p2Moves = typeof FALLBACK_ICHIGO_MOVES !== 'undefined' ? FALLBACK_ICHIGO_MOVES : {};
    }

    const p1Rider = matchConfig.p1Rider || { id: 'ichigo', name: 'Kamen Rider Ichigo', maxLp: 1850 };
    const p2Rider = matchConfig.p2Rider || { id: 'nigo', name: 'Kamen Rider Nigo', maxLp: 2000 };

    const rules = window.COMBAT_RULES || COMBAT_RULES;
    const hpMultiplier = (window.GAME_CONFIG && window.GAME_CONFIG.HARD_CPU_HP_MULTIPLIER) || 1.30;

    let p1MaxLp = p1Rider.maxLp || 1850;
    if (matchConfig.p1IsCPU && matchConfig.p1Difficulty === 'hard') p1MaxLp = Math.floor(p1MaxLp * hpMultiplier);

    let p2MaxLp = p2Rider.maxLp || 2000;
    if (matchConfig.p2IsCPU && matchConfig.p2Difficulty === 'hard') p2MaxLp = Math.floor(p2MaxLp * hpMultiplier);

    gameState.p1 = {
      id: p1Rider.id || 'ichigo',
      name: p1Rider.name || 'Kamen Rider Ichigo',
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

    gameState.p2 = {
      id: p2Rider.id || 'nigo',
      name: p2Rider.name || 'Kamen Rider Nigo',
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

    gameState.roundCounter = 1;

    if (splashNames) splashNames.textContent = `${gameState.p1.name.toUpperCase()} VS ${gameState.p2.name.toUpperCase()}`;
    if (splashRound) splashRound.textContent = "PRELOADING ASSETS...";
    if (transitionScreen) transitionScreen.hidden = false;

    if (typeof preloadRiderVideos === 'function') {
      try {
        preloadRiderVideos(p1Rider.id, gameState.p1Moves);
        preloadRiderVideos(p2Rider.id, gameState.p2Moves);
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

    if (typeof updateCharacterMedia === 'function') {
      updateCharacterMedia('p1', 'IDLE');
      updateCharacterMedia('p2', 'IDLE');
    }

    const humanControls = document.getElementById('human-control-panel');
    if (humanControls) {
      humanControls.hidden = !!gameState.p1.isCPU;
      humanControls.style.display = gameState.p1.isCPU ? 'none' : 'flex';
    }

    launchRoundTimer();

    if (gameState.p1.isCPU && gameState.p2.isCPU) {
      setTimeout(() => {
        if (gameState.roundPhase === 'INPUT') {
          executeTurnResolutionPhase();
        }
      }, 1200);
    }
  }
}

function returnToSelectScreen() {
  gameState.roundPhase = 'IDLE';
  gameState.canContinueFromGameOver = false;

  if (typeof stopBattleBGM === 'function') stopBattleBGM();
  if (typeof playSelectionBGM === 'function') playSelectionBGM();

  const battleScreen = document.getElementById('battle-screen');
  const selectScreen = document.getElementById('vs-select-screen');
  const battleMsg = document.getElementById('battle-message');
  
  if (battleScreen) battleScreen.hidden = true;
  if (battleMsg) battleMsg.hidden = true;
  if (selectScreen) {
    selectScreen.hidden = false;
  }

  if (window.vsSelectionState) {
    window.vsSelectionState.step = 1;
    if (typeof updateSelectionUI === 'function') {
      updateSelectionUI();
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

function bindCommandButtons() {
  const buttons = document.querySelectorAll('.pad-btn');
  buttons.forEach(btn => {
    const key = btn.id.replace('key-', '');

    const handlePressDown = (e) => {
      e.preventDefault();
      if (typeof unlockMobileVideos === 'function') unlockMobileVideos();

      btn.classList.add('active');
      setTimeout(() => btn.classList.remove('active'), 200);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
    };

    btn.onmousedown = handlePressDown;
    btn.addEventListener('touchstart', handlePressDown, { passive: false });
  });
}

function bindKeyboardInputs() {
  window.addEventListener('keydown', (e) => {
    if (typeof unlockMobileVideos === 'function') unlockMobileVideos();

    if (gameState.roundPhase === 'GAME_OVER' && gameState.canContinueFromGameOver) {
      returnToSelectScreen();
      return;
    }

    const key = e.key ? e.key.toUpperCase() : '';

    if (e.key === '0') {
      gameState.p2AlwaysIdle = !gameState.p2AlwaysIdle;
      const statusEl = document.getElementById('p2-status');
      if (statusEl) {
        statusEl.textContent = gameState.p2AlwaysIdle ? 'DUMMY (IDLE)' : (gameState.p2 && gameState.p2.isFainted ? 'FAINTED' : 'NORMAL');
      }
      return;
    }

    if (gameState.roundPhase !== 'INPUT' || !gameState.input || !gameState.input.acceptingInputs || (gameState.p1 && gameState.p1.isCPU) || gameState.input.isConfirmed || (gameState.p1 && gameState.p1.isFainted)) return;

    if (['A', 'D', 'W', 'S'].includes(key)) {
      if (gameState.input.heldDirection === key) return;

      if (gameState.input.chargeInterval) clearInterval(gameState.input.chargeInterval);

      ['W', 'A', 'S', 'D'].forEach(dir => {
        const keyEl = document.getElementById(`key-${dir}`);
        if (keyEl) keyEl.classList.remove('active');
      });

      gameState.input.heldDirection = key;
      gameState.input.chargeStartTime = Date.now();
      gameState.input.currentPercent = 0;
      gameState.input.chargeInterval = setInterval(updateChargeProgress, 30);

      const keyEl = document.getElementById(`key-${key}`);
      if (keyEl) keyEl.classList.add('active');
    }

    if (['J', 'K', 'L', 'I'].includes(key)) {
      if (!gameState.input.heldDirection) {
        triggerFloatingText('p1', 'TAP DIRECTION FIRST!', 'scratch');
        return;
      }

      const actKeyEl = document.getElementById(`key-${key}`);
      if (actKeyEl) {
        actKeyEl.classList.add('active');
        setTimeout(() => actKeyEl.classList.remove('active'), 200);
      }

      confirmPlayerAction(`${gameState.input.heldDirection}+${key}`, 'p1');
    }
  });
}

document.addEventListener('keydown', handleGameOverInput);
document.addEventListener('click', handleGameOverInput);
document.addEventListener('touchstart', handleGameOverInput, { passive: true });

window.startRoundCountdown = startRoundCountdown;
window.confirmPlayerAction = confirmPlayerAction;
window.getCPUAggressiveFallback = getCPUAggressiveFallback;
window.getCPUMoveChoice = getCPUMoveChoice;
window.startBattle = startBattle;

window.addEventListener('DOMContentLoaded', () => {
  bindKeyboardInputs();
  bindCommandButtons();
});
