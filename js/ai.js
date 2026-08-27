/**
 * Main AI Memory Manager & Habit Tracker
 * Path: js/ai.js
 */

window.globalAIKnowledge = {
  memoryStore: {},
  playerProfiles: {},

  /**
   * Records outcome of each round, tracking opponent charge habits and move success
   */
  recordTurnOutcome: function(cpuPlayer, opponentPlayer, oppMoveKey, cpuMoveKey, outcomeData) {
    const oppId = (opponentPlayer && opponentPlayer.id) ? opponentPlayer.id : 'human';

    if (!this.playerProfiles[oppId]) {
      this.playerProfiles[oppId] = {
        totalRounds: 0,
        attackCount: 0,
        guardCount: 0,
        chargeSamples: { D: [], S: [] },
        avgCharge: { D: 88, S: 100 }
      };
    }

    const profile = this.playerProfiles[oppId];
    profile.totalRounds++;

    if (!profile.chargeSamples) profile.chargeSamples = { D: [], S: [] };
    if (!profile.avgCharge) profile.avgCharge = { D: 88, S: 100 };

    if (oppMoveKey && oppMoveKey.startsWith('A+')) {
      profile.guardCount++;
    } else if (oppMoveKey && oppMoveKey !== 'DO_NOTHING') {
      profile.attackCount++;
    }

    const oppCharge = (outcomeData && typeof outcomeData.oppChargePercent === 'number') 
      ? outcomeData.oppChargePercent 
      : 100;

    if (oppMoveKey && oppMoveKey.startsWith('D')) {
      profile.chargeSamples.D.push(oppCharge);
      if (profile.chargeSamples.D.length > 20) profile.chargeSamples.D.shift();
      profile.avgCharge.D = Math.round(
        profile.chargeSamples.D.reduce((a, b) => a + b, 0) / profile.chargeSamples.D.length
      );
    } else if (oppMoveKey && oppMoveKey.startsWith('S')) {
      profile.chargeSamples.S.push(oppCharge);
      if (profile.chargeSamples.S.length > 20) profile.chargeSamples.S.shift();
      profile.avgCharge.S = Math.round(
        profile.chargeSamples.S.reduce((a, b) => a + b, 0) / profile.chargeSamples.S.length
      );
    }

    const key = `${cpuPlayer.id}_vs_${oppId}_${cpuMoveKey}`;
    if (!this.memoryStore[key]) {
      this.memoryStore[key] = { uses: 0, wins: 0, totalDmgDealt: 0 };
    }
    this.memoryStore[key].uses++;
    if (outcomeData && outcomeData.damageDealt > 0) {
      this.memoryStore[key].wins++;
      this.memoryStore[key].totalDmgDealt += outcomeData.damageDealt;
    }
  },

  serialize: function() {
    return JSON.stringify({
      memoryStore: this.memoryStore,
      playerProfiles: this.playerProfiles
    });
  },

  deserialize: function(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed) {
        this.memoryStore = parsed.memoryStore || {};
        this.playerProfiles = parsed.playerProfiles || {};
      }
    } catch (e) {
      console.warn("Failed to parse AI knowledge payload", e);
    }
  }
};

window.calculateMoveSuccess = function(cpuPlayer, opponentPlayer, cpuMoveKey, outcomeData) {
  if (!outcomeData) return false;
  if (outcomeData.cpuWasHit && outcomeData.damageTaken > 150) return false;
  if (outcomeData.damageDealt > 0 || outcomeData.oppWasGuarded) return true;
  return outcomeData.faintRecovered > 0;
};
