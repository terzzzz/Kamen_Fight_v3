/**
 * Main AI Memory Manager, Habit Tracker & Decision Engine
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

/**
 * Calculates overall utility score for move evaluation
 */
window.calculateMoveSuccess = function(cpuPlayer, opponentPlayer, cpuMoveKey, outcomeData) {
  if (!outcomeData) return false;
  if (outcomeData.cpuWasHit && outcomeData.damageTaken > 150) return false;
  if (outcomeData.damageDealt > 0 || outcomeData.oppWasGuarded) return true;
  if (outcomeData.debuffApplied || outcomeData.chiRefunded) return true;
  return outcomeData.faintRecovered > 0;
};

/**
 * Core AI Selection Engine for Tactical Choice Evaluation
 */
window.selectCPUMove = function(cpuPlayer, opponentPlayer, availableMoves, difficulty = 'normal') {
  if (cpuPlayer.isFainted) return 'DO_NOTHING';

  const moveKeys = Object.keys(availableMoves || {});
  if (moveKeys.length === 0) return 'D+J';

  const diff = String(difficulty).toLowerCase();
  const riderProfile = (window.RIDER_AI_PROFILES && window.RIDER_AI_PROFILES[cpuPlayer.id]) 
    ? window.RIDER_AI_PROFILES[cpuPlayer.id] 
    : { weights: { W_LP: 1.0, W_CHI: 8.0, W_FAINT: 2.0 }, dChargeRange: [85, 95] };

  // --- EASY DIFFICULTY ---
  if (diff === 'easy') {
    const roll = Math.random();
    if (roll < 0.15) return 'DO_NOTHING';
    const physicalKeys = moveKeys.filter(k => k.startsWith('D+'));
    if (physicalKeys.length > 0 && roll < 0.75) {
      return physicalKeys[Math.floor(Math.random() * physicalKeys.length)];
    }
    return moveKeys[Math.floor(Math.random() * moveKeys.length)];
  }

  // --- NORMAL DIFFICULTY ---
  if (diff === 'normal') {
    const roll = Math.random();
    const specialKeys = moveKeys.filter(k => k.startsWith('S+') && (availableMoves[k].chiCost || 0) <= cpuPlayer.chi);
    const physicalKeys = moveKeys.filter(k => k.startsWith('D+'));
    const utilityKeys = moveKeys.filter(k => k.startsWith('W+'));

    if (cpuPlayer.faintMeter > 40 && utilityKeys.some(k => availableMoves[k].faintRecovery)) {
      const recKey = utilityKeys.find(k => availableMoves[k].faintRecovery);
      if (recKey) return recKey;
    }

    if (roll < 0.35 && specialKeys.length > 0 && cpuPlayer.chi >= 3) {
      return specialKeys[Math.floor(Math.random() * specialKeys.length)];
    }
    if (roll < 0.85 && physicalKeys.length > 0) {
      return physicalKeys[Math.floor(Math.random() * physicalKeys.length)];
    }
    return moveKeys[Math.floor(Math.random() * moveKeys.length)];
  }

  // --- HARD DIFFICULTY ---
  let bestKey = moveKeys[0];
  let bestScore = -99999;

  const oppId = (opponentPlayer && opponentPlayer.id) ? opponentPlayer.id : 'human';
  const oppProfile = window.globalAIKnowledge.playerProfiles[oppId];

  moveKeys.forEach(key => {
    const m = availableMoves[key];
    if (!m) return;

    let score = 0;

    // 1. Damage Output Weighting
    const baseDmg = m.baseDamage || 0;
    const hitRate = (m.hitChance || 80) / 100;
    score += (baseDmg * hitRate) * riderProfile.weights.W_LP;

    // 2. Chi Efficiency Weighting
    const cost = m.chiCost || 0;
    if (cost === 0 && key.startsWith('D')) {
      const chiGain = (m.chiRefundOnHit || 0) + 2;
      score += chiGain * riderProfile.weights.W_CHI;
    } else {
      score -= cost * (riderProfile.weights.W_CHI * 0.5);
    }

    // 3. Faint Meter Management
    if (m.faintRecovery && cpuPlayer.faintMeter > 30) {
      score += (m.faintRecovery * (cpuPlayer.faintMeter / 100)) * riderProfile.weights.W_FAINT;
    }
    if (m.baseFaintDamage) {
      score += (m.baseFaintDamage * hitRate) * (riderProfile.weights.W_FAINT * 0.5);
    }

    // 4. Debuff & Utility Valuation
    if (m.debuff && opponentPlayer && !opponentPlayer.activeBuffs?.some(b => b.id === m.debuff.id)) {
      score += 45;
    }

    // 5. Historical Win Rate Adjustment
    const memKey = `${cpuPlayer.id}_vs_${oppId}_${key}`;
    const memData = window.globalAIKnowledge.memoryStore[memKey];
    if (memData && memData.uses > 3) {
      const winRatio = memData.wins / memData.uses;
      score += winRatio * 30;
    }

    // 6. Opponent Habit Exploitation
    if (oppProfile && oppProfile.totalRounds > 5) {
      const guardRatio = oppProfile.guardCount / oppProfile.totalRounds;
      if (guardRatio > 0.4 && m.unblockable) {
        score += 50;
      }
    }

    // Small random variance to keep CPU unpredictable
    score += Math.random() * 8;

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  });

  return bestKey;
};
