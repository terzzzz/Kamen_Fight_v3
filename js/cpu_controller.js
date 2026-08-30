/**
 * Universal CPU Charge & Target Manager
 * Path: js/cpu_controller.js
 */

function setUniversalChargeTarget(cpuPlayer, moveKey, difficulty, profile) {
  let target = 100;

  if (!moveKey) moveKey = 'D+J';

  if (moveKey.startsWith('A+')) {
    target = 15;
  } else if (difficulty === 'easy') {
    target = Math.floor(Math.random() * 16) + 65;
  } else if (difficulty === 'hard') {
    target = Math.floor(Math.random() * 9) + 92;
  } else if (moveKey.startsWith('D')) {
    target = Math.floor(Math.random() * 11) + 85;
  } else {
    target = Math.floor(Math.random() * 11) + 85;
  }

  cpuPlayer.activeChargePercent = target;
}

if (typeof window !== 'undefined') {
  window.setUniversalChargeTarget = setUniversalChargeTarget;
}
