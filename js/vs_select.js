/**
 * Character Selection, BGM Manager & Match Simulator Controller
 * Path: js/vs_select.js
 */

// BGM Audio Controllers
let selectionBGM = null;
let battleBGM = null;

function playSelectionBGM() {
  if (selectionBGM) return;

  try {
    selectionBGM = new Audio('assets/sounds/matchup.mp3');
    selectionBGM.loop = true;
    selectionBGM.volume = 0.5;

    const playPromise = selectionBGM.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        console.warn("Mobile autoplay restricted. BGM will unlock on first tap.");
      });
    }
  } catch (e) {
    console.warn("Audio load error:", e);
  }
}

function stopSelectionBGM() {
  if (selectionBGM) {
    selectionBGM.pause();
    selectionBGM.currentTime = 0;
    selectionBGM = null;
  }
}

function playBattleBGM() {
  if (battleBGM) return;

  try {
    battleBGM = new Audio('assets/sounds/matchup1.mp3');
    battleBGM.loop = true;
    battleBGM.volume = 0.5;

    const playPromise = battleBGM.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }
  } catch (e) {
    console.warn("Audio load error:", e);
  }
}

function stopBattleBGM() {
  if (battleBGM) {
    battleBGM.pause();
    battleBGM.currentTime = 0;
    battleBGM = null;
  }
}

// Fallback Roster Storage
let AVAILABLE_RIDERS = [
  { id: 'ichigo', name: 'Kamen Rider Ichigo', icon: 'assets/images/icons/ichigo.png', maxLp: 1850 },
  { id: 'nigo', name: 'Kamen Rider Nigo', icon: 'assets/images/icons/nigo.png', maxLp: 2000 },
  { id: 'v3', name: 'Kamen Rider V3', icon: 'assets/images/icons/v3.png', maxLp: 1950 }
];

let vsSelectionState = {
  step: 1, // 1: Select P1, 2: Select P2, 3: Ready
  p1Index: 0,
  p1IsCPU: false,
  p1Difficulty: 'normal',
  p2Index: 1,
  p2IsCPU: true,
  p2Difficulty: 'normal'
};

// Global Initialization, Mobile Audio Unlock & Simulation Bindings
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('data/riders.json');
    if (res.ok) {
      const allRiders = await res.json();
      const activeRiders = allRiders.filter(r => r.active === true);
      if (activeRiders.length > 0) {
        AVAILABLE_RIDERS = activeRiders;
      }
    }
  } catch (err) {
    console.warn("Could not load riders.json, defaulting to fallback roster.");
  }

  updateSelectionUI();

  // Bind Match Simulation Button
  const simBtn = document.getElementById('btn-simulate-matches');
  if (simBtn) {
    simBtn.addEventListener('click', handleSimulateMatches);
  }

  // Bind Simulation Modal Close Button
  const closeSimBtn = document.getElementById('btn-close-sim-modal');
  if (closeSimBtn) {
    closeSimBtn.addEventListener('click', () => {
      const modal = document.getElementById('sim-modal');
      if (modal) modal.hidden = true;
    });
  }

  // Bypass Mobile Autoplay Restrictions on First Touch
  const unlockAudio = () => {
    playSelectionBGM();
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };

  window.addEventListener('click', unlockAudio);
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio);
});

function cycleRider(playerKey, direction) {
  if (!AVAILABLE_RIDERS || AVAILABLE_RIDERS.length === 0) return;

  if (playerKey === 'p1' && vsSelectionState.step === 1) {
    vsSelectionState.p1Index = (vsSelectionState.p1Index + direction + AVAILABLE_RIDERS.length) % AVAILABLE_RIDERS.length;
  } else if (playerKey === 'p2' && vsSelectionState.step === 2) {
    vsSelectionState.p2Index = (vsSelectionState.p2Index + direction + AVAILABLE_RIDERS.length) % AVAILABLE_RIDERS.length;
  }
  updateSelectionUI();
}

function toggleControlType(playerKey) {
  const errorBanner = document.getElementById('vs-error-banner');

  if (playerKey === 'p1' && vsSelectionState.step === 1) {
    vsSelectionState.p1IsCPU = !vsSelectionState.p1IsCPU;
    if (errorBanner) errorBanner.hidden = true;
  } else if (playerKey === 'p2') {
    if (errorBanner) {
      errorBanner.textContent = 'PLAYER 2 IS LOCKED TO CPU CONTROL ONLY!';
      errorBanner.hidden = false;
    }
    return;
  }
  updateSelectionUI();
}

// TOGGLE DIFFICULTY ACROSS 3 STAGES: EASY -> NORMAL -> HARD -> EASY
function toggleDifficulty(playerKey) {
  const nextDiff = { 'easy': 'normal', 'normal': 'hard', 'hard': 'easy' };

  if (playerKey === 'p1' && vsSelectionState.p1IsCPU && vsSelectionState.step === 1) {
    vsSelectionState.p1Difficulty = nextDiff[vsSelectionState.p1Difficulty] || 'normal';
  } else if (playerKey === 'p2' && vsSelectionState.step === 2) {
    vsSelectionState.p2Difficulty = nextDiff[vsSelectionState.p2Difficulty] || 'normal';
  }
  updateSelectionUI();
}

function handleConfirmStep() {
  const errorBanner = document.getElementById('vs-error-banner');
  if (errorBanner) errorBanner.hidden = true;

  if (vsSelectionState.step === 1) {
    vsSelectionState.step = 2;
  } else if (vsSelectionState.step === 2) {
    vsSelectionState.step = 3;
  }
  updateSelectionUI();
}

function handleBackStep() {
  const errorBanner = document.getElementById('vs-error-banner');
  if (errorBanner) errorBanner.hidden = true;

  if (vsSelectionState.step > 1) {
    vsSelectionState.step--;
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  if (!AVAILABLE_RIDERS || AVAILABLE_RIDERS.length === 0) return;

  if (vsSelectionState.p1Index >= AVAILABLE_RIDERS.length) vsSelectionState.p1Index = 0;
  if (vsSelectionState.p2Index >= AVAILABLE_RIDERS.length) vsSelectionState.p2Index = 0;

  const p1 = AVAILABLE_RIDERS[vsSelectionState.p1Index] || AVAILABLE_RIDERS[0];
  const p2 = AVAILABLE_RIDERS[vsSelectionState.p2Index] || AVAILABLE_RIDERS[0];

  const p1ImgEl = document.getElementById('p1-img');
  if (p1ImgEl) p1ImgEl.src = p1.icon;
  
  const p1NameEl = document.getElementById('p1-name-display');
  if (p1NameEl) p1NameEl.textContent = p1.name;

  const p1TypeEl = document.getElementById('p1-type-display');
  if (p1TypeEl) p1TypeEl.textContent = vsSelectionState.p1IsCPU ? 'CPU' : 'HUMAN';

  const p1DiffDisplay = document.getElementById('p1-diff-display');
  if (p1DiffDisplay) {
    if (!vsSelectionState.p1IsCPU) {
      p1DiffDisplay.textContent = 'N/A';
      p1DiffDisplay.classList.remove('hard', 'easy');
    } else {
      p1DiffDisplay.textContent = vsSelectionState.p1Difficulty.toUpperCase();
      p1DiffDisplay.classList.toggle('hard', vsSelectionState.p1Difficulty === 'hard');
      p1DiffDisplay.classList.toggle('easy', vsSelectionState.p1Difficulty === 'easy');
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
    p2DiffDisplay.textContent = vsSelectionState.p2Difficulty.toUpperCase();
    p2DiffDisplay.classList.toggle('hard', vsSelectionState.p2Difficulty === 'hard');
    p2DiffDisplay.classList.toggle('easy', vsSelectionState.p2Difficulty === 'easy');
  }

  const p1Card = document.getElementById('p1-card');
  const p2Card = document.getElementById('p2-card');
  const headerText = document.getElementById('vs-header-text');
  const confirmBtn = document.getElementById('confirm-btn');
  const startBtn = document.getElementById('start-game-btn');
  const backBtn = document.getElementById('back-btn');

  const p1LeftBtn = document.getElementById('p1-left-btn');
  const p1RightBtn = document.getElementById('p1-right-btn');
  const p2LeftBtn = document.getElementById('p2-left-btn');
  const p2RightBtn = document.getElementById('p2-right-btn');

  const simBtn = document.getElementById('btn-simulate-matches');

  if (vsSelectionState.step === 1) {
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

  } else if (vsSelectionState.step === 2) {
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

  } else if (vsSelectionState.step === 3) {
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
}

// IN-BROWSER BATCH MATCH SIMULATION HANDLER
async function handleSimulateMatches() {
  if (typeof runBatchSimulation !== 'function') {
    alert('Simulation engine (js/simulator.js) is not loaded!');
    return;
  }

  const p1Rider = AVAILABLE_RIDERS[vsSelectionState.p1Index] || AVAILABLE_RIDERS[0];
  const p2Rider = AVAILABLE_RIDERS[vsSelectionState.p2Index] || AVAILABLE_RIDERS[0];

  const countSelect = document.getElementById('sim-count-select');
  const matchCount = countSelect ? parseInt(countSelect.value, 10) : 20;
  const difficulty = vsSelectionState.p2Difficulty || 'normal';

  const resultsBody = document.getElementById('sim-results-body');
  const modal = document.getElementById('sim-modal');

  if (resultsBody) {
    resultsBody.innerHTML = `<p class="sim-loading">SIMULATING ${matchCount} MATCHES... PLEASE WAIT...</p>`;
  }
  if (modal) modal.hidden = false;

  // Asynchronous execution wrapper to allow UI render
  setTimeout(async () => {
    try {
      const res = await runBatchSimulation(p1Rider, p2Rider, matchCount, difficulty);

      if (resultsBody) {
        const overallWinner = res.p1Wins > res.p2Wins ? res.p1Name : (res.p2Wins > res.p1Wins ? res.p2Name : 'TIE MATCH');

        resultsBody.innerHTML = `
          <div class="sim-summary-header">
            <p class="sim-matchup-title"><strong>${res.p1Name}</strong> VS <strong>${res.p2Name}</strong></p>
            <p class="sim-winner-announce">OVERALL WINNER: <span class="highlight-winner">${overallWinner.toUpperCase()}</span></p>
          </div>
          <table class="sim-table" style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <thead>
              <tr style="border-bottom: 1px solid #00ffcc;">
                <th style="padding: 8px; text-align: left;">STATISTIC</th>
                <th style="padding: 8px;">${res.p1Name.toUpperCase()}</th>
                <th style="padding: 8px;">${res.p2Name.toUpperCase()}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 6px; text-align: left;">Victories (Win Rate)</td>
                <td style="padding: 6px;"><strong>${res.p1Wins}</strong> (${res.p1WinRate}%)</td>
                <td style="padding: 6px;"><strong>${res.p2Wins}</strong> (${res.p2WinRate}%)</td>
              </tr>
              <tr>
                <td style="padding: 6px; text-align: left;">Avg. LP Remaining</td>
                <td style="padding: 6px;">${res.p1AvgLpLeft} LP</td>
                <td style="padding: 6px;">${res.p2AvgLpLeft} LP</td>
              </tr>
              <tr>
                <td style="padding: 6px; text-align: left;">Avg. Chi Remaining</td>
                <td style="padding: 6px;">${res.p1AvgChiLeft} / 16 Chi</td>
                <td style="padding: 6px;">${res.p2AvgChiLeft} / 16 Chi</td>
              </tr>
              <tr>
                <td style="padding: 6px; text-align: left;">Avg. Match Duration</td>
                <td colspan="2" style="padding: 6px;">${res.avgRounds} Rounds</td>
              </tr>
              <tr>
                <td style="padding: 6px; text-align: left;">Draws / Double KO</td>
                <td colspan="2" style="padding: 6px;">${res.draws}</td>
              </tr>
            </tbody>
          </table>
        `;
      }
    } catch (err) {
      console.error("Simulation Error:", err);
      if (resultsBody) {
        resultsBody.innerHTML = `<p style="color: #ff3366;">ERROR: ${err.message}</p>`;
      }
    }
  }, 50);
}

function validateAndStartMatch() {
  stopSelectionBGM();
  playBattleBGM();

  const selectScreen = document.getElementById('vs-select-screen');
  if (selectScreen) selectScreen.hidden = true;

  const matchConfig = {
    p1Rider: AVAILABLE_RIDERS[vsSelectionState.p1Index] || AVAILABLE_RIDERS[0],
    p1IsCPU: vsSelectionState.p1IsCPU,
    p1Difficulty: vsSelectionState.p1IsCPU ? vsSelectionState.p1Difficulty : 'normal',
    p2Rider: AVAILABLE_RIDERS[vsSelectionState.p2Index] || AVAILABLE_RIDERS[0],
    p2IsCPU: true,
    p2Difficulty: vsSelectionState.p2Difficulty
  };

  if (typeof startBattle === 'function') {
    startBattle(matchConfig);
  }
}

function changeBGMVolume(val) {
  const volume = parseFloat(val);
  if (selectionBGM) {
    selectionBGM.volume = volume;
  }
}
