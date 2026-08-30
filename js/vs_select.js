/**
 * Character Selection Controller Bridge
 * Path: js/vs_select.js
 */

// Safe global reference wrapper (delegates to window/ui.js)
window.vsSelectionState = window.vsSelectionState || {
  step: 1,
  p1Index: 0,
  p1IsCPU: false,
  p1Difficulty: 'normal',
  p2Index: 1,
  p2IsCPU: true,
  p2Difficulty: 'normal'
};

// Delegate calls safely to ui.js functions if invoked
function cycleRider(playerKey, direction) {
  if (typeof window.cycleRider === 'function') {
    window.cycleRider(playerKey, direction);
  }
}

function toggleControlType(playerKey) {
  if (typeof window.toggleControlType === 'function') {
    window.toggleControlType(playerKey);
  }
}

function toggleDifficulty(playerKey) {
  if (typeof window.toggleDifficulty === 'function') {
    window.toggleDifficulty(playerKey);
  }
}

function handleConfirmStep() {
  if (typeof window.handleConfirmStep === 'function') {
    window.handleConfirmStep();
  }
}

function handleBackStep() {
  if (typeof window.handleBackStep === 'function') {
    window.handleBackStep();
  }
}

function updateSelectionUI() {
  if (typeof window.updateSelectionUI === 'function') {
    window.updateSelectionUI();
  }
}

function validateAndStartMatch() {
  if (typeof window.validateAndStartMatch === 'function') {
    window.validateAndStartMatch();
  }
}
