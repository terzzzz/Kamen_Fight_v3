/**
 * Battle HUD Renderer, Dynamic Meter Thresholds, Damage Popups & UI Simulation Manager
 * Path: js/ui.js
 */

var AVAILABLE_RIDERS = window.AVAILABLE_RIDERS || [
  { id: 'ichigo', name: 'Kamen Rider Ichigo', icon: 'assets/images/icons/ichigo.png', maxLp: 2300 },
  { id: 'nigo', name: 'Kamen Rider Nigo', icon: 'assets/images/icons/nigo.png', maxLp: 2500 },
  { id: 'v3', name: 'Kamen Rider V3', icon: 'assets/images/icons/v3.png', maxLp: 2400 },
  { id: 'riderman', name: 'Riderman', icon: 'assets/images/icons/riderman.png', maxLp: 2350 }
];

/**
 * Refreshes player LP, Faint, and Chi meters during combat.
 * Dynamic Chi Colors & Thresholds:
 * - Chi < 5  => Red styling + "LOW POWER (DEF -25%)" tag
 * - Chi > 14 => Gold styling + "FULL POWER (ATK/ACC +20%)" tag
 * - Normal   => P1 Cyan (#00ffcc) vs P2 Blue (#00bfff)
 */
function updatePlayerHUD(slotKey, playerObj) {
  if (!playerObj) return;

  const isP1 = slotKey === 'p1';

  const nameEl = document.getElementById(isP1 ? 'p1-name' : 'p2-name');
  const lpEl = document.getElementById(isP1 ? 'p1-lp' : 'p2-lp');
  const chiEl = document.getElementById(isP1 ? 'p1-chi' : 'p2-chi');
  const chiBarFillEl = document.getElementById(isP1 ? 'p1-chi-bar-fill' : 'p2-chi-bar-fill');
  const faintFillEl = document.getElementById(isP1 ? 'p1-faint-fill' : 'p2-faint-fill');
  const buffTrayEl = document.getElementById(isP1 ? 'p1-buff-tray' : 'p2-buff-tray');

  // 1. Name & LP Display
  if (nameEl) nameEl.textContent = playerObj.name || (isP1 ? 'Player 1' : 'Player 2');
  if (lpEl) lpEl.textContent = `LP: ${playerObj.lp} / ${playerObj.maxLp}`;

  // 2. Faint Meter Fill Height
  if (faintFillEl) {
    const faintPct = Math.min(100, Math.max(0, playerObj.faintMeter || 0));
    faintFillEl.style.height = `${faintPct}%`;
  }

  // 3. Chi Figure & Bar Threshold Styling (Explicit color resets)
  const chi = playerObj.chi || 0;
  const maxChi = playerObj.maxChi || 16;
  if (chiEl) chiEl.textContent = `CHI: ${chi} / ${maxChi}`;

  if (chiBarFillEl) {
    const chiPct = Math.min(100, Math.max(0, (chi / maxChi) * 100));
    chiBarFillEl.style.width = `${chiPct}%`;
  }

  const normalColor = isP1 ? '#00ffcc' : '#00bfff'; // P1 Cyan vs P2 Blue

  if (chi < 5) {
    if (chiEl) {
      chiEl.className = 'stat-value-styled chi-text-low';
      chiEl.style.color = '#ff3333';
    }
    if (chiBarFillEl) {
      chiBarFillEl.className = 'chi-bar-fill chi-bar-low';
      chiBarFillEl.style.background = '#ff3333';
    }
  } else if (chi > 14) {
    if (chiEl) {
      chiEl.className = 'stat-value-styled chi-text-full';
      chiEl.style.color = '#ffcc00';
    }
    if (chiBarFillEl) {
      chiBarFillEl.className = 'chi-bar-fill chi-bar-full';
      chiBarFillEl.style.background = '#ffcc00';
    }
  } else {
    if (chiEl) {
      chiEl.className = 'stat-value-styled';
      chiEl.style.color = normalColor;
    }
    if (chiBarFillEl) {
      chiBarFillEl.className = 'chi-bar-fill';
      chiBarFillEl.style.background = normalColor;
    }
  }

  // 4. Buff Tray Injection (Active Buffs + Low/Full Power Status Badges)
  let activeTags = [];

  if (playerObj.activeBuffs && Array.isArray(playerObj.activeBuffs)) {
    activeTags = [...playerObj.activeBuffs];
  }

  if (chi < 5) {
    activeTags.push({
      id: 'low_power_tag',
      label: 'LOW POWER (DEF -25%)',
      type: 'debuff-low-power'
    });
  } else if (chi > 14) {
    activeTags.push({
      id: 'full_power_tag',
      label: 'FULL POWER (ATK/ACC +20%)',
      type: 'buff-full-power'
    });
  }

  if (buffTrayEl) {
    buffTrayEl.innerHTML = activeTags.map(tag => `
      <span class="buff-tag ${tag.type || ''}">${tag.label}</span>
    `).join('');
  }
}

function showDamagePopup(boxId, text, type = 'damage') {
  const box = document.getElementById(boxId);
  if (!box) return;

  const popup = document.createElement('div');
  popup.className = `damage-popup ${type}`;
  popup.textContent = text;

  box.appendChild(popup);

  setTimeout(() => {
    if (popup && popup.parentNode) {
      popup.parentNode.removeChild(popup);
    }
  }, 2500);
}

function showBattleBanner(message) {
  const banner = document.getElementById('battle-message');
  if (!banner) return;
  banner.textContent = message;
  banner.hidden = !message;
}

function showActionBanner(message) {
  const subBanner = document.getElementById('center-action-label');
  if (!subBanner) return;
  subBanner.textContent = message;
  subBanner.hidden = !message;
}

/**
 * Triggers batch simulation and updates the simulation modal.
 */
function handleSimulateMatches() {
  if (typeof runBatchSimulation !== 'function') {
    alert('Simulation engine (js/simulator.js) is not loaded!');
    return;
  }

  const selectionState = window.vsSelectionState || { p1Index: 0, p2Index: 0, p2Difficulty: 'normal' };
  const p1Rider = AVAILABLE_RIDERS[selectionState.p1Index] || AVAILABLE_RIDERS[0];
  const p2Rider = AVAILABLE_RIDERS[selectionState.p2Index] || AVAILABLE_RIDERS[0];

  const countSelect = document.getElementById('sim-count-select');
  const matchCount = countSelect ? parseInt(countSelect.value, 10) : 20;
  const difficulty = selectionState.p2Difficulty || 'normal';

  const resultsBody = document.getElementById('sim-results-body');
  const modal = document.getElementById('sim-modal');

  if (resultsBody) {
    resultsBody.innerHTML = `<p class="sim-loading" style="color: #00ffcc; text-align: center; font-family: monospace;">SIMULATING ${matchCount} MATCHES... PLEASE WAIT...</p>`;
  }
  if (modal) modal.hidden = false;

  setTimeout(() => {
    try {
      const res = runBatchSimulation(p1Rider, p2Rider, matchCount, difficulty);

      if (resultsBody) {
        const overallWinner = res.p1Wins > res.p2Wins ? res.p1Name : (res.p2Wins > res.p1Wins ? res.p2Name : 'TIE MATCH');

        resultsBody.innerHTML = `
          <div class="sim-summary-header" style="text-align: center; margin-bottom: 15px; font-family: monospace;">
            <p class="sim-matchup-title" style="font-size: 1.1rem; color: #fff;">
              <strong style="color: #00ffcc;">${res.p1Name} (${difficulty.toUpperCase()})</strong> VS <strong style="color: #ffaa00;">${res.p2Name} (${difficulty.toUpperCase()})</strong>
            </p>
            <p class="sim-winner-announce" style="font-size: 1.2rem; color: #00ffcc; font-weight: bold; margin-top: 5px;">
              OVERALL WINNER: <span style="color: #ffcc00;">${overallWinner.toUpperCase()}</span>
            </p>
          </div>
          <table class="sim-table" style="width: 100%; border-collapse: collapse; font-family: monospace; font-size: 14px; text-align: left;">
            <thead>
              <tr style="border-bottom: 2px solid #00ffcc; color: #00ffcc;">
                <th style="padding: 8px;">STATISTIC</th>
                <th style="padding: 8px; text-align: center;">${res.p1Name.toUpperCase()}</th>
                <th style="padding: 8px; text-align: center;">${res.p2Name.toUpperCase()}</th>
              </tr>
            </thead>
            <tbody style="color: #fff;">
              <tr style="border-bottom: 1px solid #333;">
                <td style="padding: 8px;">Victories (Win Rate)</td>
                <td style="padding: 8px; text-align: center;"><strong>${res.p1Wins}</strong> (${res.p1WinRate}%)</td>
                <td style="padding: 8px; text-align: center;"><strong>${res.p2Wins}</strong> (${res.p2WinRate}%)</td>
              </tr>
              <tr style="border-bottom: 1px solid #333;">
                <td style="padding: 8px;">Avg. LP Remaining</td>
                <td style="padding: 8px; text-align: center;">${res.p1AvgLpLeft} LP</td>
                <td style="padding: 8px; text-align: center;">${res.p2AvgLpLeft} LP</td>
              </tr>
              <tr style="border-bottom: 1px solid #333;">
                <td style="padding: 8px;">Avg. Chi Remaining</td>
                <td style="padding: 8px; text-align: center;">${res.p1AvgChiLeft} / 16 Chi</td>
                <td style="padding: 8px; text-align: center;">${res.p2AvgChiLeft} / 16 Chi</td>
              </tr>
              <tr style="border-bottom: 1px solid #333;">
                <td style="padding: 8px;">Avg. Match Duration</td>
                <td colspan="2" style="padding: 8px; text-align: center; color: #ffaa00;">${res.avgRounds} Rounds</td>
              </tr>
              <tr>
                <td style="padding: 8px;">Draws / Double KO</td>
                <td colspan="2" style="padding: 8px; text-align: center;">${res.draws}</td>
              </tr>
            </tbody>
          </table>
        `;
      }
    } catch (err) {
      console.error("Simulation execution error:", err);
      if (resultsBody) {
        resultsBody.innerHTML = `<p style="color: #ff2a5f; text-align: center; font-family: monospace;">SIMULATION ERROR: ${err.message}</p>`;
      }
    }
  }, 50);
}

/* Event Binding Initialization */
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('btn-close-sim-modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const modal = document.getElementById('sim-modal');
      if (modal) modal.hidden = true;
    });
  }

  const simBtn = document.getElementById('btn-simulate-matches');
  if (simBtn) {
    simBtn.addEventListener('click', handleSimulateMatches);
  }
});

// Global Exports
window.AVAILABLE_RIDERS = AVAILABLE_RIDERS;
window.updatePlayerHUD = updatePlayerHUD;
window.showDamagePopup = showDamagePopup;
window.showBattleBanner = showBattleBanner;
window.showActionBanner = showActionBanner;
window.handleSimulateMatches = handleSimulateMatches;
