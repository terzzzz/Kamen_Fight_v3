/**
 * Kamen Rider V3 Tactical CPU AI Module
 * Path: js/cpu_v3.js
 * 3-Turn Foresee Engine Integration
 */

function selectV3CPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty = 'normal') {
  if (!availableMoves || Object.keys(availableMoves).length === 0) return 'D+J';

  const moveKeys = Object.keys(availableMoves);
  const oppMovesData = getOpponentMovesData(opponentPlayer);
  const isOpponentLocked = !!(gameState.input && gameState.input.isConfirmed);
  const oppMoveKey = gameState.input ? gameState.input.selectedMoveKey : null;

  // 1. EASY DIFFICULTY
  if (difficulty === 'easy') {
    const key = moveKeys[Math.floor(Math.random() * moveKeys.length)];
    setV3ChargeTarget(cpuPlayer, key, difficulty);
    return key;
  }

  // 2. FAINTED OPPONENT PUNISHMENT (MAX DAMAGE)
  if (opponentPlayer.isFainted) {
    const chi = cpuPlayer.chi || 0;
    if (chi >= 11 && availableMoves['S+I']) return 'S+I';
    if (chi >= 8 && availableMoves['S+L']) return 'S+L';
    if (chi >= 6 && availableMoves['S+K']) return 'S+K';
    if (chi >= 4 && availableMoves['S+J']) return 'S+J';
    if (chi >= 1 && availableMoves['D+L']) return 'D+L';
    return availableMoves['D+K'] ? 'D+K' : 'D+J';
  }

  // 3. HARD & NORMAL DIFFICULTY: FORESEE ENGINE SEARCH
  let selectedMove = 'D+J';

  if (window.ForeseeEngine) {
    selectedMove = window.ForeseeEngine.run3TurnForeseeSearch(
      cpuPlayer, opponentPlayer, availableMoves, oppMovesData, {
        maxDepth: difficulty === 'hard' ? 3 : 2,
        characterWeights: { W_LP: 1.0, W_CHI: 50.0, W_FAINT: 4.0 }, // V3 values Chi pooling and Faint setups
        isOpponentLocked: isOpponentLocked,
        lockedOpponentMoveKey: oppMoveKey
      }
    );
  } else {
    selectedMove = moveKeys[Math.floor(Math.random() * moveKeys.length)];
  }

  setV3ChargeTarget(cpuPlayer, selectedMove, difficulty);
  return selectedMove;
}

function setV3ChargeTarget(cpuPlayer, moveKey, difficulty) {
  let target = 100;
  if (difficulty === 'hard') {
    target = 98 + Math.floor(Math.random() * 3);
  } else if (moveKey.startsWith('A+')) {
    target = 15;
  } else if (moveKey.startsWith('D')) {
    target = 85 + Math.floor(Math.random() * 11);
  }
  cpuPlayer.activeChargePercent = target;
}

if (typeof window !== 'undefined') {
  window.selectV3CPUMove = selectV3CPUMove;
}
