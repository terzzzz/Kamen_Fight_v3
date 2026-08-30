/**
 * Main AI Memory Manager, Habit Tracker, Rider Profiles & Decision Engine
 * Path: js/ai.js
 */

window.RIDER_AI_PROFILES = {
  ichigo: {
    archetype: 'Balanced',
    weights: { W_LP: 1.0, W_CHI: 7.0, W_FAINT: 2.0 },
    preferredChiGoal: 6
  },
  nigo: {
    archetype: 'Heavy Power',
    weights: { W_LP: 1.3, W_CHI: 5.0, W_FAINT: 1.5 },
    preferredChiGoal: 15
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

    if (oppMoveKey && oppMoveKey.startsWith('A+')) {
      profile.guardCount++;
    } else if (oppMoveKey && oppMoveKey !== 'DO_NOTHING') {
      profile.attackCount++;
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
    return JSON.stringify({ memoryStore: this.memoryStore, playerProfiles: this.playerProfiles });
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
  if (outcomeData.debuffApplied || outcomeData.chiRefunded) return true;
  return outcomeData.faintRecovered > 0;
};

window.selectCPUMove = function(cpuPlayer, opponentPlayer, availableMoves, difficulty = 'normal') {
  if (cpuPlayer.isFainted) return 'DO_NOTHING';

  const moveKeys = Object.keys(availableMoves || {});
  if (moveKeys.length === 0) return 'D+J';

  const diff = String(difficulty).toLowerCase();
  const riderProfile = (window.RIDER_AI_PROFILES && window.RIDER_AI_PROFILES[cpuPlayer.id]) 
    ? window.RIDER_AI_PROFILES[cpuPlayer.id] 
    : { weights: { W_LP: 1.0, W_CHI: 8.0, W_FAINT: 2.0 }, preferredChiGoal: 6 };

  // EASY DIFFICULTY
  if (diff === 'easy') {
    const roll = Math.random();
    if (roll < 0.15) return 'DO_NOTHING';
    const physicalKeys = moveKeys.filter(k => k.startsWith('D+'));
    if (physicalKeys.length > 0 && roll < 0.75) {
      return physicalKeys[Math.floor(Math.random() * physicalKeys.length)];
    }
    return moveKeys[Math.floor(Math.random() * moveKeys.length)];
  }

  // NORMAL DIFFICULTY
  if (diff === 'normal') {
    const roll = Math.random();
    const specialKeys = moveKeys.filter(k => k.startsWith('S+') && (availableMoves[k].chiCost || 0) <= cpuPlayer.chi);
    const physicalKeys = moveKeys.filter(k => k.startsWith('D+'));
    const utilityKeys = moveKeys.filter(k => k.startsWith('W+'));

    if (cpuPlayer.faintMeter > 40 && utilityKeys.some(k => availableMoves[k].faintRecovery)) {
      const recKey = utilityKeys.find(k => availableMoves[k].faintRecovery);
      if (recKey) return recKey;
    }

    if (roll < 0.35 && specialKeys.length > 0 && cpuPlayer.chi >= 5) {
      return specialKeys[Math.floor(Math.random() * specialKeys.length)];
    }
    if (roll < 0.85 && physicalKeys.length > 0) {
      return physicalKeys[Math.floor(Math.random() * physicalKeys.length)];
    }
    return moveKeys[Math.floor(Math.random() * moveKeys.length)];
  }

  // HARD DIFFICULTY: Try ForeseeEngine Minimax Tree First
  if (window.ForeseeEngine && typeof window.ForeseeEngine.getBestMove === 'function') {
    try {
      const bestForeseeMove = window.ForeseeEngine.getBestMove(cpuPlayer, opponentPlayer, availableMoves, riderProfile, 3);
      if (bestForeseeMove && availableMoves[bestForeseeMove]) {
        return bestForeseeMove;
      }
    } catch (err) {
      console.warn("ForeseeEngine exception, falling back to heuristic evaluation:", err);
    }
  }

  // HARD DIFFICULTY: Fallback Heuristic Evaluator
  if (!cpuPlayer.memory) {
    cpuPlayer.memory = {
      recentMoves: [],
      targetChiGoal: riderProfile.preferredChiGoal || 6,
      strategy: 'BALANCED'
    };
  }

  const mem = cpuPlayer.memory;
  const currentChi = cpuPlayer.chi || 0;
  const oppChi = (opponentPlayer && typeof opponentPlayer.chi === 'number') ? opponentPlayer.chi : 8;

  if (currentChi >= mem.targetChiGoal) {
    mem.strategy = 'BURST';
  } else if (currentChi <= 4) {
    mem.targetChiGoal = Math.random() < 0.5 ? riderProfile.preferredChiGoal : 15;
    mem.strategy = Math.random() < 0.4 ? 'BUFF_UP' : 'HOARD';
  }

  let bestKey = moveKeys[0];
  let bestScore = -99999;

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

    if (currentChi > 14) {
      evalDamage *= 1.20;
      evalHitChance = Math.min(100, evalHitChance + 20);
    }

    if (oppChi < 5) {
      evalDamage *= 1.25;
      evalFaintDmg *= 1.25;
    }

    const hitRate = evalHitChance / 100;
    score += (evalDamage * hitRate) * riderProfile.weights.W_LP;

    const remainingChi = currentChi - cost;
    if (remainingChi < 5 && (!opponentPlayer || evalDamage < opponentPlayer.lp)) {
      score -= 60;
    }

    if (mem.strategy === 'HOARD' && isS && cost < mem.targetChiGoal) {
      score -= 50;
    } else if (mem.strategy === 'BURST' && isS) {
      score += cost * 12;
    }

    if (cost === 0 && isD) {
      const chiGain = (m.chiRefundOnHit || 0) + 2;
      score += chiGain * riderProfile.weights.W_CHI;
      if (key !== 'D+J') score += 10;
    } else if (!isS) {
      score -= cost * (riderProfile.weights.W_CHI * 0.5);
    }

    const timesUsed = mem.recentMoves.filter(k => k === key).length;
    score -= timesUsed * 35;

    score += Math.random() * 8;

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  });

  mem.recentMoves.push(bestKey);
  if (mem.recentMoves.length > 3) mem.recentMoves.shift();

  return bestKey;
};

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

  return { moveKey: chosenMoveKey, targetChargePct: targetChargePct };
};

window.saveAIKnowledge = function() {
  try {
    localStorage.setItem('kamen_rider_ai_knowledge', window.globalAIKnowledge.serialize());
  } catch (e) {}
};

window.loadAIKnowledge = function() {
  try {
    const payload = localStorage.getItem('kamen_rider_ai_knowledge');
    if (payload) window.globalAIKnowledge.deserialize(payload);
  } catch (e) {}
};

window.loadAIKnowledge();
