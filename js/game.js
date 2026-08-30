/**
 * Core Game Orchestrator, Match Initialization & Lifecycle Controller
 * Path: js/game.js
 */

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

/**
 * Initializes and launches a new match given a selection configuration object.
 * @param {Object} matchConfig - Contains p1Rider, p2Rider, p1IsCPU, p2IsCPU, p1Difficulty, p2Difficulty
 */
async function startBattle(matchConfig) {
  if (!window.gameState) window.gameState = {};
  window.gameState.matchConfig = matchConfig || {};
  if (!window.gameState.videoCache) window.gameState.videoCache = {};

  const transitionScreen = document.getElementById('match-transition-screen');
  const splashNames = document.getElementById('splash-names-text');
  const splashRound = document.getElementById('splash-round-text');
  const selectScreen = document.getElementById('vs-select-screen');
  const battleScreen = document.getElementById('battle-screen');

  if (selectScreen) selectScreen.hidden = true;
  if (splashNames) {
    const p1Title = matchConfig.p1Rider?.name || 'P1';
    const p2Title = matchConfig.p2Rider?.name || 'P2';
    splashNames.textContent = `${p1Title.toUpperCase()} VS ${p2Title.toUpperCase()}`;
  }
  if (splashRound) splashRound.textContent = "GET READY FOR THE FIGHT!";
  if (transitionScreen) transitionScreen.hidden = false;

  // Load Move Sets
  const p1Id = matchConfig.p1Rider?.id || 'ichigo';
  const p2Id = matchConfig.p2Rider?.id || 'nigo';

  const fallbackMoves = window.FALLBACK_ICHIGO_MOVES || {};
  window.gameState.p1Moves = fallbackMoves;
  window.gameState.p2Moves = fallbackMoves;

  try {
    const res = await fetch('data/moves.json');
    if (res.ok) {
      const allMoves = await res.json();
      if (allMoves) {
        window.gameState.p1Moves = allMoves[p1Id] || fallbackMoves;
        window.gameState.p2Moves = allMoves[p2Id] || fallbackMoves;
      }
    }
  } catch (err) {
    console.warn("Could not load data/moves.json, using fallback move set.");
  }

  // Initialize Players
  const rules = window.COMBAT_RULES || { STARTING_CHI: 8, MAX_CHI: 16 };
  const config = window.GAME_CONFIG || { HARD_CPU_HP_MULTIPLIER: 1.10 };
  const hpMult = config.HARD_CPU_HP_MULTIPLIER || 1.10;

  let p1MaxLp = matchConfig.p1Rider?.maxLp || 2300;
  if (matchConfig.p1IsCPU && matchConfig.p1Difficulty === 'hard') {
    p1MaxLp = Math.floor(p1MaxLp * hpMult);
  }

  let p2MaxLp = matchConfig.p2Rider?.maxLp || 2500;
  if (matchConfig.p2IsCPU && matchConfig.p2Difficulty === 'hard') {
    p2MaxLp = Math.floor(p2MaxLp * hpMult);
  }

  window.gameState.p1 = {
    id: p1Id,
    name: matchConfig.p1Rider?.name || 'Kamen Rider Ichigo',
    isCPU: !!matchConfig.p1IsCPU,
    difficulty: matchConfig.p1Difficulty || 'normal',
    maxLp: p1MaxLp,
    lp: p1MaxLp,
    chi: rules.STARTING_CHI || 8,
    maxChi: rules.MAX_CHI || 16,
    faintMeter: 0,
    activeBuffs: [],
    isFainted: false,
    willBeFaintedNextRound: false
  };

  window.gameState.p2 = {
    id: p2Id,
    name: matchConfig.p2Rider?.name || 'Kamen Rider Nigo',
    isCPU: !!matchConfig.p2IsCPU,
    difficulty: matchConfig.p2Difficulty || 'normal',
    maxLp: p2MaxLp,
    lp: p2MaxLp,
    chi: rules.STARTING_CHI || 8,
    maxChi: rules.MAX_CHI || 16,
    faintMeter: 0,
    activeBuffs: [],
    isFainted: false,
    willBeFaintedNextRound: false
  };

  window.gameState.roundCounter = 1;

  if (typeof window.preloadRiderVideos === 'function') {
    try {
      window.preloadRiderVideos(p1Id, window.gameState.p1Moves);
      window.preloadRiderVideos(p2Id, window.gameState.p2Moves);
    } catch (e) {
      console.warn("Video preloader error:", e);
    }
  }

  setTimeout(() => {
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

    if (typeof window.launchRoundTimer === 'function') {
      window.launchRoundTimer();
    }
  }, 1000);
}

function returnToCharSelect() {
  if (window.gameState) {
    window.gameState.roundPhase = 'IDLE';
    window.gameState.canContinueFromGameOver = false;
    if (window.gameState.timerInterval) {
      clearInterval(window.gameState.timerInterval);
    }
  }

  if (typeof window.stopBattleBGM === 'function') window.stopBattleBGM();
  if (typeof window.playSelectionBGM === 'function') window.playSelectionBGM();

  const battleScreen = document.getElementById('battle-screen');
  const selectScreen = document.getElementById('vs-select-screen');
  const battleMsg = document.getElementById('battle-message');
  const actionMsg = document.getElementById('center-action-label');

  if (battleScreen) battleScreen.hidden = true;
  if (battleMsg) battleMsg.hidden = true;
  if (actionMsg) actionMsg.hidden = true;
  if (selectScreen) selectScreen.hidden = false;

  if (window.vsSelectionState) {
    window.vsSelectionState.step = 1;
    if (typeof window.updateSelectionUI === 'function') {
      window.updateSelectionUI();
    }
  }

  document.querySelectorAll('.damage-popup').forEach(el => el.remove());
}

// Global Exports
window.startBattle = startBattle;
window.returnToCharSelect = returnToCharSelect;
window.returnToSelectScreen = returnToCharSelect;
