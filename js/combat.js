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
  hideCenterScreen();

  updateCharacterMedia('p1', 'IDLE');
  updateCharacterMedia('p2', 'IDLE');

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
      if (typeof returnToSelectScreen === 'function') returnToSelectScreen();
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

async function startBattle(matchConfig) {
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
      const res = await fetch('data/moves.json');
      if (res.ok) {
        const allMoves = await res.json();
        gameState.p1Moves = (matchConfig.p1Rider && allMoves[matchConfig.p1Rider.id]) || allMoves['ichigo'] || FALLBACK_ICHIGO_MOVES;
        gameState.p2Moves = (matchConfig.p2Rider && allMoves[matchConfig.p2Rider.id]) || allMoves['ichigo'] || FALLBACK_ICHIGO_MOVES;
      }
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
        const preloadTask = Promise.all([
          preloadRiderVideos(p1Rider.id, gameState.p1Moves),
          preloadRiderVideos(p2Rider.id, gameState.p2Moves)
        ]);
        const timeoutTask = new Promise(resolve => setTimeout(resolve, 1200));
        await Promise.race([preloadTask, timeoutTask]);
      } catch (err) {
        console.warn("Video preload skipped/timed out:", err);
      }
    }

    if (splashRound) splashRound.textContent = "GET READY FOR THE FIGHT!";
    await new Promise(resolve => setTimeout(resolve, 1200));

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
