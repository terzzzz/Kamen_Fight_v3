/**
 * Combat Engine & Turn Resolution Manager
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
  HARD_CPU_HP_MULTIPLIER: 1.30
};

var CHARGE_TIMES = window.CHARGE_TIMES || {
  'A': 1280,  // Defense
  'D': 2080,  // Offense
  'W': 3200,  // Air/Buffs
  'S': 4160   // Energy/Specials
};

var DO_NOTHING_MOVE = window.DO_NOTHING_MOVE || {
  name: "Do Nothing",
  type: "IDLE",
  chiCost: 0,
  baseDamage: 0,
  hitChance: 100,
  video: "idle.mp4"
};

var FALLBACK_ICHIGO_MOVES = window.FALLBACK_ICHIGO_MOVES || {
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
    p2SelectedMoveKey: null,
    p2LockInTime: 0,
    p2IsConfirmed: false,
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

function getMoveForPlayer(playerKey, moveKey) {
  if (moveKey === 'DO_NOTHING' || !moveKey) return DO_NOTHING_MOVE;
  const moves = playerKey === 'p1' ? window.gameState.p1Moves : window.gameState.p2Moves;
  return (moves && moves[moveKey]) || DO_NOTHING_MOVE;
}

function launchRoundTimer() {
  window.gameState.roundPhase = 'INPUT';
  startRoundCountdown();
}

function resetTurnInputState() {
  if (typeof resetCharge === 'function') resetCharge();
  if (!window.gameState.input) window.gameState.input = {};
  window.gameState.input.acceptingInputs = false;
  window.gameState.input.isConfirmed = false;
  window.gameState.input.selectedMoveKey = null;
  window.gameState.input.lockInTime = 0;
  window.gameState.p2IsConfirmed = false;
  window.gameState.p2SelectedMoveKey = null;
  window.gameState.p2LockInTime = 0;

  if (window.gameState.p1) delete window.gameState.p1.activeChargePercent;
  if (window.gameState.p2) delete window.gameState.p2.activeChargePercent;

  const flag1El = document.getElementById('p1-action-flag');
  if (flag1El) flag1El.hidden = true;

  const flag2El = document.getElementById('p2-action-flag');
  if (flag2El) flag2El.hidden = true;
}

function startRoundCountdown() {
  window.gameState.roundPhase = 'INPUT';
  resetTurnInputState();

  if (window.gameState.roundCounter > 1) {
    ['p1', 'p2'].forEach(slot => {
      const player = window.gameState[slot];
      if (player) {
        const maxChi = player.maxChi || 16;
        player.chi = Math.min(maxChi, player.chi + 1);
      }
    });
  }

  const humanControlPanel = document.getElementById('human-control-panel') || document.querySelector('.bottom-controls') || document.getElementById('p1-controls');
  const chargeStatusEl = document.getElementById('charge-status-display') || document.getElementById('charge-status');
  const p1ChargeFill = document.getElementById('p1-charge-fill') || document.getElementById('charge-fill');

  if (window.gameState.p1 && window.gameState.p1.isCPU && window.gameState.p2 && window.gameState.p2.isCPU) {
    if (humanControlPanel) humanControlPanel.style.display = 'none';
    if (chargeStatusEl) chargeStatusEl.style.display = 'none';
    if (p1ChargeFill) {
      p1ChargeFill.style.width = '0%';
      p1ChargeFill.textContent = '';
    }
  } else {
    if (humanControlPanel) humanControlPanel.style.display = 'flex';
    if (chargeStatusEl) chargeStatusEl.style.display = 'block';
  }

  setTimeout(() => {
    if (window.gameState.input) window.gameState.input.acceptingInputs = true;
  }, 300);

  ['p1', 'p2'].forEach(slot => {
    const player = window.gameState[slot];
    if (!player) return;

    if (player.willBeFaintedNextRound) {
      player.isFainted = true;
      player.willBeFaintedNextRound = false;
      player.faintMeter = 0;
    } else {
      player.isFainted = false;
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

  if (typeof updatePlayerHUD === 'function') {
    updatePlayerHUD('p1', window.gameState.p1);
    updatePlayerHUD('p2', window.gameState.p2);
  }

  if (typeof window.hideCenterScreen === 'function') window.hideCenterScreen();
  if (typeof window.updateCharacterMedia === 'function') {
    window.updateCharacterMedia('p1', 'IDLE');
    window.updateCharacterMedia('p2', 'IDLE');
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

  window.gameState.timerInterval = setInterval(() => {
    if (window.gameState.roundPhase !== 'INPUT') return;

    window.gameState.turnTimerSeconds--;
    if (timerEl) timerEl.textContent = `TIME: ${window.gameState.turnTimerSeconds}s`;

    if (window.gameState.turnTimerSeconds <= 0) {
      clearInterval(window.gameState.timerInterval);

      if (!window.gameState.input.isConfirmed) {
        window.gameState.input.isConfirmed = true;
        window.gameState.input.selectedMoveKey = 'DO_NOTHING';
        window.gameState.p1.activeChargePercent = 100;
      }

      if (!window.gameState.p2IsConfirmed) {
        window.gameState.p2IsConfirmed = true;
        window.gameState.p2SelectedMoveKey = 'DO_NOTHING';
        window.gameState.p2.activeChargePercent = 100;
      }

      if (typeof window.executeTurnResolutionPhase === 'function') {
        window.executeTurnResolutionPhase();
      }
    }
  }, 1000);
}

function resetCharge() {
  if (window.gameState && window.gameState.input) {
    if (window.gameState.input.chargeInterval) clearInterval(window.gameState.input.chargeInterval);
    window.gameState.input.heldDirection = null;
    window.gameState.input.currentPercent = 0;
  }

  ['W', 'A', 'S', 'D'].forEach(dir => {
    const keyEl = document.getElementById(`key-${dir}`);
    if (keyEl) keyEl.classList.remove('active');
  });

  const fillEl = document.getElementById('p1-charge-fill') || document.getElementById('charge-fill');
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

function confirmPlayerAction(moveKey, playerKey = 'p1') {
  if (typeof window.unlockMobileVideos === 'function') window.unlockMobileVideos();

  const player = window.gameState[playerKey];
  if (!player) return false;

  const move = getMoveForPlayer(playerKey, moveKey);

  if (moveKey !== 'DO_NOTHING') {
    const chiCost = move.chiCost || 0;
    if (player.chi < chiCost) {
      if (typeof showDamagePopup === 'function') {
        showDamagePopup(`${playerKey}-box`, 'NOT ENOUGH CHI!', 'miss');
      }
      return false;
    }
  }

  if (playerKey === 'p1' && !window.gameState.input.isConfirmed) {
    window.gameState.input.isConfirmed = true;
    window.gameState.input.selectedMoveKey = moveKey;
    window.gameState.input.lockInTime = window.gameState.turnTimerSeconds;
    
    const flagEl = document.getElementById('p1-action-flag');
    if (flagEl) {
      flagEl.hidden = false;
      flagEl.textContent = 'LOCKED!';
    }
  } else if (playerKey === 'p2' && !window.gameState.p2IsConfirmed) {
    window.gameState.p2IsConfirmed = true;
    window.gameState.p2SelectedMoveKey = moveKey;
    window.gameState.p2LockInTime = window.gameState.turnTimerSeconds;

    const flagEl = document.getElementById('p2-action-flag');
    if (flagEl) {
      flagEl.hidden = false;
      flagEl.textContent = 'LOCKED!';
    }
  }

  if (window.gameState.input.isConfirmed && window.gameState.p2IsConfirmed) {
    if (window.gameState.timerInterval) clearInterval(window.gameState.timerInterval);
    if (typeof window.executeTurnResolutionPhase === 'function') {
      window.executeTurnResolutionPhase();
    }
  }

  return true;
}

function bindCommandButtons() {
  const buttons = document.querySelectorAll('.pad-btn');
  buttons.forEach(btn => {
    const key = btn.id.replace('key-', '');

    const handlePressDown = (e) => {
      e.preventDefault();
      if (typeof window.unlockMobileVideos === 'function') window.unlockMobileVideos();

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
    if (typeof window.unlockMobileVideos === 'function') window.unlockMobileVideos();

    const key = e.key ? e.key.toUpperCase() : '';

    if (window.gameState.roundPhase !== 'INPUT' || !window.gameState.input || !window.gameState.input.acceptingInputs || window.gameState.input.isConfirmed) return;

    if (['A', 'D', 'W', 'S'].includes(key)) {
      window.gameState.input.heldDirection = key;
    }

    if (['J', 'K', 'L', 'I'].includes(key)) {
      if (window.gameState.input.heldDirection) {
        confirmPlayerAction(`${window.gameState.input.heldDirection}+${key}`, 'p1');
      }
    }
  });
}

window.getMoveRangePriority = getMoveRangePriority;
window.getFaintDamageForMove = getFaintDamageForMove;
window.getMoveForPlayer = getMoveForPlayer;
window.launchRoundTimer = launchRoundTimer;
window.startRoundCountdown = startRoundCountdown;
window.resetCharge = resetCharge;
window.confirmPlayerAction = confirmPlayerAction;

window.addEventListener('DOMContentLoaded', () => {
  bindKeyboardInputs();
  bindCommandButtons();
});
