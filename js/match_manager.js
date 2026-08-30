/**
 * Match Manager, Real-Time Input & Round Countdown Controller
 * Path: js/match_manager.js
 */

function updateChargeProgress() {
  if (!window.gameState || !window.gameState.input || !window.gameState.input.heldDirection || window.gameState.roundPhase !== 'INPUT') return;

  const duration = (window.CHARGE_TIMES && window.CHARGE_TIMES[window.gameState.input.heldDirection]) || 2000;
  const elapsed = Date.now() - window.gameState.input.chargeStartTime;
  window.gameState.input.currentPercent = Math.min(100, Math.floor((elapsed / duration) * 100));

  const fillEl = document.getElementById('p1-charge-fill') || document.getElementById('charge-fill');
  if (fillEl) {
    fillEl.style.width = `${window.gameState.input.currentPercent}%`;
    fillEl.textContent = `${window.gameState.input.currentPercent}%`;
  }

  const statusEl = document.getElementById('charge-status-display') || document.getElementById('charge-status');
  if (statusEl) {
    statusEl.textContent = `CHARGING [${window.gameState.input.heldDirection}]: ${window.gameState.input.currentPercent}%`;
    statusEl.style.color = window.gameState.input.currentPercent >= 100 ? '#00ffcc' : '#ffcc00';
  }
}

function resetTurnInputState() {
  if (window.gameState.input) {
    if (window.gameState.input.chargeInterval) clearInterval(window.gameState.input.chargeInterval);
    window.gameState.input.acceptingInputs = false;
    window.gameState.input.heldDirection = null;
    window.gameState.input.currentPercent = 0;
    window.gameState.input.isConfirmed = false;
    window.gameState.input.selectedMoveKey = null;
  }

  window.gameState.p1IsConfirmed = false;
  window.gameState.p2IsConfirmed = false;
  window.gameState.p1SelectedMoveKey = null;
  window.gameState.p2SelectedMoveKey = null;

  ['W', 'A', 'S', 'D'].forEach(dir => {
    const keyEl = document.getElementById(`key-${dir}`);
    if (keyEl) keyEl.classList.remove('active');
  });

  const fillEl = document.getElementById('p1-charge-fill') || document.getElementById('charge-fill');
  if (fillEl) {
    fillEl.style.width = '0%';
    fillEl.textContent = '0%';
  }

  const flag1El = document.getElementById('p1-action-flag');
  if (flag1El) flag1El.hidden = true;

  const flag2El = document.getElementById('p2-action-flag');
  if (flag2El) flag2El.hidden = true;
}

function unlockMobileVideos() {
  document.querySelectorAll('video').forEach(vid => {
    vid.muted = true;
    vid.setAttribute('playsinline', '');
    vid.setAttribute('webkit-playsinline', '');
    const p = vid.play();
    if (p !== undefined) p.catch(() => {});
  });
}

function startRoundCountdown() {
  window.gameState.roundPhase = 'INPUT';
  resetTurnInputState();

  if (window.gameState.roundCounter > 1) {
    ['p1', 'p2'].forEach(slot => {
      const player = window.gameState[slot];
      if (player) player.chi = Math.min(player.maxChi || 16, player.chi + 1);
    });
  }

  const humanControlPanel = document.getElementById('human-control-panel') || document.getElementById('p1-controls');
  if (humanControlPanel) {
    humanControlPanel.style.display = (window.gameState.p1?.isCPU && window.gameState.p2?.isCPU) ? 'none' : 'flex';
  }

  setTimeout(() => {
    if (window.gameState.input) window.gameState.input.acceptingInputs = true;
  }, 300);

  // Fail-safe HUD & Media execution
  try {
    if (typeof window.updatePlayerHUD === 'function') {
      window.updatePlayerHUD('p1', window.gameState.p1);
      window.updatePlayerHUD('p2', window.gameState.p2);
    }
  } catch (e) {
    console.warn("HUD error caught:", e);
  }

  try {
    if (typeof window.updateCharacterMedia === 'function') {
      window.updateCharacterMedia('p1', 'IDLE');
      window.updateCharacterMedia('p2', 'IDLE');
    }
  } catch (e) {
    console.warn("Media error caught:", e);
  }

  const battleMsg = document.getElementById('battle-message');
  if (battleMsg) {
    battleMsg.hidden = false;
    battleMsg.textContent = `ROUND ${window.gameState.roundCounter}: READY!`;
    setTimeout(() => { if (window.gameState.roundPhase === 'INPUT') battleMsg.hidden = true; }, 1200);
  }

  if (window.gameState.timerInterval) clearInterval(window.gameState.timerInterval);
  window.gameState.turnTimerSeconds = 8;

  const timerEl = document.getElementById('turn-timer');
  if (timerEl) timerEl.textContent = `TIME: ${window.gameState.turnTimerSeconds}s`;

  // Guaranteed Turn Countdown Loop
  window.gameState.timerInterval = setInterval(() => {
    if (window.gameState.roundPhase !== 'INPUT') return;

    window.gameState.turnTimerSeconds--;
    if (timerEl) timerEl.textContent = `TIME: ${window.gameState.turnTimerSeconds}s`;

    if (window.gameState.turnTimerSeconds <= 0) {
      clearInterval(window.gameState.timerInterval);

      if (!window.gameState.input.isConfirmed) confirmPlayerAction('DO_NOTHING', 'p1');
      if (!window.gameState.p2IsConfirmed) confirmPlayerAction('DO_NOTHING', 'p2');
    }
  }, 1000);

  // CPU AI Decision Trigger
  ['p1', 'p2'].forEach(slot => {
    const player = window.gameState[slot];
    if (player && player.isCPU && !player.isFainted) {
      if (slot === 'p2' && window.gameState.p2AlwaysIdle) return;
      const thinkTime = Math.floor(Math.random() * 1200 + 800);

      setTimeout(() => {
        if (window.gameState.roundPhase !== 'INPUT') return;
        const isConfirmed = slot === 'p1' ? window.gameState.input.isConfirmed : window.gameState.p2IsConfirmed;
        if (isConfirmed) return;

        const oppSlot = slot === 'p1' ? 'p2' : 'p1';
        const oppPlayer = window.gameState[oppSlot];
        const movesData = slot === 'p1' ? window.gameState.p1Moves : window.gameState.p2Moves;

        let chosenKey = 'D+J';
        try {
          if (typeof window.selectCPUMove === 'function') {
            chosenKey = window.selectCPUMove(player, oppPlayer, movesData, player.difficulty || 'normal');
          } else if (typeof window.getCPUMoveChoice === 'function') {
            chosenKey = window.getCPUMoveChoice(player, oppPlayer, slot);
          }
        } catch (err) {
          console.warn("CPU Move Decision Exception:", err);
        }

        confirmPlayerAction(chosenKey, slot);
      }, thinkTime);
    }
  });
}

function launchRoundTimer() {
  window.gameState.roundPhase = 'INPUT';
  startRoundCountdown();
}

function confirmPlayerAction(moveKey, playerKey = 'p1') {
  unlockMobileVideos();

  const player = window.gameState[playerKey];
  if (!player) return false;

  if (playerKey === 'p1' && !window.gameState.input.isConfirmed) {
    if (window.gameState.input.chargeInterval) clearInterval(window.gameState.input.chargeInterval);
    window.gameState.input.isConfirmed = true;
    window.gameState.input.selectedMoveKey = moveKey;
    window.gameState.p1IsConfirmed = true;
    window.gameState.p1SelectedMoveKey = moveKey;
    window.gameState.p1.activeChargePercent = moveKey === 'DO_NOTHING' ? 100 : (window.gameState.input.currentPercent || 100);

    const flagEl = document.getElementById('p1-action-flag');
    if (flagEl) {
      flagEl.hidden = false;
      flagEl.textContent = moveKey === 'DO_NOTHING' ? 'IDLE' : 'LOCKED!';
    }
  } else if (playerKey === 'p2' && !window.gameState.p2IsConfirmed) {
    window.gameState.p2IsConfirmed = true;
    window.gameState.p2SelectedMoveKey = moveKey;
    window.gameState.p2.activeChargePercent = 100;

    const flagEl = document.getElementById('p2-action-flag');
    if (flagEl) {
      flagEl.hidden = false;
      flagEl.textContent = moveKey === 'DO_NOTHING' ? 'IDLE' : 'LOCKED!';
    }
  }

  if (window.gameState.input.isConfirmed && window.gameState.p2IsConfirmed && window.gameState.roundPhase === 'INPUT') {
    if (window.gameState.timerInterval) clearInterval(window.gameState.timerInterval);
    window.gameState.roundPhase = 'RESOLUTION';

    setTimeout(() => {
      if (typeof window.executeTurnResolutionPhase === 'function') {
        window.executeTurnResolutionPhase();
      }
    }, 200);
  }
  return true;
}

function bindKeyboardInputs() {
  window.addEventListener('keydown', (e) => {
    unlockMobileVideos();

    if (window.gameState.roundPhase === 'GAME_OVER' && window.gameState.canContinueFromGameOver) {
      if (typeof window.returnToCharSelect === 'function') window.returnToCharSelect();
      return;
    }

    const key = e.key ? e.key.toUpperCase() : '';

    if (window.gameState.roundPhase !== 'INPUT' || !window.gameState.input || !window.gameState.input.acceptingInputs || window.gameState.input.isConfirmed) return;

    if (['A', 'D', 'W', 'S'].includes(key)) {
      if (window.gameState.input.heldDirection !== key) {
        if (window.gameState.input.chargeInterval) clearInterval(window.gameState.input.chargeInterval);

        ['W', 'A', 'S', 'D'].forEach(dir => {
          const keyEl = document.getElementById(`key-${dir}`);
          if (keyEl) keyEl.classList.remove('active');
        });

        window.gameState.input.heldDirection = key;
        window.gameState.input.chargeStartTime = Date.now();
        window.gameState.input.currentPercent = 0;
        window.gameState.input.chargeInterval = setInterval(updateChargeProgress, 30);

        const actKeyEl = document.getElementById(`key-${key}`);
        if (actKeyEl) actKeyEl.classList.add('active');
      }
    }

    if (['J', 'K', 'L', 'I'].includes(key)) {
      if (window.gameState.input.heldDirection) {
        confirmPlayerAction(`${window.gameState.input.heldDirection}+${key}`, 'p1');
      }
    }
  });
}

function bindCommandButtons() {
  const buttons = document.querySelectorAll('.pad-btn');
  buttons.forEach(btn => {
    const key = btn.id.replace('key-', '').replace('p1-key-', '');

    const handlePressDown = (e) => {
      e.preventDefault();
      unlockMobileVideos();

      btn.classList.add('active');
      setTimeout(() => btn.classList.remove('active'), 200);

      if (['W', 'A', 'S', 'D'].includes(key)) {
        window.gameState.input.heldDirection = key;
        if (window.gameState.input.chargeInterval) clearInterval(window.gameState.input.chargeInterval);
        window.gameState.input.chargeStartTime = Date.now();
        window.gameState.input.currentPercent = 0;
        window.gameState.input.chargeInterval = setInterval(updateChargeProgress, 30);
      } else if (['I', 'J', 'K', 'L'].includes(key)) {
        if (window.gameState.input.heldDirection) {
          confirmPlayerAction(`${window.gameState.input.heldDirection}+${key}`, 'p1');
        }
      }
    };

    btn.onmousedown = handlePressDown;
    btn.addEventListener('touchstart', handlePressDown, { passive: false });
  });
}

window.unlockMobileVideos = unlockMobileVideos;
window.startRoundCountdown = startRoundCountdown;
window.launchRoundTimer = launchRoundTimer;
window.confirmPlayerAction = confirmPlayerAction;

window.addEventListener('DOMContentLoaded', () => {
  bindKeyboardInputs();
  bindCommandButtons();
});
