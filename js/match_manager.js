/**
 * Match Lifecycle, Timers, Real-Time Charge Progress & Input Binding Manager
 * Path: js/match_manager.js
 */

var CHARGE_TIMES = CHARGE_TIMES || {
  'A': 1280,  // Defense
  'D': 2080,  // Offense
  'W': 3200,  // Air/Buffs
  'S': 4160   // Energy/Specials
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

/* --- CPU & INPUT HELPERS --- */

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

function getMoveForPlayer(playerKey, moveKey) {
  if (moveKey === 'DO_NOTHING' || !moveKey) return window.DO_NOTHING_MOVE || { name: "Do Nothing", type: "IDLE", chiCost: 0, baseDamage: 0, hitChance: 100 };
  const moves = playerKey === 'p1' ? window.gameState.p1Moves : window.gameState.p2Moves;
  return (moves && moves[moveKey]) || window.DO_NOTHING_MOVE;
}

/* --- CHARGE SYSTEM --- */

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

/* --- STATE RESET & LOCK-IN ENGINE --- */

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
    movesData = typeof window.FALLBACK_ICHIGO_MOVES !== 'undefined' ? window.FALLBACK_ICHIGO_MOVES : {};
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

    if (typeof window.triggerFloatingText === 'function') {
      window.triggerFloatingText(playerKey, 'NO GUARD UNTIL OPPONENT ACTS!', 'scratch');
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

      if (typeof window.triggerFloatingText === 'function') {
        window.triggerFloatingText(playerKey, 'NOT ENOUGH CHI!', 'miss');
      }
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
      if (window.gameState.roundPhase === 'INPUT' && typeof window.executeTurnResolutionPhase === 'function') {
        window.executeTurnResolutionPhase();
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

  if (typeof window.updatePlayerHUD === 'function') {
    window.updatePlayerHUD('p1', window.gameState.p1);
    window.updatePlayerHUD('p2', window.gameState.p2);
  }
  if (typeof window.setSideBoxesBlank === 'function') window.setSideBoxesBlank(false);
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

      if (typeof window.executeTurnResolutionPhase === 'function') {
        window.executeTurnResolutionPhase();
      }
    }
  }, 1000);
}

function launchRoundTimer() {
  window.gameState.roundPhase = 'INPUT';
  startRoundCountdown();
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
    const p1Rider = matchConfig.p1Rider || { id: 'ichigo', name: 'Kamen Rider Ichigo', maxLp: 3000, sourceFacing: 'left', videoFolder: 'assets/videos/ichigo/' };
    const p2Rider = matchConfig.p2Rider || { id: 'nigo', name: 'Kamen Rider Nigo', maxLp: 3300, sourceFacing: 'right', videoFolder: 'assets/videos/nigo/' };

    const p1Id = p1Rider.id || 'ichigo';
    const p2Id = p2Rider.id || 'nigo';

    const fallback = typeof window.FALLBACK_ICHIGO_MOVES !== 'undefined' ? window.FALLBACK_ICHIGO_MOVES : {};
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

    const rules = window.COMBAT_RULES || COMBAT_RULES;
    const hpMultiplier = (window.GAME_CONFIG && window.GAME_CONFIG.HARD_CPU_HP_MULTIPLIER) || 1.10;

    let p1MaxLp = p1Rider.maxLp || 3000;
    if (matchConfig.p1IsCPU && matchConfig.p1Difficulty === 'hard') p1MaxLp = Math.floor(p1MaxLp * hpMultiplier);

    let p2MaxLp = p2Rider.maxLp || 3300;
    if (matchConfig.p2IsCPU && matchConfig.p2Difficulty === 'hard') p2MaxLp = Math.floor(p2MaxLp * hpMultiplier);

    window.gameState.p1 = {
      id: p1Rider.id || 'ichigo',
      name: p1Rider.name || 'Kamen Rider Ichigo',
      sourceFacing: p1Rider.sourceFacing || 'left',
      videoFolder: p1Rider.videoFolder || `assets/videos/${p1Rider.id}/`,
      archetype: p1Rider.archetype || 'Balanced',
      finisher: p1Rider.finisher || 'Finisher Attack',
      isCPU: !!matchConfig.p1IsCPU,
      difficulty: matchConfig.p1Difficulty || 'normal',
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
      videoFolder: p2Rider.videoFolder || `assets/videos/${p2Rider.id}/`,
      archetype: p2Rider.archetype || 'Heavy Power',
      finisher: p2Rider.finisher || 'Finisher Attack',
      isCPU: !!matchConfig.p2IsCPU,
      difficulty: matchConfig.p2Difficulty || 'normal',
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

    if (typeof window.updatePlayerHUD === 'function') {
      window.updatePlayerHUD('p1', window.gameState.p1);
      window.updatePlayerHUD('p2', window.gameState.p2);
    }

    if (typeof window.updateCharacterMedia === 'function') {
      window.updateCharacterMedia('p1', 'IDLE');
      window.updateCharacterMedia('p2', 'IDLE');
    }

    updateControlPanelsVisibility();
    launchRoundTimer();

    if (window.gameState.p1.isCPU && window.gameState.p2.isCPU) {
      setTimeout(() => {
        if (window.gameState.roundPhase === 'INPUT' && typeof window.executeTurnResolutionPhase === 'function') {
          window.executeTurnResolutionPhase();
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

/* --- EVENT BINDINGS --- */

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
          if (typeof window.triggerFloatingText === 'function') {
            window.triggerFloatingText('p1', 'TAP DIRECTION FIRST!', 'scratch');
          }
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
          if (typeof window.triggerFloatingText === 'function') {
            window.triggerFloatingText('p2', 'TAP DIRECTION FIRST!', 'scratch');
          }
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
      if (typeof window.triggerFloatingText === 'function') {
        window.triggerFloatingText('p2', 'TAP DIRECTION FIRST!', 'scratch');
      }
      return;
    }
    confirmPlayerAction(`${window.gameState.p2.chargeState.heldDir}+${act}`, 'p2');
  }
}

document.addEventListener('keydown', handleGameOverInput);
document.addEventListener('click', handleGameOverInput);
document.addEventListener('touchstart', handleGameOverInput, { passive: true });

// Global Exports
window.getMoveForPlayer = getMoveForPlayer;
window.simulateCPUButtonPress = simulateCPUButtonPress;
window.startRoundCountdown = startRoundCountdown;
window.launchRoundTimer = launchRoundTimer;
window.confirmPlayerAction = confirmPlayerAction;
window.getCPUAggressiveFallback = getCPUAggressiveFallback;
window.getCPUMoveChoice = getCPUMoveChoice;
window.startBattle = startBattle;
window.startPlayerCharge = startPlayerCharge;
window.freezePlayerChargeBar = freezePlayerChargeBar;
window.resetPlayerChargeBars = resetPlayerChargeBars;
window.resetRoundState = resetRoundState;

window.addEventListener('DOMContentLoaded', () => {
  bindKeyboardInputs();
  bindCommandButtons();
});/**
 * Match Lifecycle, Timers, Real-Time Charge Progress & Input Binding Manager
 * Path: js/match_manager.js
 */

var CHARGE_TIMES = CHARGE_TIMES || {
  'A': 1280,  // Defense
  'D': 2080,  // Offense
  'W': 3200,  // Air/Buffs
  'S': 4160   // Energy/Specials
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

/* --- CPU & INPUT HELPERS --- */

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

function updateControlPanelsVisibility() {
  const dualPanel = document.querySelector('.dual-controls-panel');
  const p1Panel = document.getElementById('p1-controls');
  const p2Panel = document.getElementById('p2-controls');

  const p1IsHuman = window.gameState.p1 && !window.gameState.p1.isCPU;
  const p2IsHuman = window.gameState.p2 && !window.gameState.p2.isCPU;

  // Outer container displays if AT LEAST ONE player is Human
  if (dualPanel) {
    if (p1IsHuman || p2IsHuman) {
      dualPanel.style.display = 'flex';
    } else {
      dualPanel.style.display = 'none'; // Only hide during CPU vs CPU simulation
    }
  }

  if (p1Panel) {
    p1Panel.hidden = !p1IsHuman;
    p1Panel.style.display = p1IsHuman ? 'flex' : 'none';
  }
  if (p2Panel) {
    p2Panel.hidden = !p2IsHuman;
    p2Panel.style.display = p2IsHuman ? 'flex' : 'none';
  }
}

function getMoveForPlayer(playerKey, moveKey) {
  if (moveKey === 'DO_NOTHING' || !moveKey) return DO_NOTHING_MOVE;
  const moves = playerKey === 'p1' ? window.gameState.p1Moves : window.gameState.p2Moves;
  return (moves && moves[moveKey]) || DO_NOTHING_MOVE;
}

/* --- CHARGE SYSTEM --- */

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

/* --- STATE RESET & LOCK-IN ENGINE --- */

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
      if (window.gameState.roundPhase === 'INPUT' && typeof window.executeTurnResolutionPhase === 'function') {
        window.executeTurnResolutionPhase();
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

  if (typeof updateHUD === 'function') updateHUD();
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

      if (typeof window.executeTurnResolutionPhase === 'function') {
        window.executeTurnResolutionPhase();
      }
    }
  }, 1000);
}

function launchRoundTimer() {
  window.gameState.roundPhase = 'INPUT';
  startRoundCountdown();
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

    if (typeof updateHUD === 'function') updateHUD();

    if (typeof window.updateCharacterMedia === 'function') {
      window.updateCharacterMedia('p1', 'IDLE');
      window.updateCharacterMedia('p2', 'IDLE');
    }

    updateControlPanelsVisibility();
    launchRoundTimer();

    if (window.gameState.p1.isCPU && window.gameState.p2.isCPU) {
      setTimeout(() => {
        if (window.gameState.roundPhase === 'INPUT' && typeof window.executeTurnResolutionPhase === 'function') {
          window.executeTurnResolutionPhase();
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

/* --- EVENT BINDINGS --- */

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
window.launchRoundTimer = launchRoundTimer;
window.confirmPlayerAction = confirmPlayerAction;
window.getCPUAggressiveFallback = getCPUAggressiveFallback;
window.getCPUMoveChoice = getCPUMoveChoice;
window.startBattle = startBattle;
window.startPlayerCharge = startPlayerCharge;
window.freezePlayerChargeBar = freezePlayerChargeBar;
window.resetPlayerChargeBars = resetPlayerChargeBars;
window.resetRoundState = resetRoundState;

// Add this line at the bottom of js/match_manager.js with the other window exports:
window.getMoveForPlayer = getMoveForPlayer;


window.addEventListener('DOMContentLoaded', () => {
  bindKeyboardInputs();
  bindCommandButtons();
});
