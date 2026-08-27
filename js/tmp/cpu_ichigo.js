/**
 * Kamen Rider Ichigo AI Decision Engine
 * Path: js/cpu_ichigo.js
 * 3-Turn Foresee Engine Integration
 */

function selectIchigoCPUMove(cpuPlayer, opponentPlayer, movesData, difficulty = 'normal') {
  if (!movesData || Object.keys(movesData).length === 0) return 'D+J';

  const rules = window.COMBAT_RULES || {
    FAINT_THRESHOLD: 100,
    FAINT_PENALTY_CHI_GUARD: 15,
    FAINT_PENALTY_STANDARD_GUARD: 25
  };

  const timing = getMatchTimingConfig();
  let cpuThinkingDelay = 0.4 + (Math.random() * 0.4);

  let humanLockedLate = (typeof gameState !== 'undefined' && gameState.input && gameState.input.isConfirmed &&
    (gameState.input.lockInTime > timing.lateThreshold || gameState.timeExtended));

  let bonusExtensionTime = humanLockedLate ? timing.extensionBonus : 0.0;
  let availableChargeTime = Math.max(0, (timing.baseRoundWindow + bonusExtensionTime) - cpuThinkingDelay);
  let maxAchievableCharge = Math.min(100, Math.floor((availableChargeTime / timing.chargeTimeRequired) * 100));

  const affordableKeys = Object.keys(movesData).filter(key => {
    const m = movesData[key];
    return m && typeof m === 'object' && (m.chiCost || 0) <= cpuPlayer.chi;
  });

  if (affordableKeys.length === 0) return 'D+J';

  // 1. FAINTED OPPONENT DIRECT PUNISH OVERRIDE
  if (opponentPlayer.isFainted) {
    let bestPunishKey = 'D+J';
    let maxDmg = -1;
    affordableKeys.forEach(k => {
      const dmg = movesData[k] ? (movesData[k].baseDamage || 0) : 0;
      if (dmg > maxDmg) { maxDmg = dmg; bestPunishKey = k; }
    });
    setIchigoChargeTarget(cpuPlayer, bestPunishKey, maxAchievableCharge, difficulty);
    return bestPunishKey;
  }

  let selectedMoveKey = 'D+J';

  // 2. EASY DIFFICULTY: RANDOM CHOICE
  if (difficulty === 'easy') {
    selectedMoveKey = affordableKeys[Math.floor(Math.random() * affordableKeys.length)];
  } 
  // 3. HARD & NORMAL DIFFICULTY
  else {
    const oppMovesData = getOpponentMovesData(opponentPlayer);
    const opponentMoveKey = gameState.p1SelectedMoveKey || (gameState.input ? gameState.input.selectedMoveKey : null);
    const isOpponentLocked = !!(gameState.input && gameState.input.isConfirmed);

    let guardChosen = false;

    // REACTIVE GUARDING VS CONFIRMED ATTACKS
    if (difficulty === 'hard' && opponentMoveKey && !opponentMoveKey.startsWith('A+') && opponentMoveKey !== 'DO_NOTHING') {
      const oppButton = opponentMoveKey.split('+')[1];
      const isOpponentSpecial = opponentMoveKey.startsWith('S');
      const isOpponentPhysical = opponentMoveKey.startsWith('D');

      const cpuWindmillFaintRisk = (cpuPlayer.faintMeter || 0) >= (rules.FAINT_THRESHOLD - rules.FAINT_PENALTY_CHI_GUARD);
      const cpuStandardGuardRisk = (cpuPlayer.faintMeter || 0) >= (rules.FAINT_THRESHOLD - rules.FAINT_PENALTY_STANDARD_GUARD);

      if (isOpponentSpecial) {
        const windmillMove = movesData['A+I'];
        if (windmillMove && cpuPlayer.chi >= (windmillMove.chiCost || 0) && !cpuWindmillFaintRisk && Math.random() < 0.65) {
          selectedMoveKey = 'A+I';
          guardChosen = true;
        } else if (oppButton && movesData[`A+${oppButton}`] && !cpuStandardGuardRisk && Math.random() < 0.50) {
          selectedMoveKey = `A+${oppButton}`;
          guardChosen = true;
        }
      } else if (isOpponentPhysical && oppButton && movesData[`A+${oppButton}`] && !cpuStandardGuardRisk) {
        const isLowLp = (cpuPlayer.lp / (cpuPlayer.maxLp || 1850)) <= 0.25;
        if (isLowLp && Math.random() < 0.70) {
          selectedMoveKey = `A+${oppButton}`;
          guardChosen = true;
        }
      }
    }

    // FORESEE LOOKAHEAD SEARCH
    if (!guardChosen) {
      if (window.ForeseeEngine) {
        // Exclude 0-damage setup moves in Normal mode so turn 1 isn't wasted
        let searchMoves = movesData;
        if (difficulty === 'normal') {
          searchMoves = {};
          Object.keys(movesData).forEach(k => {
            if (!k.startsWith('W') || (movesData[k].baseDamage || 0) > 0) {
              searchMoves[k] = movesData[k];
            }
          });
        }

        selectedMoveKey = window.ForeseeEngine.run3TurnForeseeSearch(
          cpuPlayer, opponentPlayer, searchMoves, oppMovesData, {
            maxDepth: difficulty === 'hard' ? 3 : 2,
            useExpectimax: difficulty === 'normal',
            characterWeights: { W_LP: 1.0, W_CHI: 45.0, W_FAINT: 3.5 },
            isOpponentLocked: isOpponentLocked,
            lockedOpponentMoveKey: opponentMoveKey
          }
        );
      } else {
        selectedMoveKey = affordableKeys[Math.floor(Math.random() * affordableKeys.length)];
      }
    }
  }

  setIchigoChargeTarget(cpuPlayer, selectedMoveKey, maxAchievableCharge, difficulty);
  return selectedMoveKey;
}

function setIchigoChargeTarget(cpuPlayer, moveKey, maxAchievableCharge, difficulty) {
  let desiredCharge = 100;

  if (difficulty === 'hard') {
    desiredCharge = 98 + Math.floor(Math.random() * 3);
  } else if (moveKey.startsWith('A+')) {
    desiredCharge = 15;
  } else if (moveKey.startsWith('D')) {
    desiredCharge = 88 + Math.floor(Math.random() * 8);
  }

  cpuPlayer.activeChargePercent = Math.min(desiredCharge, maxAchievableCharge);
}

if (typeof window !== 'undefined') {
  window.selectIchigoCPUMove = selectIchigoCPUMove;
}
