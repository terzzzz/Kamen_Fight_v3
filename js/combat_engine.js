/**
 * Combat Engine & Turn Resolution Manager
 * Path: js/combat_engine.js
 */

async function executeTurnResolutionPhase() {
  window.gameState.roundPhase = 'RESOLUTION';

  let p1MoveKey = window.gameState.p1SelectedMoveKey || 'DO_NOTHING';
  let p2MoveKey = window.gameState.p2SelectedMoveKey || 'DO_NOTHING';

  const defaultMove = { name: 'Do Nothing', type: 'IDLE', baseDamage: 0, chiCost: 0 };
  let p1Move = (window.gameState.p1Moves && window.gameState.p1Moves[p1MoveKey]) || defaultMove;
  let p2Move = (window.gameState.p2Moves && window.gameState.p2Moves[p2MoveKey]) || defaultMove;

  // Deduct Chi
  if (p1MoveKey !== 'DO_NOTHING' && p1Move.chiCost) {
    window.gameState.p1.chi = Math.max(0, window.gameState.p1.chi - p1Move.chiCost);
  }
  if (p2MoveKey !== 'DO_NOTHING' && p2Move.chiCost) {
    window.gameState.p2.chi = Math.max(0, window.gameState.p2.chi - p2Move.chiCost);
  }

  if (typeof window.updatePlayerHUD === 'function') {
    window.updatePlayerHUD('p1', window.gameState.p1);
    window.updatePlayerHUD('p2', window.gameState.p2);
  }

  const p1Charge = window.gameState.p1.activeChargePercent !== undefined ? window.gameState.p1.activeChargePercent : 100;
  const p2Charge = window.gameState.p2.activeChargePercent !== undefined ? window.gameState.p2.activeChargePercent : 100;

  const battleMsg = document.getElementById('battle-message');
  if (battleMsg) {
    battleMsg.hidden = false;
    battleMsg.innerHTML = `P1: ${p1Move.name} (${p1Charge}%) VS P2: ${p2Move.name} (${p2Charge}%)`;
  }

  let p1GoesFirst = p1MoveKey !== 'DO_NOTHING';

  let attacker1 = p1GoesFirst ? window.gameState.p1 : window.gameState.p2;
  let defender1 = p1GoesFirst ? window.gameState.p2 : window.gameState.p1;
  let move1 = p1GoesFirst ? p1Move : p2Move;
  let key1 = p1GoesFirst ? p1MoveKey : p2MoveKey;
  let atkKey1 = p1GoesFirst ? 'p1' : 'p2';
  let defKey1 = p1GoesFirst ? 'p2' : 'p1';

  let attacker2 = p1GoesFirst ? window.gameState.p2 : window.gameState.p1;
  let defender2 = p1GoesFirst ? window.gameState.p1 : window.gameState.p2;
  let move2 = p1GoesFirst ? p2Move : p1Move;
  let key2 = p1GoesFirst ? p2MoveKey : p1MoveKey;
  let atkKey2 = p1GoesFirst ? 'p2' : 'p1';
  let defKey2 = p1GoesFirst ? 'p1' : 'p2';

  // Action 1
  if (move1.type !== 'IDLE' && key1 !== 'DO_NOTHING') {
    if (typeof window.playCenterVideo === 'function') {
      await window.playCenterVideo(atkKey1, move1.video || 'idle.mp4', move1.name, null, move1);
    }

    let dmg = Math.floor((move1.baseDamage || 0) * (attacker1.activeChargePercent / 100));
    if (dmg > 0 && !defender1.isFainted && move2.type !== 'DEFENSE') {
      defender1.lp = Math.max(0, defender1.lp - dmg);
    }
  }

  // Action 2
  if (defender1.lp > 0 && move2.type !== 'IDLE' && key2 !== 'DO_NOTHING') {
    if (typeof window.playCenterVideo === 'function') {
      await window.playCenterVideo(atkKey2, move2.video || 'idle.mp4', move2.name, null, move2);
    }

    let dmg = Math.floor((move2.baseDamage || 0) * (attacker2.activeChargePercent / 100));
    if (dmg > 0 && !defender2.isFainted && move1.type !== 'DEFENSE') {
      defender2.lp = Math.max(0, defender2.lp - dmg);
    }
  }

  // Round Resolution Cleanup
  setTimeout(() => {
    if (typeof window.hideCenterScreen === 'function') window.hideCenterScreen();
    if (battleMsg) battleMsg.hidden = true;

    if (typeof window.updatePlayerHUD === 'function') {
      window.updatePlayerHUD('p1', window.gameState.p1);
      window.updatePlayerHUD('p2', window.gameState.p2);
    }

    if (window.gameState.p1.lp > 0 && window.gameState.p2.lp > 0) {
      window.gameState.roundCounter++;
      if (typeof window.startRoundCountdown === 'function') {
        window.startRoundCountdown();
      }
    } else {
      window.gameState.roundPhase = 'GAME_OVER';
      let text = window.gameState.p1.lp <= 0 ? "P2 WINS!" : "P1 WINS!";
      if (battleMsg) {
        battleMsg.hidden = false;
        battleMsg.innerHTML = `GAME OVER!<br>${text}<br><small>TAP TO CONTINUE</small>`;
      }
      window.gameState.canContinueFromGameOver = true;
    }
  }, 1000);
}

window.executeTurnResolutionPhase = executeTurnResolutionPhase;
