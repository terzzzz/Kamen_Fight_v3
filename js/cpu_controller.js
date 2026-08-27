/**
 * Universal CPU AI Controller
 * Path: js/cpu_controller.js
 * Replaces all individual rider CPU files.
 */

function selectCPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty = 'normal') {
  if (!availableMoves || Object.keys(availableMoves).length === 0) return 'D+J';

  const moveKeys = Object.keys(availableMoves);
  const oppMovesData = getOpponentMovesData(opponentPlayer);
  const isOpponentLocked = !!(gameState.input && gameState.input.isConfirmed);
  const oppMoveKey = gameState.input ? gameState.input.selectedMoveKey : null;

  // 1. LOAD RIDER AI PROFILE (FALLBACK TO DEFAULT WEIGHTS)
  const profiles = window.RIDER_AI_PROFILES || {};
  const profile = profiles[cpuPlayer.id] || {
    weights: { W_LP: 1.0, W_CHI: 45.0, W_FAINT: 3.0 },
    dChargeRange: [85, 95]
  };

  const timing = getMatchTimingConfig();
  let cpuThinkingDelay = 0.4 + (Math.random() * 0.4);
  let humanLockedLate = (typeof gameState !== 'undefined' && gameState.input && gameState.input.isConfirmed &&
    (gameState.input.lockInTime > timing.lateThreshold || gameState.timeExtended));
  let bonusExtensionTime = humanLockedLate ? timing.extensionBonus : 0.0;
  let availableChargeTime = Math.max(0, (timing.baseRoundWindow + bonusExtensionTime) - cpuThinkingDelay);
  let maxAchievableCharge = Math.min(100, Math.floor((availableChargeTime / timing.chargeTimeRequired) * 100));

  // 2. UNIVERSAL FAINT PUNISH OVERRIDE
  if (opponentPlayer.isFainted) {
    let bestPunishKey = 'D+J';
    let maxDmg = -1;
    moveKeys.forEach(k => {
      const dmg = availableMoves[k] ? (availableMoves[k].baseDamage || 0) : 0;
      if (dmg > maxDmg) { maxDmg = dmg; bestPunishKey = k; }
    });
    setUniversalChargeTarget(cpuPlayer, bestPunishKey, maxAchievableCharge, difficulty, profile);
    return bestPunishKey;
  }

  // 3. EASY DIFFICULTY: RANDOM SELECTION
  if (difficulty === 'easy') {
    const key = moveKeys[Math.floor(Math.random() * moveKeys.length)];
    setUniversalChargeTarget(cpuPlayer, key, maxAchievableCharge, difficulty, profile);
    return key;
  }

  // 4. HARD DIFFICULTY: REACTIVE GUARDING VS LOCKED ATTACKS
  let selectedMoveKey = 'D+J';
  let guardChosen = false;

  if (difficulty === 'hard' && oppMoveKey && !oppMoveKey.startsWith('A+') && oppMoveKey !== 'DO_NOTHING') {
    const rules = window.COMBAT_RULES || { FAINT_THRESHOLD: 100, FAINT_PENALTY_CHI_GUARD: 15, FAINT_PENALTY_STANDARD_GUARD: 25 };
    const oppButton = oppMoveKey.split('+')[1];
    const isOpponentSpecial = oppMoveKey.startsWith('S');
    const cpuWindmillFaintRisk = (cpuPlayer.faintMeter || 0) >= (rules.FAINT_THRESHOLD - rules.FAINT_PENALTY_CHI_GUARD);
    const cpuStandardGuardRisk = (cpuPlayer.faintMeter || 0) >= (rules.FAINT_THRESHOLD - rules.FAINT_PENALTY_STANDARD_GUARD);

    if (isOpponentSpecial) {
      const windmillMove = availableMoves['A+I'];
      if (windmillMove && cpuPlayer.chi >= (windmillMove.chiCost || 0) && !cpuWindmillFaintRisk && Math.random() < 0.65) {
        selectedMoveKey = 'A+I';
        guardChosen = true;
      } else if (oppButton && availableMoves[`A+${oppButton}`] && !cpuStandardGuardRisk && Math.random() < 0.50) {
        selectedMoveKey = `A+${oppButton}`;
        guardChosen = true;
      }
    }
  }

  // 5. FORESEE ENGINE LOOKAHEAD SEARCH
  if (!guardChosen) {
    if (window.ForeseeEngine) {
      let searchMoves = availableMoves;

      // Filter out 0-damage setup moves in Normal mode
      if (difficulty === 'normal') {
        searchMoves = {};
        Object.keys(availableMoves).forEach(k => {
          if (!k.startsWith('W') || (availableMoves[k].baseDamage || 0) > 0) {
            searchMoves[k] = availableMoves[k];
          }
        });
      }

      selectedMoveKey = window.ForeseeEngine.run3TurnForeseeSearch(
        cpuPlayer, opponentPlayer, searchMoves, oppMovesData, {
          maxDepth: difficulty === 'hard' ? 3 : 2,
          useExpectimax: difficulty === 'normal',
          characterWeights: profile.weights,
          isOpponentLocked: isOpponentLocked,
          lockedOpponentMoveKey: oppMoveKey
        }
      );
    } else {
      selectedMoveKey = moveKeys[Math.floor(Math.random() * moveKeys.length)];
    }
  }

  setUniversalChargeTarget(cpuPlayer, selectedMoveKey, maxAchievableCharge, difficulty, profile);
  return selectedMoveKey;
}

/**
 * Universal Charge Target Tuning
 */
function setUniversalChargeTarget(cpuPlayer, moveKey, maxAchievableCharge, difficulty, profile) {
  let target = 100;

  if (difficulty === 'hard') {
    target = 98 + Math.floor(Math.random() * 3);
  } else if (moveKey.startsWith('A+')) {
    target = 15;
  } else if (moveKey.startsWith('D')) {
    const range = profile.dChargeRange || [85, 95];
    target = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
  }

  cpuPlayer.activeChargePercent = Math.min(target, maxAchievableCharge);
}

if (typeof window !== 'undefined') {
  window.selectCPUMove = selectCPUMove;
}
