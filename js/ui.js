/**
 * Battle HUD Renderer, Dynamic Meter Thresholds & Damage Popups Manager
 * Path: js/ui.js
 */

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

// Global Exports
window.updatePlayerHUD = updatePlayerHUD;
window.showDamagePopup = showDamagePopup;
window.showBattleBanner = showBattleBanner;
window.showActionBanner = showActionBanner;
