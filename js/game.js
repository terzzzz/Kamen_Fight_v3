/**
 * media.js - Video & Animation Controller
 */

// IOS MOBILE VIDEO UNLOCKER
let mobileVideosUnlocked = false;

function unlockMobileVideos() {
  if (mobileVideosUnlocked) return;

  const vids = document.querySelectorAll('video');
  vids.forEach(v => {
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    
    const p = v.play();
    if (p !== undefined) {
      p.then(() => {
        v.pause();
      }).catch(() => {});
    }
  });

  mobileVideosUnlocked = true;
}

// ORIENTATION RESOLVER
function getTransformFlip(player, playerKey, moveObj = null) {
  if (!player) return 'scaleX(1)';

  const nativeFacing = (moveObj && moveObj.sourceFacing) 
    ? moveObj.sourceFacing 
    : (player.sourceFacing || (player.id === 'nigo' ? 'right' : 'left'));

  let shouldFlip = false;
  if (nativeFacing === 'left') {
    shouldFlip = (playerKey === 'p1');
  } else {
    shouldFlip = (playerKey === 'p2');
  }

  if (moveObj && moveObj.unmirrored) {
    shouldFlip = !shouldFlip;
  }

  return shouldFlip ? 'scaleX(-1)' : 'scaleX(1)';
}

// SAFE NON-BLOCKING PRELOADER
async function preloadRiderVideos(riderId, riderMoves = {}) {
  if (!riderId) return;

  if (!window.gameState) window.gameState = {};
  if (!window.gameState.videoCache) window.gameState.videoCache = {};

  const baseVideoFiles = [
    'idle.mp4', 'mid-air.mp4', 'faint.mp4', 'ko.mp4', 'victory.mp4', 'victory2.mp4',
    'hit.mp4', 'hit_physical.mp4', 'guard.mp4', 'windmill_guard.mp4', 'dodge.mp4'
  ];

  const moveVideos = Object.values(riderMoves || {})
    .filter(m => m && typeof m === 'object' && m.video)
    .map(m => m.video);

  const videoFiles = Array.from(new Set([...baseVideoFiles, ...moveVideos]));

  videoFiles.forEach(file => {
    const rawUrl = `assets/videos/${riderId}/${file}`;
    gameState.videoCache[rawUrl] = rawUrl;
  });
}

function playCenterVideo(playerKey, videoFile, actionName = '', maxDurationMs = null, moveObj = null) {
  return new Promise((resolve) => {
    unlockMobileVideos();

    const centerBox = document.getElementById('center-box');
    const centerVid = document.getElementById('center-video');
    const actionLabel = document.getElementById('center-action-label');
    if (!centerBox || !centerVid) {
      resolve();
      return;
    }

    const player = gameState ? gameState[playerKey] : null;
    if (!player) {
      resolve();
      return;
    }

    if (actionLabel) {
      const slotPrefix = playerKey.toUpperCase();
      actionLabel.textContent = actionName ? `[${slotPrefix}] ${player.name} : ${actionName}!` : '';
      actionLabel.hidden = !actionName;
    }

    const isMirrorMatch = gameState.p1 && gameState.p2 && (gameState.p1.id === gameState.p2.id);

    centerBox.hidden = false;
    centerVid.muted = true;
    centerVid.playsInline = true;
    centerVid.setAttribute('playsinline', '');
    centerVid.setAttribute('webkit-playsinline', '');

    centerVid.classList.toggle('p2-mirror-palette', playerKey === 'p2' && isMirrorMatch);
    centerVid.style.transform = getTransformFlip(player, playerKey, moveObj);

    let resolved = false;
    let fallbackTimer = null;

    const cleanUpAndResolve = () => {
      if (resolved) return;
      resolved = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);

      centerVid.removeEventListener('ended', cleanUpAndResolve);
      centerVid.removeEventListener('error', cleanUpAndResolve);
      centerVid.removeEventListener('loadedmetadata', onMetadata);

      centerBox.hidden = true;
      if (actionLabel) actionLabel.hidden = true;
      resolve();
    };

    const onMetadata = () => {
      if (resolved) return;
      if (centerVid.duration && !isNaN(centerVid.duration) && centerVid.duration > 0) {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        const durationMs = (centerVid.duration * 1000) + 300;
        const targetTimeout = maxDurationMs ? Math.max(durationMs, maxDurationMs) : durationMs;
        fallbackTimer = setTimeout(cleanUpAndResolve, targetTimeout);
      }
    };

    centerVid.addEventListener('ended', cleanUpAndResolve);
    centerVid.addEventListener('error', cleanUpAndResolve);
    centerVid.addEventListener('loadedmetadata', onMetadata);

    const riderId = player.id || 'ichigo';
    const rawUrl = `assets/videos/${riderId}/${videoFile}`;
    const videoUrl = (gameState.videoCache && gameState.videoCache[rawUrl]) || rawUrl;

    centerVid.src = videoUrl;
    centerVid.load();

    const playPromise = centerVid.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        setTimeout(cleanUpAndResolve, 1200);
      });
    }

    const initialTimeout = 2500;
    fallbackTimer = setTimeout(cleanUpAndResolve, initialTimeout);
  });
}

function hideCenterScreen() {
  const centerBox = document.getElementById('center-box');
  if (centerBox) centerBox.hidden = true;
}

function updateCharacterMedia(playerKey, stateType) {
  if (!gameState) return;
  const player = gameState[playerKey];
  if (!player) return;

  const videoEl = document.getElementById(`${playerKey}-video`);
  const spriteEl = document.getElementById(`${playerKey}-sprite`);
  if (!videoEl) return;

  let fileName = stateType;

  if (stateType === 'IDLE') {
    if (player.isFainted) {
      fileName = 'faint.mp4';
    } else if (player.airborneTicks > 0) {
      fileName = 'mid-air.mp4';
    } else {
      fileName = 'idle.mp4';
    }
  } else if (stateType === 'VICTORY' || stateType === 'victory') {
    fileName = Math.random() < 0.5 ? 'victory.mp4' : 'victory2.mp4';
  } else if (stateType === 'KO' || stateType === 'ko') {
    fileName = 'ko.mp4';
  }

  if (!fileName.endsWith('.mp4') && !fileName.endsWith('.webm')) {
    fileName += '.mp4';
  }

  const moves = playerKey === 'p1' ? gameState.p1Moves : gameState.p2Moves;
  const currentMove = moves ? Object.values(moves).find(m => m && m.video === fileName) : null;

  videoEl.style.transform = getTransformFlip(player, playerKey, currentMove);

  const isMirrorMatch = gameState.p1 && gameState.p2 && (gameState.p1.id === gameState.p2.id);

  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.setAttribute('playsinline', '');
  videoEl.setAttribute('webkit-playsinline', '');

  videoEl.classList.toggle('p2-mirror-palette', playerKey === 'p2' && isMirrorMatch);

  const isLoopingState = ['idle.mp4', 'mid-air.mp4', 'faint.mp4'].includes(fileName);
  videoEl.loop = isLoopingState;

  const riderId = player.id || 'ichigo';
  const rawUrl = `assets/videos/${riderId}/${fileName}`;
  const videoUrl = (gameState.videoCache && gameState.videoCache[rawUrl]) || rawUrl;

  if (videoEl.dataset.currentFile !== videoUrl) {
    videoEl.dataset.currentFile = videoUrl;
    videoEl.src = videoUrl;
    videoEl.load();
    const playPromise = videoEl.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }
  } else if (videoEl.paused && isLoopingState && !videoEl.ended) {
    videoEl.play().catch(() => {});
  }

  if (spriteEl) spriteEl.hidden = true;
  videoEl.hidden = false;
}

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

let gameState = {
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

  ['p1', 'p2'].forEach(slot => {
    const player = gameState[slot];
    if (player) {
      player.willBeFaintedNextRound = false;
      if (player.faintMeter < (window.COMBAT_RULES || COMBAT_RULES).FAINT_THRESHOLD) {
        player.isFainted = false;
        const stunOverlay = document.getElementById(`${slot}-stun-overlay`);
        if (stunOverlay) stunOverlay.hidden = true;
      }
    }
  });
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
  if (!gameState.input) gameState.input = {};
  gameState.input.acceptingInputs = false;
  gameState.input.isConfirmed = false;
  gameState.input.selectedMoveKey = null;
  gameState.input.lockInTime = 0;
  gameState.p2IsConfirmed = false;
  gameState.p2SelectedMoveKey = null;
  gameState.p2LockInTime = 0;

  if (gameState.p1) delete gameState.p1.activeChargePercent;
  if (gameState.p2) delete gameState.p2.activeChargePercent;

  const flag1El = document.getElementById('p1-action-flag');
  if (flag1El) flag1El.hidden = true;

  const flag2El = document.getElementById('p2-action-flag');
  if (flag2El) flag2El.hidden = true;
}

function startRoundCountdown() {
  gameState.roundPhase = 'INPUT';
  resetTurnInputState();

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
    if (humanControlPanel) humanControlPanel.style.display = 'flex';
    if (chargeStatusEl) chargeStatusEl.style.display = 'block';
  }

  setTimeout(() => {
    if (gameState.input) gameState.input.acceptingInputs = true;
  }, 300);

  ['p1', 'p2'].forEach(slot => {
    const player = gameState[slot];
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

  if (gameState.p1 && gameState.p1.isFainted && !gameState.p1.isCPU) {
    confirmPlayerAction('DO_NOTHING', 'p1');
  }
  if (gameState.p2 && gameState.p2.isFainted && !gameState.p2.isCPU) {
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

  // CPU Thinking Logic
  ['p1', 'p2'].forEach(slot => {
    const player = gameState[slot];
    if (player && player.isCPU && !player.isFainted) {
      if (slot === 'p2' && gameState.p2AlwaysIdle) return;

      const thinkTime = Math.floor(Math.random() * 2000 + 2500);
      setTimeout(() => {
        if (gameState.roundPhase !== 'INPUT' || (slot === 'p1' ? gameState.input.isConfirmed : gameState.p2IsConfirmed)) return;
        const oppSlot = slot === 'p1' ? 'p2' : 'p1';
        const moveKey = getCPUMoveChoice(player, gameState[oppSlot], slot);
        
        if (player.activeChargePercent === undefined) {
          player.activeChargePercent = 100;
        }
        confirmPlayerAction(moveKey, slot);
      }, thinkTime);
    }
  });

  // Countdown timer interval
  gameState.timerInterval = setInterval(() => {
    if (gameState.roundPhase !== 'INPUT') return;

    gameState.turnTimerSeconds--;
    if (timerEl) timerEl.textContent = `TIME: ${gameState.turnTimerSeconds}s`;

    if (gameState.turnTimerSeconds <= 0) {
      clearInterval(gameState.timerInterval);

      if (!gameState.input.isConfirmed) {
        if (gameState.p1.isCPU) {
          const mk = getCPUMoveChoice(gameState.p1, gameState.p2, 'p1');
          if (gameState.p1.activeChargePercent === undefined) gameState.p1.activeChargePercent = 85;
          confirmPlayerAction(mk, 'p1');
        } else {
          gameState.input.isConfirmed = true;
          gameState.input.selectedMoveKey = 'DO_NOTHING';
          gameState.p1.activeChargePercent = 100;
        }
      }

      if (!gameState.p2IsConfirmed) {
        if (gameState.p2.isCPU && !gameState.p2AlwaysIdle) {
          let mk = getCPUMoveChoice(gameState.p2, gameState.p1, 'p2');

          if (gameState.input.selectedMoveKey && gameState.input.selectedMoveKey.startsWith('A+') && mk.startsWith('A+')) {
            mk = 'D+J';
          }

          if (gameState.p2.activeChargePercent === undefined) gameState.p2.activeChargePercent = 85;
          confirmPlayerAction(mk, 'p2');
        } else {
          gameState.p2IsConfirmed = true;
          gameState.p2SelectedMoveKey = 'DO_NOTHING';
          gameState.p2.activeChargePercent = 100;
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

  if (playerKey === 'p1' && !gameState.input.isConfirmed) {
    gameState.input.isConfirmed = true;
    gameState.input.selectedMoveKey = moveKey;
    gameState.input.lockInTime = gameState.turnTimerSeconds;
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
    const isOtherConfirmed = otherKey === 'p1' ? gameState.input.isConfirmed : gameState.p2IsConfirmed;

    if (otherPlayer && !otherPlayer.isFainted && !isOtherConfirmed && !(otherKey === 'p2' && gameState.p2AlwaysIdle)) {
      if (otherPlayer.isCPU) {
        const reactionDelay = Math.floor(Math.random() * 500 + 300);
        setTimeout(() => {
          if (gameState.roundPhase !== 'INPUT') return;
          const stillConfirmed = otherKey === 'p1' ? gameState.input.isConfirmed : gameState.p2IsConfirmed;
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

  const p1Ready = gameState.input.isConfirmed || (gameState.p1 && gameState.p1.isFainted);
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
  const handleContinue = () => {
    if (typeof unlockMobileVideos === 'function') unlockMobileVideos();
    if (gameState.roundPhase === 'GAME_OVER' && gameState.canContinueFromGameOver) {
      if (typeof returnToCharSelect === 'function') returnToCharSelect();
    }
  };

  window.addEventListener('keydown', (e) => {
    if (typeof unlockMobileVideos === 'function') unlockMobileVideos();

    if (gameState.roundPhase === 'GAME_OVER') {
      handleContinue();
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

    if (gameState.roundPhase !== 'INPUT' || !gameState.input || !gameState.input.acceptingInputs || gameState.p1.isCPU || gameState.input.isConfirmed || gameState.p1.isFainted) return;

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

  window.addEventListener('click', handleContinue);
  window.addEventListener('touchstart', handleContinue, { passive: true });
}

window.startRoundCountdown = startRoundCountdown;
window.confirmPlayerAction = confirmPlayerAction;

window.addEventListener('DOMContentLoaded', () => {
  bindKeyboardInputs();
  bindCommandButtons();
  
  document.addEventListener('touchstart', unlockMobileVideos, { once: true });
  document.addEventListener('click', unlockMobileVideos, { once: true });
});
