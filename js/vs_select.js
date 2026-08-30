/**
 * Character Selection Screen, BGM Manager & Match Simulation Controller
 * Path: js/vs_select.js
 */

// ==========================================================================
// 1. GLOBAL STATE & ROSTER INITIALIZATION
// ==========================================================================
window.selectionBGM = window.selectionBGM || null;
window.battleBGM = window.battleBGM || null;
window.currentVolume = typeof window.currentVolume === 'number' ? window.currentVolume : 0.5;

window.AVAILABLE_RIDERS = window.AVAILABLE_RIDERS || [
  { id: 'ichigo', name: 'Kamen Rider Ichigo', icon: 'assets/images/icons/ichigo.png', maxLp: 2300 },
  { id: 'nigo', name: 'Kamen Rider Nigo', icon: 'assets/images/icons/nigo.png', maxLp: 2500 },
  { id: 'v3', name: 'Kamen Rider V3', icon: 'assets/images/icons/v3.png', maxLp: 2400 }
];

window.vsSelectionState = window.vsSelectionState || {
  step: 1, // 1: Select P1, 2: Select P2, 3: Ready
  p1Index: 0,
  p1IsCPU: false,
  p1Difficulty: 'normal',
  p2Index: 1,
  p2IsCPU: true,
  p2Difficulty: 'normal'
};

// ==========================================================================
// 2. BGM AUDIO CONTROLLERS
// ==========================================================================
window.changeBGMVolume = function(val) {
  window.currentVolume = parseFloat(val);
  if (window.selectionBGM) window.selectionBGM.volume = window.currentVolume;
  if (window.battleBGM) window.battleBGM.volume = window.currentVolume;
};

window.playSelectionBGM = function() {
  if (window.selectionBGM) return;

  try {
    window.selectionBGM = new Audio('assets/sounds/matchup.mp3');
    window.selectionBGM.loop = true;
    window.selectionBGM.volume = window.currentVolume;

    const playPromise = window.selectionBGM.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        console.warn("Mobile autoplay restricted. BGM will unlock on first tap.");
      });
    }
  } catch (e) {
    console.warn("Audio load error:", e);
  }
};

window.stopSelectionBGM = function() {
  if (window.selectionBGM) {
    window.selectionBGM.pause();
    window.selectionBGM.currentTime = 0;
    window.selectionBGM = null;
  }
};

window.playBattleBGM = function() {
  if (window.battleBGM) return;

  try {
    window.battleBGM = new Audio('assets/sounds/matchup1.mp3');
    window.battleBGM.loop = true;
    window.battleBGM.volume = window.currentVolume;

    const playPromise = window.battleBGM.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }
  } catch (e) {
    console.warn("Audio load error:", e);
  }
};

window.stopBattleBGM = function() {
  if (window.battleBGM) {
    window.battleBGM.pause();
    window.battleBGM.currentTime = 0;
    window.battleBGM = null;
  }
};

// ==========================================================================
// 3. SELECTION NAVIGATION & BUTTON HANDLERS
// ==========================================================================
window.cycleRider = function(playerKey, direction) {
  const riders = window.AVAILABLE_RIDERS;
  const state = window.vsSelectionState;
  if (!riders || riders.length === 0) return;

  if (playerKey === 'p1' && state.step === 1) {
    state.p1Index = (state.p1Index + direction + riders.length) % riders.length;
  } else if (playerKey === 'p2' && state.step === 2) {
    state.p2Index = (state.p2Index + direction + riders.length) % riders.length;
  }
  window.updateSelectionUI();
};

window.toggleControlType = function(playerKey) {
  const errorBanner = document.getElementById('vs-error-banner');
  const state = window.vsSelectionState;

  if (playerKey === 'p1' && state.step === 1) {
    state.p1IsCPU = !state.p1IsCPU;
    if (errorBanner) errorBanner.hidden = true;
  } else if (playerKey === 'p2') {
    if (errorBanner) {
      errorBanner.textContent = 'PLAYER 2 IS LOCKED TO CPU CONTROL ONLY!';
      errorBanner.hidden = false;
    }
    return;
  }
  window.updateSelectionUI();
};

window.toggleDifficulty = function(playerKey) {
  const nextDiff = { 'easy': 'normal', 'normal': 'hard', 'hard': 'easy' };
  const state = window.vsSelectionState;

  if (playerKey === 'p1' && state.p1IsCPU && state.step === 1) {
    state.p1Difficulty = nextDiff[state.p1Difficulty] || 'normal';
  } else if (playerKey === 'p2' && state.step === 2) {
    state.p2Difficulty = nextDiff[state.p2Difficulty] || 'normal';
  }
  window.updateSelectionUI();
};

window.handleConfirmStep = function() {
  const errorBanner = document.getElementById('vs-error-banner');
  if (errorBanner) errorBanner.hidden = true;

  if (window.vsSelectionState.step === 1) {
    window.vsSelectionState.step = 2;
  } else if (window.vsSelectionState.step === 2) {
    window.vsSelectionState.step = 3;
  }
  window.updateSelectionUI();
};

window.handleBackStep = function() {
  const errorBanner = document.getElementById('vs-error-banner');
  if (errorBanner) errorBanner.hidden = true;

  if (window.vsSelectionState.step > 1) {
    window.vsSelectionState.step--;
  }
  window.updateSelectionUI();
};

window.updateSelectionUI = function() {
  const riders = window.AVAILABLE_RIDERS;
  const state = window.vsSelectionState;
  if (!riders || riders.length === 0) return;

  if (state.p1Index >= riders.length) state.p1Index = 0;
  if (state.p2Index >= riders.length) state.p2Index = 0;

  const p1 = riders[state.p1Index] || riders[0];
  const p2 = riders[state.p2Index] || riders[0];

  const p1ImgEl = document.getElementById('p1-img');
  if (p1ImgEl) p1ImgEl.src = p1.icon;
  
  const p1NameEl = document.getElementById('p1-name-display');
  if (p1NameEl) p1NameEl.textContent = p1.name;

  const p1TypeEl = document.getElementById('p1-type-display');
  if (p1TypeEl) p1TypeEl.textContent = state.p1IsCPU ? 'CPU' : 'HUMAN';

  const p1DiffDisplay = document.getElementById('p1-diff-display');
  if (p1DiffDisplay) {
    if (!state.p1IsCPU) {
      p1DiffDisplay.textContent = 'N/A';
      p1DiffDisplay.classList.remove('hard', 'easy');
    } else {
      p1DiffDisplay.textContent = state.p1Difficulty.toUpperCase();
      p1DiffDisplay.classList.toggle('hard', state.p1Difficulty === 'hard');
      p1DiffDisplay.classList.toggle('easy', state.p1Difficulty === 'easy');
    }
  }

  const p2ImgEl = document.getElementById('p2-img');
  if (p2ImgEl) {
    p2ImgEl.src = p2.icon;
    p2ImgEl.classList.toggle('p2-mirror-palette', p1.id === p2.id);
  }

  const p2NameEl = document.getElementById('p2-name-display');
  if (p2NameEl) p2NameEl.textContent = p2.name;

  const p2TypeEl = document.getElementById('p2-type-display');
  if (p2TypeEl) p2TypeEl.textContent = 'CPU';

  const p2DiffDisplay = document.getElementById('p2-diff-display');
  if (p2DiffDisplay) {
    p2DiffDisplay.textContent = state.p2Difficulty.toUpperCase();
    p2DiffDisplay.classList.toggle('hard', state.p2Difficulty === 'hard');
    p2DiffDisplay.classList.toggle('easy', state.p2Difficulty === 'easy');
  }

  const p1Card = document.getElementById('p1-card');
  const p2Card = document.getElementById('p2-card');
  const headerText = document.getElementById('select-step-title') || document.getElementById('vs-header-text');
  const confirmBtn = document.getElementById('confirm-btn');
  const startBtn = document.getElementById('start-game-btn');
  const backBtn = document.getElementById('back-btn');

  const p1LeftBtn = document.getElementById('p1-left-btn');
  const p1RightBtn = document.getElementById('p1-right-btn');
  const p2LeftBtn = document.getElementById('p2-left-btn');
  const p2RightBtn = document.getElementById('p2-right-btn');

  const simBtn = document.getElementById('btn-simulate-matches');

  if (state.step === 1) {
    if (headerText) headerText.textContent = 'STEP 1: SELECT PLAYER 1 RIDER';
    if (p1Card) p1Card.className = 'rider-card active-slot';
    if (p2Card) p2Card.className = 'rider-card locked-slot';

    if (p1LeftBtn) p1LeftBtn.disabled = false;
    if (p1RightBtn) p1RightBtn.disabled = false;
    if (p2LeftBtn) p2LeftBtn.disabled = true;
    if (p2RightBtn) p2RightBtn.disabled = true;

    if (confirmBtn) {
      confirmBtn.hidden = false;
      confirmBtn.textContent = 'CONFIRM P1';
      confirmBtn.disabled = false;
    }
    if (startBtn) startBtn.hidden = true;
    if (backBtn) backBtn.disabled = true;
    if (simBtn) simBtn.disabled = true;

  } else if (state.step === 2) {
    if (headerText) headerText.textContent = 'STEP 2: SELECT PLAYER 2 RIDER (CPU)';
    if (p1Card) p1Card.className = 'rider-card locked-slot';
    if (p2Card) p2Card.className = 'rider-card active-slot';

    if (p1LeftBtn) p1LeftBtn.disabled = true;
    if (p1RightBtn) p1RightBtn.disabled = true;
    if (p2LeftBtn) p2LeftBtn.disabled = false;
    if (p2RightBtn) p2RightBtn.disabled = false;

    if (confirmBtn) {
      confirmBtn.hidden = false;
      confirmBtn.textContent = 'CONFIRM P2';
      confirmBtn.disabled = false;
    }
    if (startBtn) startBtn.hidden = true;
    if (backBtn) backBtn.disabled = false;
    if (simBtn) simBtn.disabled = false;

  } else if (state.step === 3) {
    if (headerText) headerText.textContent = 'READY FOR BATTLE!';
    if (p1Card) p1Card.className = 'rider-card active-slot';
    if (p2Card) p2Card.className = 'rider-card active-slot';

    if (p1LeftBtn) p1LeftBtn.disabled = true;
    if (p1RightBtn) p1RightBtn.disabled = true;
    if (p2LeftBtn) p2LeftBtn.disabled = true;
    if (p2RightBtn) p2RightBtn.disabled = true;

    if (confirmBtn) confirmBtn.hidden = true;
    if (startBtn) {
      startBtn.hidden = false;
      startBtn.disabled = false;
    }
    if (backBtn) backBtn.disabled = false;
    if (simBtn) simBtn.disabled = false;
  }
};

// ==========================================================================
// 4. BATCH SIMULATOR & BATTLE LAUNCHERS
// ==========================================================================
window.handleSimulateMatches = function() {
  if (typeof window.runBatchSimulation !== 'function') {
    alert('Simulation engine (js/simulator.js) is not loaded!');
    return;
  }

  const riders = window.AVAILABLE_RIDERS;
  const state = window.vsSelectionState;
  const p1Rider = riders[state.p1Index] || riders[0];
  const p2Rider = riders[state.p2Index] || riders[0];

  const countSelect = document.getElementById('sim-count-select');
  const matchCount = countSelect ? parseInt(countSelect.value, 10) : 20;
  const difficulty = state.p2Difficulty || 'normal';

  const resultsBody = document.getElementById('sim-results-body');
  const modal = document.getElementById('sim-modal');

  if (resultsBody) {
    resultsBody.innerHTML = `<p class="sim-loading">SIMULATING ${matchCount} MATCHES... PLEASE WAIT...</p>`;
  }
  if (modal) modal.hidden = false;

  setTimeout(() => {
    const res = window.runBatchSimulation(p1Rider, p2Rider, matchCount, difficulty);

    if (resultsBody) {
      const overallWinner = res.p1Wins > res.p2Wins ? res.p1Name : (res.p2Wins > res.p1Wins ? res.p2Name : 'TIE MATCH');

      resultsBody.innerHTML = `
        <div class="sim-summary-header">
          <p class="sim-matchup-title"><strong>${res.p1Name}</strong> VS <strong>${res.p2Name}</strong></p>
          <p class="sim-winner-announce">OVERALL WINNER: <span class="highlight-winner">${overallWinner.toUpperCase()}</span></p>
        </div>
        <table class="sim-table">
          <thead>
            <tr>
              <th>STATISTIC</th>
              <th>${res.p1Name.toUpperCase()}</th>
              <th>${res.p2Name.toUpperCase()}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Victories (Win Rate)</td>
              <td><strong>${res.p1Wins}</strong> (${res.p1WinRate}%)</td>
              <td><strong>${res.p2Wins}</strong> (${res.p2WinRate}%)</td>
            </tr>
            <tr>
              <td>Avg. LP Remaining</td>
              <td>${res.p1AvgLpLeft} LP</td>
              <td>${res.p2AvgLpLeft} LP</td>
            </tr>
            <tr>
              <td>Avg. Chi Remaining</td>
              <td>${res.p1AvgChiLeft} / 16 Chi</td>
              <td>${res.p2AvgChiLeft} / 16 Chi</td>
            </tr>
            <tr>
              <td>Avg. Match Duration</td>
              <td colspan="2">${res.avgRounds} Rounds</td>
            </tr>
            <tr>
              <td>Draws / Double KO</td>
              <td colspan="2">${res.draws}</td>
            </tr>
          </tbody>
        </table>
      `;
    }
  }, 50);
};

window.validateAndStartMatch = function() {
  window.stopSelectionBGM();
  window.playBattleBGM();

  const selectScreen = document.getElementById('vs-select-screen');
  if (selectScreen) selectScreen.hidden = true;

  const riders = window.AVAILABLE_RIDERS;
  const state = window.vsSelectionState;

  const matchConfig = {
    p1Rider: riders[state.p1Index] || riders[0],
    p1IsCPU: state.p1IsCPU,
    p1Difficulty: state.p1IsCPU ? state.p1Difficulty : 'normal',
    p2Rider: riders[state.p2Index] || riders[0],
    p2IsCPU: true,
    p2Difficulty: state.p2Difficulty
  };

  if (typeof window.startBattle === 'function') {
    window.startBattle(matchConfig);
  }
};

// DOM Event Bindings
document.addEventListener('DOMContentLoaded', async () => {
  const selectScreen = document.getElementById('vs-select-screen');
  const battleScreen = document.getElementById('battle-screen');
  if (selectScreen) selectScreen.hidden = false;
  if (battleScreen) battleScreen.hidden = true;

  try {
    const res = await fetch('data/riders.json');
    if (res.ok) {
      const allRiders = await res.json();
      const activeRiders = allRiders.filter(r => r.active === true);
      if (activeRiders.length > 0) {
        window.AVAILABLE_RIDERS = activeRiders;
      }
    }
  } catch (err) {
    console.warn("Could not load riders.json, defaulting to fallback roster.");
  }

  window.updateSelectionUI();

  const simBtn = document.getElementById('btn-simulate-matches');
  if (simBtn) simBtn.addEventListener('click', window.handleSimulateMatches);

  const closeSimBtn = document.getElementById('btn-close-sim-modal');
  if (closeSimBtn) {
    closeSimBtn.addEventListener('click', () => {
      const modal = document.getElementById('sim-modal');
      if (modal) modal.hidden = true;
    });
  }

  const unlockAudio = () => {
    window.playSelectionBGM();
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };

  window.addEventListener('click', unlockAudio);
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio);
});
