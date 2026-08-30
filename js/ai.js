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
    preferredChiGoal: 15 // Targets Full Power state (>14 Chi)
  },
  v3: {
    archetype: 'Combo / Fast Chi',
    weights: { W_LP: 0.9, W_CHI: 9.0, W_FAINT: 2.5 },
    preferredChiGoal: 10
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
    if (!cpuPlayer) return;
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
 * Core AI Selection Engine with Low Power & Full Power Threshold Evaluation
 */
window.selectCPUMove = function(cpuPlayer, opponentPlayer, availableMoves, difficulty = 'normal') {
  if (!cpuPlayer || cpuPlayer.isFainted) return 'DO_NOTHING';

  const moveKeys = Object.keys(availableMoves || {});
  if (moveKeys.length === 0) return 'D+J';

  const diff = String(difficulty).toLowerCase();
  const riderProfile = (window.RIDER_AI_PROFILES && window.RIDER_AI_PROFILES[cpuPlayer.id]) 
    ? window.RIDER_AI_PROFILES[cpuPlayer.id] 
    : { weights: { W_LP: 1.0, W_CHI: 8.0, W_FAINT: 2.0 }, preferredChiGoal: 6 };

  const currentChi = cpuPlayer.chi !== undefined ? cpuPlayer.chi : 8;
  const oppLp = opponentPlayer ? opponentPlayer.lp : 2500;

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
    // Low Chi Protection (< 5 Chi = LOW POWER DEBUFF RECOVERY)
    if (currentChi < 5 && Math.random() < 0.85) {
      const zeroCostKeys = moveKeys.filter(k => (availableMoves[k].chiCost || 0) === 0 && k.startsWith('D+'));
      if (zeroCostKeys.length > 0) {
        zeroCostKeys.sort((a, b) => (availableMoves[b].baseDamage || 0) - (availableMoves[a].baseDamage || 0));
        return zeroCostKeys[0];
      }
    }

    const roll = Math.random();
    const specialKeys = moveKeys.filter(k => k.startsWith('S+') && (availableMoves[k].chiCost || 0) <= currentChi);
    const physicalKeys = moveKeys.filter(k => k.startsWith('D+'));
    const utilityKeys = moveKeys.filter(k => k.startsWith('W+'));

    if (cpuPlayer.faintMeter > 40 && utilityKeys.some(k => availableMoves[k].faintRecovery)) {
      const recKey = utilityKeys.find(k => availableMoves[k].faintRecovery);
      if (recKey) return recKey;
    }

    if (roll < 0.35 && specialKeys.length > 0 && currentChi >= 5) {
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
  const oppChi = (opponentPlayer && typeof opponentPlayer.chi === 'number') ? opponentPlayer.chi : 8;

  if (currentChi >= mem.targetChiGoal) {
    mem.strategy = 'BURST';
  } else if (currentChi < 5) {
    mem.targetChiGoal = Math.random() < 0.5 ? riderProfile.preferredChiGoal : 15;
    mem.strategy = 'HOARD';
  }

  let bestKey = moveKeys[0];
  let bestScore = -99999;

  const oppId = (opponentPlayer && opponentPlayer.id) ? opponentPlayer.id : 'human';
  const oppProfile = window.globalAIKnowledge ? window.globalAIKnowledge.playerProfiles[oppId] : null;

  moveKeys.forEach(key => {
    const m = availableMoves[key];
    if (!m) return;

    let score = 0;
    const isD = key.startsWith('D');
    const isS = key.startsWith('S');
    const cost = m.chiCost || 0;

    let evalDamage = m.baseDamage || 0;
    let evalHitChance = m.hitChance || 80;
    let evalFaintDmg = m.baseFaintDamage || 0;

    // 1. LETHAL FINISHER BONUS
    if (evalDamage >= oppLp && m.type !== 'DEFENSE') {
      score += 500;
    }

    // 2. FULL POWER ATTACKER BONUS (Chi > 14 => +20% Dmg, +20% Accuracy)
    if (currentChi > 14) {
      evalDamage *= 1.20;
      evalHitChance = Math.min(100, evalHitChance + 20);
    }

    // 3. LOW POWER DEFENDER VULNERABILITY (Opponent Chi < 5 => +25% Damage & Faint Taken)
    if (oppChi < 5) {
      evalDamage *= 1.25;
      evalFaintDmg *= 1.25;
    }

    const hitRate = evalHitChance / 100;
    score += (evalDamage * hitRate) * riderProfile.weights.W_LP;

    // 4. LOW POWER SELF-PRESERVATION (Strictly avoid dropping below 5 Chi)
    const remainingChi = currentChi - cost;
    if (currentChi < 5 && cost > 0) {
      score -= 150; // Heavy penalty for spending scarce Chi while in Low Power mode
    } else if (remainingChi < 5 && evalDamage < oppLp) {
      score -= 80; // Penalty for placing self in Low Power State
    }

    if (mem.strategy === 'HOARD' && isS && cost < mem.targetChiGoal) {
      score -= 60;
    } else if (mem.strategy === 'BURST' && isS) {
      score += cost * 15;
    }

    if (cost === 0 && isD) {
      const chiGain = (m.chiRefundOnHit || 0) + 2;
      score += chiGain * riderProfile.weights.W_CHI;
      if (key !== 'D+J') score += 15;
    } else if (!isS) {
      score -= cost * (riderProfile.weights.W_CHI * 0.5);
    }

    // 5. Anti-Repetition Penalty
    const timesUsed = mem.recentMoves.filter(k => k === key).length;
    score -= timesUsed * 35;

    // 6. Utility & Faint Buildup Valuation
    if (m.faintRecovery && cpuPlayer.faintMeter > 30) {
      score += (m.faintRecovery * (cpuPlayer.faintMeter / 100)) * riderProfile.weights.W_FAINT * 1.5;
    }
    if (evalFaintDmg) {
      score += (evalFaintDmg * hitRate) * (riderProfile.weights.W_FAINT * 0.5);
    }
    if (m.buff && mem.strategy === 'BUFF_UP' && !cpuPlayer.activeBuffs?.some(b => b.id === m.buff.id)) {
      score += 45;
    }

    // 7. Historical Memory & Opponent Habit Exploitation
    if (window.globalAIKnowledge) {
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
 * Main Direct Bridge Called by match_manager.js
 */
window.getCPUMoveChoice = function(cpuPlayer, opponentPlayer, slotKey = 'p2') {
  if (!cpuPlayer) return 'D+J';

  const movesData = slotKey === 'p1' ? window.gameState.p1Moves : window.gameState.p2Moves;
  const difficulty = cpuPlayer.difficulty || (slotKey === 'p1'
    ? (window.gameState.matchConfig?.p1Difficulty || 'normal')
    : (window.gameState.matchConfig?.p2Difficulty || 'normal'));

  let availableMoves = {};
  if (movesData) {
    Object.keys(movesData).forEach(key => {
      const m = movesData[key];
      if (m && (m.chiCost || 0) <= (cpuPlayer.chi !== undefined ? cpuPlayer.chi : 8)) {
        availableMoves[key] = m;
      }
    });
  }

  return window.selectCPUMove(cpuPlayer, opponentPlayer, availableMoves, difficulty);
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
