/**
 * Kamen Rider Nigo CPU Decision Engine (Heavy Power Brawler)
 * Path: js/cpu_nigo.js
 * 3-Turn Foresee Engine Integration
 */

function selectNigoCPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty = 'normal') {
  if (!availableMoves || Object.keys(availableMoves).length === 0) return 'D+J';

  const moveKeys = Object.keys(availableMoves);
  const oppMovesData = getOpponentMovesData(opponentPlayer);
  const isOpponentLocked = !!(gameState.input && gameState.input.isConfirmed);
  const oppMoveKey = gameState.input ? gameState.input.selectedMoveKey : null;

  // 1. EASY DIFFICULTY: RANDOM SELECTION
  if (difficulty === 'easy') {
    const key = moveKeys[Math.floor(Math.random() * moveKeys.length)];
    setNigoChargeTarget(cpuPlayer, key, opponentPlayer, difficulty);
    return key;
  }

  // 2. FAINTED OPPONENT PUNISHMENT
  if (opponentPlayer.isFainted) {
    let bestPunishKey = 'D+J';
    let maxDmg = -1;
    moveKeys.forEach(k => {
      const dmg = availableMoves[k].baseDamage || 0;
      if (dmg > maxDmg) { maxDmg = dmg; bestPunishKey = k; }
    });
    setNigoChargeTarget(cpuPlayer, bestPunishKey, opponentPlayer, difficulty);
    return bestPunishKey;
  }

  // 3. HARD & NORMAL DIFFICULTY: FORESEE ENGINE LOOKAHEAD
  let bestMoveKey = 'D+J';

  if (window.ForeseeEngine) {
    bestMoveKey = window.ForeseeEngine.run3TurnForeseeSearch(
      cpuPlayer, opponentPlayer, availableMoves, oppMovesData, {
        maxDepth: difficulty === 'hard' ? 3 : 2,
        characterWeights: { W_LP: 1.2, W_CHI: 40.0, W_FAINT: 2.5 },
        isOpponentLocked: isOpponentLocked,
        lockedOpponentMoveKey: oppMoveKey
      }
    );
  } else {
    bestMoveKey = moveKeys[Math.floor(Math.random() * moveKeys.length)];
  }

  setNigoChargeTarget(cpuPlayer, bestMoveKey, opponentPlayer, difficulty);
  return bestMoveKey;
}

function setNigoChargeTarget(cpuPlayer, moveKey, opponentPlayer, difficulty) {
  let target = 100;

  if (difficulty === 'hard') {
    target = 98 + Math.floor(Math.random() * 3);
  } else if (moveKey.startsWith('A+')) {
    target = 15;
  } else if (moveKey.startsWith('D')) {
    let playerDCharge = 88;
    if (window.globalAIKnowledge && window.globalAIKnowledge.playerProfiles) {
      const profile = window.globalAIKnowledge.playerProfiles[opponentPlayer.id || 'human'];
      if (profile && profile.avgCharge && profile.avgCharge.D) {
        playerDCharge = profile.avgCharge.D;
      }
    }
    target = Math.max(65, playerDCharge - (3 + Math.floor(Math.random() * 3)));
  }

  cpuPlayer.activeChargePercent = target;
}

if (typeof window !== 'undefined') {
  window.selectNigoCPUMove = selectNigoCPUMove;
}
