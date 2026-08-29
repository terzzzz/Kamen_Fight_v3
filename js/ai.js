/**
 * Main AI Memory Manager, Habit Tracker, Rider Profiles & Decision Engine
 * Path: js/ai.js
 */

// Rider-Specific AI Archetype Profiles
window.RIDER_AI_PROFILES = {
  ichigo: {
    archetype: 'Balanced',
    weights: { W_LP: 1.0, W_CHI: 7.0, W_FAINT: 2.0 },
    preferredChiGoal: 6
  },
  nigo: {
    archetype: 'Heavy Power',
    weights: { W_LP: 1.3, W_CHI: 5.0, W_FAINT: 1.5 },
    preferredChiGoal: 10
  },
  v3: {
    archetype: 'Combo / Fast Chi',
    weights: { W_LP: 0.9, W_CHI: 9.0, W_FAINT: 2.5 },
    preferredChiGoal: 8
  },
  riderman: {
    archetype: 'Utility & Control',
    weights: { W_LP: 0.8, W_CHI: 8.0, W_FAINT: 3.0 },
    preferredChiGoal: 5
  }
};

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
    : { weights: { W_LP: 1.0, W_CHI: 8.0, W_FAINT: 2.0 }, preferredChiGoal: 6 };

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
  if (!cpuPlayer.memory) {
    cpuPlayer.memory = {
      recentMoves: [],
      targetChiGoal: riderProfile.preferredChiGoal || 6,
      strategy: 'BALANCED'
    };
  }

  const mem = cpuPlayer.memory;
  const currentChi = cpuPlayer.chi || 0;

  if (currentChi >= mem.targetChiGoal) {
    mem.strategy = 'BURST';
  } else if (currentChi <= 2) {
    mem.targetChiGoal = Math.random() < 0.5 ? riderProfile.preferredChiGoal : 10;
    mem.strategy = Math.random() < 0.4 ? 'BUFF_UP' : 'HOARD';
  }

  let bestKey = moveKeys[0];
  let bestScore = -99999;

  const oppId = (opponentPlayer && opponentPlayer.id) ? opponentPlayer.id : 'human';
  const oppProfile = window.globalAIKnowledge.playerProfiles[oppId];

  moveKeys.forEach(key => {
    const m = availableMoves[key];
    if (!m) return;

    let score = 0;
    const isD = key.startsWith('D');
    const isS = key.startsWith('S');
    const cost = m.chiCost || 0;

    const baseDmg = m.baseDamage || 0;
    const hitRate = (m.hitChance || 80) / 100;
    score += (baseDmg * hitRate) * riderProfile.weights.W_LP;

    if (mem.strategy === 'HOARD' && isS && cost < mem.targetChiGoal) {
      score -= 50;
    } else if (mem.strategy === 'BURST' && isS) {
      score += cost * 12;
    }

    if (cost === 0 && isD) {
      const chiGain = (m.chiRefundOnHit || 0) + 2;
      score += chiGain * riderProfile.weights.W_CHI;
      if (key !== 'D+J') score += 10;
    } else {
      score -= cost * (riderProfile.weights.W_CHI * 0.5);
    }

    const timesUsed = mem.recentMoves.filter(k => k === key).length;
    score -= timesUsed * 35;

    if (m.faintRecovery && cpuPlayer.faintMeter > 30) {
      score += (m.faintRecovery * (cpuPlayer.faintMeter / 100)) * riderProfile.weights.W_FAINT * 1.5;
    }
    if (m.baseFaintDamage) {
      score += (m.baseFaintDamage * hitRate) * (riderProfile.weights.W_FAINT * 0.5);
    }
    if (m.buff && mem.strategy === 'BUFF_UP' && !cpuPlayer.activeBuffs?.some(b => b.id === m.buff.id)) {
      score += 45;
    }
    if (m.debuff && opponentPlayer && !opponentPlayer.activeBuffs?.some(b => b.id === m.debuff.id)) {
      score += 45;
    }

    const memKey = `${cpuPlayer.id}_vs_${oppId}_${key}`;
    const memData = window.globalAIKnowledge.memoryStore[memKey];
    if (memData && memData.uses > 3) {
      const winRatio = memData.wins / memData.uses;
      score += winRatio * 30;
    }

    if (oppProfile && oppProfile.totalRounds > 5) {
      const guardRatio = oppProfile.guardCount / oppProfile.totalRounds;
      if (guardRatio > 0.4 && m.unblockable) {
        score += 50;
      }
    }

    score += Math.random() * 8;

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  });

  mem.recentMoves.push(bestKey);
  if (mem.recentMoves.length > 3) {
    mem.recentMoves.shift();
  }

  return bestKey;
};

/**
 * Real-Time Button Hold & Charge Monitor Integration
 */
window.selectCPUMoveAndCharge = function(cpuPlayer, opponentPlayer, slotKey) {
  const movesData = slotKey === 'p1' ? window.gameState.p1Moves : window.gameState.p2Moves;
  const difficulty = slotKey === 'p1'
    ? (window.gameState.matchConfig?.p1Difficulty || 'normal')
    : (window.gameState.matchConfig?.p2Difficulty || 'normal');

  let availableMoves = {};
  if (movesData) {
    Object.keys(movesData).forEach(key => {
      const m = movesData[key];
      if (m && (m.chiCost || 0) <= cpuPlayer.chi) {
        availableMoves[key] = m;
      }
    });
  }

  const chosenMoveKey = window.selectCPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty);

  let targetChargePct = 100;
  if (difficulty === 'easy') {
    targetChargePct = Math.floor(Math.random() * 35) + 55;
  } else if (difficulty === 'normal') {
    targetChargePct = Math.floor(Math.random() * 20) + 80;
  } else {
    targetChargePct = Math.floor(Math.random() * 10) + 90;
  }

  return {
    moveKey: chosenMoveKey,
    targetChargePct: targetChargePct
  };
};

window.calculateCPUCharge = function(cpuPlayer, opponentPlayer, moveKey, difficulty) {
  let targetPct = 85;
  let delayMs = 1200;

  if (difficulty === 'easy') {
    targetPct = Math.floor(Math.random() * 30) + 60;
    delayMs = Math.floor(Math.random() * 800) + 1400;
  } else if (difficulty === 'hard') {
    targetPct = Math.floor(Math.random() * 10) + 90;
    delayMs = Math.floor(Math.random() * 400) + 600;
  }

  return { chargePercent: targetPct, chargeDelayMs: delayMs };
};

/**
 * LocalStorage Persistence Helpers
 */
window.saveAIKnowledge = function() {
  try {
    const payload = window.globalAIKnowledge.serialize();
    localStorage.setItem('kamen_rider_ai_knowledge', payload);
  } catch (e) {
    console.warn("Could not save AI knowledge to localStorage", e);
  }
};

window.loadAIKnowledge = function() {
  try {
    const payload = localStorage.getItem('kamen_rider_ai_knowledge');
    if (payload) {
      window.globalAIKnowledge.deserialize(payload);
    }
  } catch (e) {
    console.warn("Could not load AI knowledge from localStorage", e);
  }
};

// Auto-load memory on script evaluation
window.loadAIKnowledge();
