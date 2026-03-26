import { GameState, Player, Monster, MonsterEffect, CombatLogEntry, MapId, ClassType, DEFAULT_BUFFS, BossUlt } from './types';
import { MAPS, SHOP_ITEMS, createPlayer, rollDice, calculateDamage, levelUp, CLASSES, SKILLS } from './gameData';
import { TRANSFORMS, TRANSFORM_ITEM } from './transformData';
import { nanoid } from 'nanoid';

declare global {
  // eslint-disable-next-line no-var
  var gameRooms: Map<string, GameState>;
}
if (!global.gameRooms) global.gameRooms = new Map();

export function getOrCreateRoom(roomId: string): GameState {
  if (!global.gameRooms.has(roomId)) {
    const state: GameState = {
      roomId, phase: 'lobby',
      players: {}, playerOrder: [],
      currentPlayerIndex: 0, activePlayerId: null,
      currentMap: 1, currentMonsters: [],
      turn: 0, turnPhase: 'player_turns',
      combatLog: [], groupCoins: 0,
      unlockedMaps: [1],
      unlockedClasses: ['warrior','mage','rogue','necromancer','paladin','ranger','assassin','elementalist','berserker','guardian','druid','bard'],
      actionsThisTurn: {}, shopItems: SHOP_ITEMS,
      bossDefeated: false, waveNumber: 0,
      shopCountdown: 5, shopReady: {},
      activeUlt: null,
    };
    global.gameRooms.set(roomId, state);
  }
  return global.gameRooms.get(roomId)!;
}

export function getRoom(roomId: string): GameState | undefined {
  return global.gameRooms.get(roomId);
}

export function saveRoom(state: GameState): void {
  global.gameRooms.set(state.roomId, state);
}

function log(state: GameState, message: string, type: CombatLogEntry['type']): void {
  state.combatLog.push({ id: nanoid(), turn: state.turn, message, type, timestamp: Date.now() });
  if (state.combatLog.length > 100) state.combatLog = state.combatLog.slice(-100);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getEffectiveDef(p: Player): number {
  const base = p.defense;
  const temp = p.buffs.tempBonusTurns > 0 ? p.buffs.tempDefBonus : 0;
  return Math.max(0, base + temp);
}

function addMonsterEffect(monster: Monster, effect: MonsterEffect): Monster {
  const filtered = (monster.effects ?? []).filter(e => e.type !== effect.type);
  return { ...monster, effects: [...filtered, effect] };
}

// ─── room / lobby ─────────────────────────────────────────────────────────────

export function joinRoom(state: GameState, playerId: string, name: string): GameState {
  if (Object.keys(state.players).length >= 6) return state;
  if (state.players[playerId]) return state;
  const p = createPlayer(playerId, name, 'warrior');
  p.isReady = false;
  state.players[playerId] = p;
  if (!state.playerOrder.includes(playerId)) state.playerOrder.push(playerId);
  log(state, `⚔️ ${name} entrou na sala!`, 'system');
  if (Object.keys(state.players).length >= 1) state.phase = 'class_selection';
  return { ...state };
}

export function selectClass(state: GameState, playerId: string, classType: ClassType): GameState {
  if (!state.players[playerId] || !state.unlockedClasses.includes(classType)) return state;

  // ── UNIQUE CLASS: block if another player already has this class ──
  const alreadyTaken = Object.values(state.players).some(
    p => p.id !== playerId && p.classType === classType
  );
  if (alreadyTaken) {
    log(state, `❌ ${CLASSES[classType].emoji} ${CLASSES[classType].name} já foi escolhida por outro jogador!`, 'system');
    return state;
  }

  const old = state.players[playerId];
  const p = createPlayer(playerId, old.name, classType);
  p.isReady = false;
  p.coins = old.coins;
  p.level = old.level;
  p.xp = old.xp;
  p.xpToNextLevel = old.xpToNextLevel;

  const cls = CLASSES[classType];
  if (old.level > 1) {
    const hpGainPerLevel = 18;
    const mpGainPerLevel = 12;
    const totalHpGain = hpGainPerLevel * (old.level - 1);
    const totalMpGain = mpGainPerLevel * (old.level - 1);
    p.maxHp = cls.baseStats.hp + totalHpGain;
    p.hp = p.maxHp;
    p.maxMp = cls.baseStats.mp + totalMpGain;
    p.mp = p.maxMp;
    p.attack = cls.baseStats.attack + Math.floor(old.level * 1.8);
    p.defense = cls.baseStats.defense + Math.floor(old.level * 1.0);
    p.baseAttack = cls.baseStats.attack;
    p.baseDefense = cls.baseStats.defense;
  }

  const perms = old.inventory.filter(i => i.permanent);
  perms.forEach(item => {
    p.attack   += item.attackBonus;
    p.defense  += item.defenseBonus;
    p.maxHp    += (item.hpBonus ?? 0);
    p.hp       = Math.min(p.hp + (item.hpBonus ?? 0), p.maxHp);
    p.maxMp    += (item.mpBonus ?? 0);
    p.mp       = Math.min(p.mp + (item.mpBonus ?? 0), p.maxMp);
    p.inventory.push({ ...item });
  });
  old.inventory.filter(i => !i.permanent && i.consumable).forEach(item => {
    p.inventory.push({ ...item });
  });

  state.players[playerId] = p;
  log(state, `${old.name} escolheu ${CLASSES[classType].emoji} ${CLASSES[classType].name}!`, 'system');
  return { ...state };
}

export function setPlayerReady(state: GameState, playerId: string): GameState {
  if (!state.players[playerId]) return state;
  state.players[playerId] = { ...state.players[playerId], isReady: true };
  log(state, `✅ ${state.players[playerId].name} está pronto!`, 'system');
  const allReady = Object.values(state.players).every(p => p.isReady);
  if (allReady && Object.keys(state.players).length >= 1) {
    state.phase = 'map_selection';
    log(state, '🗺️ Todos prontos! Escolham o mapa.', 'system');
  }
  return { ...state };
}

export function selectMap(state: GameState, _playerId: string, mapId: MapId): GameState {
  if (!state.unlockedMaps.includes(mapId)) return state;
  state.currentMap = mapId;
  state.phase = 'shopping';
  state.bossDefeated = false;
  state.waveNumber = 0;
  const mapDef = MAPS.find(m => m.id === mapId)!;
  log(state, `🗺️ Mapa: ${mapDef.theme} ${mapDef.name}`, 'system');
  log(state, `🛒 Loja aberta! Comprem equipamentos.`, 'system');
  Object.keys(state.players).forEach(pid => {
    if (state.players[pid].coins < 50) state.players[pid] = { ...state.players[pid], coins: 50 };
  });
  return { ...state };
}

export function buyItem(state: GameState, playerId: string, itemId: string): GameState {
  const player = state.players[playerId];
  if (!player) return state;
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item || player.coins < item.price) return state;
  if (item.permanent && player.inventory.some(i => i.id === itemId)) return state;

  const newInv = [...player.inventory];
  if (item.consumable) {
    const idx = newInv.findIndex(i => i.id === itemId);
    if (idx >= 0) newInv[idx] = { ...newInv[idx], quantity: (newInv[idx].quantity ?? 0) + (item.quantity ?? 1) };
    else newInv.push({ ...item });
  } else {
    newInv.push({ ...item });
  }

  state.players[playerId] = {
    ...player,
    coins:   player.coins   - item.price,
    attack:  player.attack  + item.attackBonus,
    defense: player.defense + item.defenseBonus,
    maxHp:   player.maxHp   + (item.hpBonus ?? 0),
    hp:      player.hp      + (item.hpBonus ?? 0),
    maxMp:   player.maxMp   + (item.mpBonus ?? 0),
    mp:      player.mp      + (item.mpBonus ?? 0),
    inventory: newInv,
  };
  log(state, `🛒 ${player.name} comprou ${item.emoji} ${item.name}!`, 'system');
  return { ...state };
}

// ─── TRANSFORMATION ───────────────────────────────────────────────────────────

export function useTransform(state: GameState, playerId: string): GameState {
  if (state.phase !== 'combat') return state;
  if (state.activePlayerId !== playerId) return state;
  if (state.actionsThisTurn[playerId]) return state;

  const player = state.players[playerId];
  if (!player?.isAlive) return state;
  if (!player.inventory.some(i => i.isTransformItem)) {
    log(state, `❌ ${player.name} não possui a Essência do Deus Antigo!`, 'system');
    return state;
  }
  if (player.buffs.transformUsedThisCombat) {
    log(state, `❌ ${player.name} já usou a transformação neste combate!`, 'system');
    return state;
  }
  if (player.buffs.transformTurnsLeft > 0) {
    log(state, `❌ ${player.name} já está transformado!`, 'system');
    return state;
  }

  const transform = TRANSFORMS[player.classType];

  state.activeUlt = {
    playerId,
    playerName: player.name,
    classType: player.classType,
    ultName: transform.name,
    ultLines: transform.ultLines,
    ultColor: transform.ultColor,
    ultBg: transform.ultBg,
    ultEmoji: transform.emoji,
    isTransform: true,
  };

  const atkBonus = Math.floor(player.attack * (transform.atkMultiplier - 1));
  const defBonus = Math.floor(player.defense * (transform.defMultiplier - 1));
  const newMaxHp = player.maxHp + transform.hpBonusFlat;
  const newHp = Math.min(player.hp + transform.hpBonusFlat, newMaxHp);

  state.players[playerId] = {
    ...player,
    attack: player.attack + atkBonus,
    defense: player.defense + defBonus,
    maxHp: newMaxHp,
    hp: newHp,
    buffs: {
      ...player.buffs,
      transformTurnsLeft: 6,
      transformUsedThisCombat: true,
    },
  };

  log(state, `🌟 ${player.name} usa a ESSÊNCIA DO DEUS ANTIGO! TRANSFORMAÇÃO: ${transform.emoji} ${transform.name}!`, 'level_up');
  log(state, `⬆️ +${atkBonus} ATK, +${defBonus} DEF, +${transform.hpBonusFlat} HP por 6 turnos!`, 'level_up');

  state.actionsThisTurn[playerId] = true;
  afterAction(state);
  return { ...state };
}

// ─── combat start / resume ────────────────────────────────────────────────────

function spawnWave(state: GameState): void {
  const mapDef = MAPS.find(m => m.id === state.currentMap)!;
  const pool = [...mapDef.monsters].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2));
  state.currentMonsters = pool.map(m => ({ ...m, id: nanoid(), effects: [], enraged: false }));
  state.waveNumber += 1;
  log(state, `🌊 Onda ${state.waveNumber}! ${state.currentMonsters.map(m => m.emoji + m.name).join(', ')}`, 'system');
}

function resetPlayerCombatBuffs(p: Player): Player {
  return { ...p, buffs: { ...DEFAULT_BUFFS }, statusEffects: [] };
}

export function startCombat(state: GameState): GameState {
  Object.keys(state.players).forEach(pid => {
    state.players[pid] = {
      ...resetPlayerCombatBuffs(state.players[pid]),
      hp: state.players[pid].maxHp,
      mp: state.players[pid].maxMp,
      isAlive: true,
    };
  });
  state.phase = 'combat';
  state.turn = 1;
  state.turnPhase = 'player_turns';
  state.actionsThisTurn = {};
  state.shopReady = {};
  state.currentPlayerIndex = 0;
  state.bossDefeated = false;
  state.waveNumber = 0;
  state.shopCountdown = 5;
  state.activeUlt = null;
  spawnWave(state);
  const first = state.playerOrder.find(pid => state.players[pid]?.isAlive);
  state.activePlayerId = first ?? null;
  const mapDef = MAPS.find(m => m.id === state.currentMap)!;
  log(state, `⚔️ COMBATE INICIADO! ${mapDef.theme} ${mapDef.name}`, 'system');
  if (first) log(state, `🎯 Vez de ${state.players[first].name} agir!`, 'system');
  return { ...state };
}

export function toggleShopReady(state: GameState, playerId: string): GameState {
  if (!state.players[playerId]) return state;
  if (state.phase !== 'shopping' && state.phase !== 'victory_shopping') return state;
  state.shopReady[playerId] = !state.shopReady[playerId];
  const name = state.players[playerId].name;
  log(state, state.shopReady[playerId] ? `✅ ${name} pronto!` : `❌ ${name} cancelou.`, 'system');
  const alive = Object.values(state.players).filter(p => p.isAlive);
  if (alive.length > 0 && alive.every(p => state.shopReady[p.id])) {
    state.shopReady = {};
    log(state, `⚔️ Todos prontos! Continuando...`, 'system');
    return state.phase === 'victory_shopping' ? proceedToNextMap(state) : continueCombat(state);
  }
  return { ...state };
}

export function continueCombat(state: GameState): GameState {
  if (state.turn === 0) return startCombat(state);
  if (state.currentMonsters.filter(m => m.hp > 0).length === 0) spawnWave(state);
  state.phase = 'combat';
  state.turnPhase = 'player_turns';
  state.actionsThisTurn = {};
  state.shopReady = {};
  state.shopCountdown = 5;
  state.activeUlt = null;
  const first = state.playerOrder.find(pid => state.players[pid]?.isAlive);
  state.activePlayerId = first ?? null;
  log(state, `⚔️ Combate retomado! Turno ${state.turn}`, 'system');
  if (first) log(state, `🎯 Vez de ${state.players[first].name} agir!`, 'system');
  return { ...state };
}

export function clearUlt(state: GameState): GameState {
  state.activeUlt = null;
  return { ...state };
}

// ─── player action ────────────────────────────────────────────────────────────

export function processPlayerAction(
  state: GameState, playerId: string,
  action: { type: string; targetId?: string; skillIndex?: number; itemId?: string }
): GameState {
  if (state.phase !== 'combat' || state.turnPhase !== 'player_turns') return state;
  if (state.actionsThisTurn[playerId]) return state;
  if (state.activePlayerId !== playerId) {
    log(state, `⏳ Aguarde sua vez!`, 'system');
    return state;
  }
  const player = state.players[playerId];
  if (!player?.isAlive) return state;

  if (action.type === 'use_transform') {
    return useTransform(state, playerId);
  }

  const isTransformed = player.buffs.transformTurnsLeft > 0;
  const transform = TRANSFORMS[player.classType];
  let p = { ...player, buffs: { ...player.buffs } };

  // ── POTION ──
  if (action.type === 'use_potion') {
    const idx = p.inventory.findIndex(i => i.id === action.itemId && i.consumable && (i.quantity ?? 0) > 0);
    if (idx === -1) return state;
    const item = p.inventory[idx];
    if (item.consumeHeal) {
      const h = Math.min(p.maxHp - p.hp, item.consumeHeal);
      p.hp = Math.min(p.maxHp, p.hp + item.consumeHeal);
      log(state, `${p.name} usa ${item.emoji} ${item.name}! +${h} HP.`, 'player_action');
    }
    if (item.consumeMpHeal) {
      const m = Math.min(p.maxMp - p.mp, item.consumeMpHeal);
      p.mp = Math.min(p.maxMp, p.mp + item.consumeMpHeal);
      log(state, `${p.name} usa ${item.emoji} ${item.name}! +${m} MP.`, 'player_action');
    }
    const newQ = (item.quantity ?? 1) - 1;
    const newInv = [...p.inventory];
    if (newQ <= 0) newInv.splice(idx, 1);
    else newInv[idx] = { ...item, quantity: newQ };
    p.inventory = newInv;
    state.players[playerId] = p;
    state.actionsThisTurn[playerId] = true;
    afterAction(state);
    return { ...state };
  }

  // ── BASIC ATTACK ──
  if (action.type === 'attack') {
    const mIdx = state.currentMonsters.findIndex(m => m.id === action.targetId && m.hp > 0);
    if (mIdx === -1) return state;
    const target = state.currentMonsters[mIdx];

    const dice = rollDice();
    let dmgBonus = groupNecroBuff(state);
    if (p.buffs.tempBonusTurns > 0) dmgBonus += p.buffs.tempAtkBonus;
    if (p.buffs.aimBonus > 0) {
      dmgBonus += p.buffs.aimBonus;
      log(state, `🦅 Olho de Águia! +${p.buffs.aimBonus} dano bônus.`, 'system');
      p.buffs.aimBonus = 0;
    }

    const transformLabel = isTransformed ? ` [🌟${transform.emoji}]` : '';

    let tDef = applyMonsterCurse(target);
    if (isMonsterStunned(target)) { tDef = 0; log(state, `😵 ${target.name} atordoado! DEF ignorada.`, 'system'); }
    const markMult = getMarkMult(target);

    const rawDmg = calculateDamage(p.attack + dmgBonus, tDef, dice);
    const finalDmg = Math.round(rawDmg * markMult);
    state.currentMonsters[mIdx] = { ...target, hp: Math.max(0, target.hp - finalDmg) };
    log(state, `${p.name}${transformLabel} ${CLASSES[p.classType].emoji} ataca ${target.emoji}${target.name}! [🎲${dice}] Dano: ${finalDmg}${markMult > 1 ? ` (×${markMult.toFixed(1)} Marca)` : ''}`, 'player_action');
    if (state.currentMonsters[mIdx].hp <= 0) onMonsterDeath(state, target);

    state.players[playerId] = p;
    state.actionsThisTurn[playerId] = true;
    afterAction(state);
    return { ...state };
  }

  // ── SKILL ──
  if (action.type === 'skill') {
    const sIdx = action.skillIndex ?? 0;

    if (isTransformed && sIdx < transform.skillOverrides.length) {
      return processTransformSkill(state, playerId, p, sIdx, action);
    }

    const skills = SKILLS[p.classType];
    const skill = skills[sIdx];
    if (!skill) return state;

    if (skill.ultLevel !== undefined && p.level < skill.ultLevel) {
      log(state, `❌ ${p.name}: Nível ${skill.ultLevel} necessário para usar ${skill.name}!`, 'system');
      return state;
    }

    const mpCost = skill.mpCost;
    if (p.mp < mpCost) {
      log(state, `❌ ${p.name}: MP insuficiente! (${p.mp}/${mpCost})`, 'system');
      return state;
    }
    p.mp -= mpCost;

    if (skill.effect === 'ult' && skill.ultName && skill.ultLines) {
      state.activeUlt = {
        playerId,
        playerName: p.name,
        classType: p.classType,
        ultName: skill.ultName,
        ultLines: skill.ultLines,
        ultColor: skill.ultColor ?? '#d4a017',
        ultBg: skill.ultBg ?? 'radial-gradient(ellipse, #1a1a30 0%, #050508 70%)',
        ultEmoji: skill.emoji,
      };
      log(state, `🌟 ${p.name} usa a ULTIMATE: ${skill.ultName}!`, 'level_up');
    }

    const aliveMonsters = state.currentMonsters.filter(m => m.hp > 0);
    let necroBuff = groupNecroBuff(state);
    let atkBonus = (p.buffs.tempBonusTurns > 0 ? p.buffs.tempAtkBonus : 0) + necroBuff;

    if (skill.damage !== undefined) {
      if (skill.aoe) {
        const dice = rollDice();
        state.currentMonsters = state.currentMonsters.map(m => {
          if (m.hp <= 0) return m;
          let def = applyMonsterCurse(m);
          if (skill.effect === 'pierce' || skill.effect === 'ult') def = 0;
          else if (skill.effect === 'ignore_half_def') def = Math.floor(def * 0.5);
          else def = Math.floor(def * 0.5);
          const dmg = calculateDamage(p.attack + skill.damage! + atkBonus, def, dice);
          const newHp = Math.max(0, m.hp - dmg);
          log(state, `💥 ${skill.emoji} ${skill.name} → ${m.emoji}${m.name}: ${dmg} dano`, 'player_action');
          let newM = { ...m, hp: newHp };
          if (skill.effect === 'poison' && skill.poisonDmg) {
            newM = addMonsterEffect(newM, { type: 'poisoned', damage: skill.poisonDmg, turnsLeft: skill.poisonTurns ?? 3 });
          }
          if (skill.effect === 'stun' && Math.random() < 0.4) {
            newM = addMonsterEffect(newM, { type: 'stunned', turnsLeft: skill.stunTurns ?? 1 });
            log(state, `😵 ${m.name} atordoado!`, 'system');
          }
          if (skill.effect === 'ult') {
            newM = addMonsterEffect(newM, { type: 'stunned', turnsLeft: 1 });
          }
          if (newHp <= 0) onMonsterDeath(state, m);
          return newM;
        });
      } else {
        const mIdx = state.currentMonsters.findIndex(m => m.id === action.targetId && m.hp > 0);
        if (mIdx !== -1) {
          const target = state.currentMonsters[mIdx];
          const dice = rollDice();
          let def = applyMonsterCurse(target);
          if (skill.effect === 'pierce' || skill.effect === 'ult') def = 0;
          else if (skill.effect === 'ignore_half_def') def = Math.floor(def * 0.5);
          if (isMonsterStunned(target)) { def = 0; log(state, `😵 ${target.name} atordoado! DEF ignorada.`, 'system'); }
          const markMult = getMarkMult(target);

          let totalAtk = p.attack + skill.damage + atkBonus;
          let execMult = 1;
          if (skill.effect === 'execute' && target.hp < target.maxHp * 0.5) {
            execMult = 3;
            def = 0;
            log(state, `💀 EXECUÇÃO! HP < 50% → 3x dano!`, 'system');
          }
          if (skill.effect === 'rage_scale') {
            const missingPct = 1 - p.hp / p.maxHp;
            execMult = 1 + missingPct * 2;
            log(state, `🩸 Ira Sanguinária! Fator: ×${execMult.toFixed(1)}`, 'system');
          }

          const rawDmg = calculateDamage(totalAtk, def, dice);
          const finalDmg = Math.round(rawDmg * execMult * markMult);
          let newM = { ...target, hp: Math.max(0, target.hp - finalDmg) };

          if (skill.effect === 'poison' && skill.poisonDmg) {
            newM = addMonsterEffect(newM, { type: 'poisoned', damage: skill.poisonDmg, turnsLeft: skill.poisonTurns ?? 3 });
            log(state, `☠️ ${target.name} envenenado!`, 'system');
          }
          if (skill.effect === 'stun' && skill.stunTurns) {
            newM = addMonsterEffect(newM, { type: 'stunned', turnsLeft: skill.stunTurns });
            log(state, `😵 ${target.name} atordoado por ${skill.stunTurns} turno(s)!`, 'system');
          }

          state.currentMonsters[mIdx] = newM;
          log(state, `${p.name} usa ${skill.emoji} ${skill.name} em ${target.emoji}${target.name}! Dano: ${finalDmg}`, 'player_action');
          if (newM.hp <= 0) onMonsterDeath(state, target);
        }
      }
    }

    if (skill.heal !== undefined) {
      if ((skill.effect === 'aoe_heal' || skill.effect === 'ult') && !skill.selfOnly) {
        Object.keys(state.players).forEach(pid => {
          const tp = state.players[pid];
          if (skill.effect === 'ult' && !tp.isAlive) {
            const revHp = Math.floor(tp.maxHp * 0.5);
            state.players[pid] = { ...tp, isAlive: true, hp: revHp };
            log(state, `✝️ ${p.name} ressuscita ${tp.name}! Volta com ${revHp}HP!`, 'player_action');
            return;
          }
          if (!tp.isAlive) return;
          const h = Math.min(tp.maxHp - tp.hp, skill.heal!);
          state.players[pid] = { ...tp, hp: tp.hp + h };
          if (h > 0) log(state, `💚 ${tp.name} recupera ${h} HP!`, 'player_action');
        });
        log(state, `${p.name} usa ${skill.emoji} ${skill.name}! Cura ${skill.heal}HP para todos.`, 'player_action');
      } else if (skill.selfOnly || (skill.effect === 'ult' && skill.selfOnly)) {
        const h = Math.min(p.maxHp - p.hp, skill.heal);
        p.hp = Math.min(p.maxHp, p.hp + skill.heal);
        if (h > 0) log(state, `💚 ${p.name} usa ${skill.emoji} ${skill.name}! +${h} HP.`, 'player_action');
      } else if (action.targetId && state.players[action.targetId]) {
        const tp = state.players[action.targetId];
        const h = Math.min(tp.maxHp - tp.hp, skill.heal);
        state.players[action.targetId] = { ...tp, hp: tp.hp + h };
        log(state, `${p.name} usa ${skill.emoji} ${skill.name} em ${tp.name}! +${h} HP.`, 'player_action');
      } else {
        const h = Math.min(p.maxHp - p.hp, skill.heal);
        p.hp = Math.min(p.maxHp, p.hp + skill.heal);
        if (h > 0) log(state, `💚 ${p.name} usa ${skill.emoji} ${skill.name}! +${h} HP.`, 'player_action');
      }
    }

    state.players[playerId] = p;
    applySkillEffects(state, playerId, p, skill, action);
    state.actionsThisTurn[playerId] = true;
    afterAction(state);
    return { ...state };
  }

  return state;
}

// ─── Transform skill processor ────────────────────────────────────────────────

function processTransformSkill(
  state: GameState, playerId: string, p: Player, sIdx: number,
  action: { type: string; targetId?: string; skillIndex?: number }
): GameState {
  const transform = TRANSFORMS[p.classType];
  const skill = transform.skillOverrides[sIdx];
  if (!skill) return state;

  const mpCost = skill.mpCost;
  if (p.mp < mpCost) {
    log(state, `❌ ${p.name}: MP insuficiente! (${p.mp}/${mpCost})`, 'system');
    return state;
  }
  p.mp -= mpCost;

  // ── TRANSFORM ULT trigger ──
  if (skill.effect === 'ult' && skill.ultName && skill.ultLines) {
    state.activeUlt = {
      playerId,
      playerName: p.name,
      classType: p.classType,
      ultName: skill.ultName,
      ultLines: skill.ultLines,
      ultColor: skill.ultColor ?? transform.ultColor,
      ultBg: skill.ultBg ?? transform.ultBg,
      ultEmoji: skill.emoji,
    };
    log(state, `🌟 ${p.name} [${transform.emoji}] usa a ULTIMATE DIVINA: ${skill.ultName}!`, 'level_up');
  }

  const necroBuff = groupNecroBuff(state);
  const atkBonus = (p.buffs.tempBonusTurns > 0 ? p.buffs.tempAtkBonus : 0) + necroBuff;

  // Damage
  if (skill.damage !== undefined) {
    if (skill.aoe) {
      const dice = rollDice();
      state.currentMonsters = state.currentMonsters.map(m => {
        if (m.hp <= 0) return m;
        let def = applyMonsterCurse(m);
        if (skill.effect === 'pierce' || skill.effect === 'ult') def = 0;
        else def = Math.floor(def * 0.4);
        const dmg = calculateDamage(p.attack + skill.damage! + atkBonus, def, dice);
        const newHp = Math.max(0, m.hp - dmg);
        log(state, `🌟 ${skill.emoji} ${skill.name} → ${m.emoji}${m.name}: ${dmg} dano`, 'player_action');
        let newM = { ...m, hp: newHp };
        if (skill.effect === 'poison' && skill.poisonDmg) {
          newM = addMonsterEffect(newM, { type: 'poisoned', damage: skill.poisonDmg, turnsLeft: skill.poisonTurns ?? 3 });
        }
        if (skill.effect === 'stun' || skill.effect === 'ult') {
          newM = addMonsterEffect(newM, { type: 'stunned', turnsLeft: skill.stunTurns ?? 1 });
          log(state, `😵 ${m.name} atordoado!`, 'system');
        }
        if (newHp <= 0) onMonsterDeath(state, m);
        return newM;
      });
    } else {
      const mIdx = state.currentMonsters.findIndex(m => m.id === action.targetId && m.hp > 0);
      if (mIdx !== -1) {
        const target = state.currentMonsters[mIdx];
        const dice = rollDice();
        let def = applyMonsterCurse(target);
        if (skill.effect === 'pierce' || skill.effect === 'ignore_half_def' || skill.effect === 'ult') def = 0;
        if (isMonsterStunned(target)) def = 0;
        const markMult = getMarkMult(target);

        let execMult = 1;
        if (skill.effect === 'execute' && target.hp < target.maxHp * 0.5) {
          execMult = 5; def = 0;
          log(state, `💀 EXECUÇÃO DIVINA! 5x dano!`, 'system');
        }
        if (skill.effect === 'rage_scale') {
          const missingPct = 1 - p.hp / p.maxHp;
          execMult = 1 + missingPct * 5;
          log(state, `🩸 Ira Primordial! Fator: ×${execMult.toFixed(1)}`, 'system');
        }

        const rawDmg = calculateDamage(p.attack + skill.damage + atkBonus, def, dice);
        const finalDmg = Math.round(rawDmg * execMult * markMult);
        let newM = { ...target, hp: Math.max(0, target.hp - finalDmg) };

        if (skill.effect === 'poison' && skill.poisonDmg) {
          newM = addMonsterEffect(newM, { type: 'poisoned', damage: skill.poisonDmg, turnsLeft: skill.poisonTurns ?? 4 });
        }
        if (skill.effect === 'stun' && skill.stunTurns) {
          newM = addMonsterEffect(newM, { type: 'stunned', turnsLeft: skill.stunTurns });
        }

        state.currentMonsters[mIdx] = newM;
        log(state, `🌟 ${p.name} [${transform.emoji}] usa ${skill.emoji} ${skill.name} em ${target.emoji}${target.name}! Dano: ${finalDmg}`, 'player_action');
        if (newM.hp <= 0) onMonsterDeath(state, target);
      }
    }
  }

  // Heal (including ult aoe_heal / revive for transform ults like Druid and Paladin)
  if (skill.heal !== undefined) {
    if (skill.effect === 'aoe_heal' || skill.effect === 'ult') {
      Object.keys(state.players).forEach(pid => {
        const tp = state.players[pid];
        if (skill.effect === 'ult' && !tp.isAlive) {
          const revHp = Math.floor(tp.maxHp * 0.6);
          state.players[pid] = { ...tp, isAlive: true, hp: revHp };
          log(state, `✝️ ${p.name} [${transform.emoji}] ressuscita ${tp.name} com ${revHp}HP!`, 'player_action');
          return;
        }
        if (!tp.isAlive) return;
        const h = Math.min(tp.maxHp - tp.hp, skill.heal!);
        state.players[pid] = { ...tp, hp: tp.hp + h };
        if (h > 0) log(state, `💚 ${tp.name} recupera ${h} HP!`, 'player_action');
      });
    } else if (action.targetId && state.players[action.targetId]) {
      const tp = state.players[action.targetId];
      const h = Math.min(tp.maxHp - tp.hp, skill.heal);
      state.players[action.targetId] = { ...tp, hp: tp.hp + h };
      log(state, `💚 ${p.name} cura ${tp.name}! +${h} HP.`, 'player_action');
    } else {
      p.hp = Math.min(p.maxHp, p.hp + skill.heal);
    }
  }

  state.players[playerId] = p;

  // Apply effects
  const eff = skill.effect;
  if (eff === 'defense_up' && skill.defBonus) {
    const cp = state.players[playerId];
    state.players[playerId] = { ...cp, buffs: { ...cp.buffs, tempDefBonus: cp.buffs.tempDefBonus + skill.defBonus, tempBonusTurns: Math.max(cp.buffs.tempBonusTurns, skill.defBonusTurns ?? 3) } };
    log(state, `🛡️ ${p.name} [${transform.emoji}] ativa ${skill.emoji}! +${skill.defBonus} DEF!`, 'player_action');
  }
  if (eff === 'group_atk_up' && skill.atkGroupBonus) {
    Object.keys(state.players).forEach(pid => {
      const tp = state.players[pid];
      if (!tp.isAlive) return;
      state.players[pid] = { ...tp, buffs: { ...tp.buffs, tempAtkBonus: tp.buffs.tempAtkBonus + skill.atkGroupBonus!, tempBonusTurns: Math.max(tp.buffs.tempBonusTurns, skill.atkGroupTurns ?? 4) } };
    });
    log(state, `📣 ${p.name} [${transform.emoji}] usa ${skill.emoji}! TODOS +${skill.atkGroupBonus} ATK!`, 'player_action');
  }
  if (eff === 'necro_buff' && skill.necroAtkBonus) {
    Object.keys(state.players).forEach(pid => {
      const tp = state.players[pid];
      if (!tp.isAlive) return;
      state.players[pid] = { ...tp, buffs: { ...tp.buffs, necroBonusDmg: skill.necroAtkBonus!, necroBonusTurnsLeft: skill.necroBonusTurns ?? 6 } };
    });
    log(state, `💀 ${p.name} [${transform.emoji}] invoca exército divino! +${skill.necroAtkBonus} dano!`, 'player_action');
  }
  if (eff === 'dodge') {
    state.players[playerId] = { ...state.players[playerId], buffs: { ...state.players[playerId].buffs, dodgeTurnsLeft: 3 } };
    log(state, `💨 ${p.name} [${transform.emoji}] ativa ${skill.emoji}! Esquiva por 3 ataques!`, 'player_action');
  }
  if (eff === 'aim' && skill.aimBonus) {
    state.players[playerId] = { ...state.players[playerId], buffs: { ...state.players[playerId].buffs, aimBonus: skill.aimBonus } };
    log(state, `🦅 ${p.name} [${transform.emoji}] mira! +${skill.aimBonus} dano!`, 'player_action');
  }
  if (eff === 'wall' && skill.wallTurns) {
    Object.keys(state.players).forEach(pid => {
      const tp = state.players[pid];
      if (!tp.isAlive) return;
      state.players[pid] = { ...tp, buffs: { ...tp.buffs, wallTurnsLeft: Math.max(tp.buffs.wallTurnsLeft, skill.wallTurns!) } };
    });
    log(state, `🏰 ${p.name} [${transform.emoji}] Muralha Eterna! por ${skill.wallTurns}t!`, 'player_action');
  }
  if (eff === 'counter' && skill.counterPct) {
    state.players[playerId] = { ...state.players[playerId], buffs: { ...state.players[playerId].buffs, counterReflect: skill.counterPct } };
    log(state, `🔄 ${p.name} [${transform.emoji}] Contra-Ataque Divino ${Math.round(skill.counterPct * 100)}%!`, 'player_action');
  }
  if (eff === 'stun' && !skill.damage && action.targetId) {
    const mIdx = state.currentMonsters.findIndex(m => m.id === action.targetId && m.hp > 0);
    if (mIdx !== -1) {
      state.currentMonsters[mIdx] = addMonsterEffect(state.currentMonsters[mIdx], { type: 'stunned', turnsLeft: skill.stunTurns ?? 3 });
      log(state, `😵 ${state.currentMonsters[mIdx].name} atordoado por ${skill.stunTurns}t!`, 'system');
    }
  }
  if (eff === 'poison' && !skill.damage && action.targetId) {
    const mIdx = state.currentMonsters.findIndex(m => m.id === action.targetId && m.hp > 0);
    if (mIdx !== -1) {
      state.currentMonsters[mIdx] = addMonsterEffect(state.currentMonsters[mIdx], { type: 'poisoned', damage: skill.poisonDmg ?? 20, turnsLeft: skill.poisonTurns ?? 5 });
      log(state, `☠️ ${state.currentMonsters[mIdx].name} envenenado divinamente!`, 'system');
    }
  }
  if (eff === 'revive' && action.targetId && skill.reviveHpPct) {
    const tp = state.players[action.targetId];
    if (tp && !tp.isAlive) {
      const revHp = Math.floor(tp.maxHp * skill.reviveHpPct);
      state.players[action.targetId] = { ...tp, isAlive: true, hp: revHp };
      log(state, `✝️ ${p.name} ressuscita ${tp.name} com ${revHp}HP!`, 'player_action');
    }
  }
  if (eff === 'regen' && action.targetId && skill.regenHp) {
    const tp = state.players[action.targetId];
    if (tp) {
      state.players[action.targetId] = { ...tp, buffs: { ...tp.buffs, regenHpPerTurn: tp.buffs.regenHpPerTurn + skill.regenHp, regenTurnsLeft: Math.max(tp.buffs.regenTurnsLeft, skill.regenTurns ?? 6) } };
      log(state, `♻️ ${tp.name} regenera ${skill.regenHp}HP/t por ${skill.regenTurns}t!`, 'player_action');
    }
  }
  if (eff === 'berserk' && skill.berserkAtkBonus) {
    const cp = state.players[playerId];
    state.players[playerId] = { ...cp, buffs: { ...cp.buffs, tempAtkBonus: cp.buffs.tempAtkBonus + skill.berserkAtkBonus, tempDefBonus: cp.buffs.tempDefBonus - (skill.berserkDefPenalty ?? 5), tempBonusTurns: Math.max(cp.buffs.tempBonusTurns, skill.berserkTurns ?? 4) } };
    log(state, `😡 ${p.name} FRENESI DIVINO! +${skill.berserkAtkBonus}ATK!`, 'player_action');
  }
  if (eff === 'taunt') {
    (state.players[playerId] as any).tauntTurns = 3;
    log(state, `📢 ${p.name} [${transform.emoji}] PROVOCAÇÃO DIVINA!`, 'player_action');
  }
  if (eff === 'balada' && skill.baladaAtk) {
    Object.keys(state.players).forEach(pid => {
      const tp = state.players[pid];
      if (!tp.isAlive) return;
      const h = Math.min(tp.maxHp - tp.hp, skill.baladaHeal ?? 70);
      state.players[pid] = { ...tp, hp: tp.hp + h, buffs: { ...tp.buffs, tempAtkBonus: tp.buffs.tempAtkBonus + (skill.baladaAtk ?? 18), tempDefBonus: tp.buffs.tempDefBonus + (skill.baladaDef ?? 18), tempBonusTurns: Math.max(tp.buffs.tempBonusTurns, 4) } };
      log(state, `🎺 ${tp.name}: +${skill.baladaAtk}ATK +${skill.baladaDef}DEF +${h}HP`, 'player_action');
    });
  }
  if (eff === 'curse' && action.targetId) {
    const mIdx = state.currentMonsters.findIndex(m => m.id === action.targetId && m.hp > 0);
    if (mIdx !== -1) {
      state.currentMonsters[mIdx] = addMonsterEffect(state.currentMonsters[mIdx], { type: 'cursed', defReduction: skill.curseDef ?? 15, atkReduction: skill.curseAtk ?? 12, turnsLeft: skill.curseTurns ?? 6 });
      log(state, `🔮 ${p.name} [${transform.emoji}] MALDIÇÃO DIVINA! -${skill.curseDef}DEF -${skill.curseAtk}ATK!`, 'player_action');
    }
  }
  if (eff === 'mark' && action.targetId) {
    const mIdx = state.currentMonsters.findIndex(m => m.id === action.targetId && m.hp > 0);
    if (mIdx !== -1) {
      state.currentMonsters[mIdx] = addMonsterEffect(state.currentMonsters[mIdx], { type: 'marked', damageMultiplier: skill.markMult ?? 2.5, turnsLeft: skill.markTurns ?? 4 });
      log(state, `🎯 ${p.name} [${transform.emoji}] MARCA DIVINA! ×${skill.markMult}!`, 'player_action');
    }
  }
  if (eff === 'slow' && action.targetId && !skill.aoe) {
    const mIdx = state.currentMonsters.findIndex(m => m.id === action.targetId && m.hp > 0);
    if (mIdx !== -1) {
      state.currentMonsters[mIdx] = addMonsterEffect(state.currentMonsters[mIdx], { type: 'slowed', turnsLeft: 3 });
    }
  }
  if (eff === 'slow' && skill.aoe) {
    state.currentMonsters = state.currentMonsters.map(m => {
      if (m.hp <= 0) return m;
      return addMonsterEffect(m, { type: 'slowed', turnsLeft: 3 });
    });
    log(state, `❄️ Todos os inimigos lentos!`, 'system');
  }
  // Bastião / Guardian ult (Transform)
  if (eff === 'ult' && p.classType === 'guardian') {
    Object.keys(state.players).forEach(pid => {
      const tp = state.players[pid];
      if (!tp.isAlive) return;
      state.players[pid] = { ...tp, buffs: { ...tp.buffs, guardianUltTurnsLeft: 4 } };
    });
    log(state, `🗿 BASTIÃO DO DEUS! Grupo invulnerável por 4 turnos!`, 'level_up');
  }
  // Bard ult
  if (eff === 'ult' && p.classType === 'bard') {
    Object.keys(state.players).forEach(pid => {
      const tp = state.players[pid];
      if (!tp.isAlive) return;
      const h = Math.min(tp.maxHp - tp.hp, 80);
      state.players[pid] = { ...tp, hp: tp.hp + h, buffs: { ...tp.buffs, tempAtkBonus: tp.buffs.tempAtkBonus + 20, tempDefBonus: tp.buffs.tempDefBonus + 20, tempBonusTurns: Math.max(tp.buffs.tempBonusTurns, 5), regenHpPerTurn: tp.buffs.regenHpPerTurn + 30, regenTurnsLeft: Math.max(tp.buffs.regenTurnsLeft, 4) } };
      log(state, `🎼 ${tp.name}: +20ATK +20DEF +${h}HP`, 'player_action');
    });
  }
  // Necromancer ult (self heal)
  if (eff === 'ult' && p.classType === 'necromancer') {
    const healAmt = Math.min(p.maxHp - p.hp, skill.heal ?? 60);
    p.hp = p.hp + healAmt;
    state.players[playerId] = { ...state.players[playerId], hp: p.hp };
    if (healAmt > 0) log(state, `🩸 ${p.name} drena vida dos deuses mortos! +${healAmt}HP!`, 'player_action');
  }

  state.actionsThisTurn[playerId] = true;
  afterAction(state);
  return { ...state };
}

// ─── Apply regular skill effects ──────────────────────────────────────────────

function applySkillEffects(
  state: GameState, playerId: string, p: Player,
  skill: any, action: { targetId?: string }
): void {
  const eff = skill.effect;

  if (eff === 'ult' && p.classType === 'guardian') {
    Object.keys(state.players).forEach(pid => {
      const tp = state.players[pid];
      if (!tp.isAlive) return;
      state.players[pid] = { ...tp, buffs: { ...tp.buffs, guardianUltTurnsLeft: 3 } };
    });
    log(state, `🗿 BASTIÃO ETERNO! Grupo invulnerável por 3 turnos!`, 'level_up');
  }

  if (eff === 'ult' && p.classType === 'necromancer') {
    const healAmt = Math.min(p.maxHp - p.hp, skill.heal ?? 40);
    p.hp = p.hp + healAmt;
    state.players[playerId] = { ...state.players[playerId], hp: p.hp };
    if (healAmt > 0) log(state, `🩸 ${p.name} drena vida dos mortos! +${healAmt} HP!`, 'player_action');
  }

  if (eff === 'ult' && p.classType === 'bard') {
    Object.keys(state.players).forEach(pid => {
      const tp = state.players[pid];
      if (!tp.isAlive) return;
      const h = Math.min(tp.maxHp - tp.hp, 60);
      state.players[pid] = { ...tp, hp: tp.hp + h, buffs: { ...tp.buffs, tempAtkBonus: tp.buffs.tempAtkBonus + 12, tempDefBonus: tp.buffs.tempDefBonus + 12, tempBonusTurns: Math.max(tp.buffs.tempBonusTurns, 4), regenHpPerTurn: tp.buffs.regenHpPerTurn + 20, regenTurnsLeft: Math.max(tp.buffs.regenTurnsLeft, 3) } };
      log(state, `🎼 ${tp.name}: +12ATK +12DEF +${h}HP`, 'player_action');
    });
  }

  if (eff === 'poison' && !skill.damage && action.targetId) {
    const mIdx = state.currentMonsters.findIndex(m => m.id === action.targetId && m.hp > 0);
    if (mIdx !== -1) {
      state.currentMonsters[mIdx] = addMonsterEffect(state.currentMonsters[mIdx], { type: 'poisoned', damage: skill.poisonDmg ?? 8, turnsLeft: skill.poisonTurns ?? 4 });
      log(state, `☠️ ${state.currentMonsters[mIdx].name} envenenado!`, 'system');
    }
  }
  if (eff === 'stun' && !skill.damage && action.targetId) {
    const mIdx = state.currentMonsters.findIndex(m => m.id === action.targetId && m.hp > 0);
    if (mIdx !== -1) {
      state.currentMonsters[mIdx] = addMonsterEffect(state.currentMonsters[mIdx], { type: 'stunned', turnsLeft: skill.stunTurns ?? 2 });
      log(state, `😵 ${state.currentMonsters[mIdx].name} atordoado!`, 'system');
    }
  }
  if (eff === 'slow' && action.targetId && !skill.aoe) {
    const mIdx = state.currentMonsters.findIndex(m => m.id === action.targetId && m.hp > 0);
    if (mIdx !== -1) {
      state.currentMonsters[mIdx] = addMonsterEffect(state.currentMonsters[mIdx], { type: 'slowed', turnsLeft: 2 });
    }
  }
  if (eff === 'slow' && skill.aoe) {
    state.currentMonsters = state.currentMonsters.map(m => {
      if (m.hp <= 0) return m;
      return addMonsterEffect(m, { type: 'slowed', turnsLeft: 2 });
    });
  }
  if (eff === 'curse' && action.targetId) {
    const mIdx = state.currentMonsters.findIndex(m => m.id === action.targetId && m.hp > 0);
    if (mIdx !== -1) {
      state.currentMonsters[mIdx] = addMonsterEffect(state.currentMonsters[mIdx], { type: 'cursed', defReduction: skill.curseDef ?? 4, atkReduction: skill.curseAtk ?? 3, turnsLeft: skill.curseTurns ?? 4 });
      log(state, `🔮 ${p.name} amaldiçoa ${state.currentMonsters[mIdx].name}!`, 'player_action');
    }
  }
  if (eff === 'mark' && action.targetId) {
    const mIdx = state.currentMonsters.findIndex(m => m.id === action.targetId && m.hp > 0);
    if (mIdx !== -1) {
      state.currentMonsters[mIdx] = addMonsterEffect(state.currentMonsters[mIdx], { type: 'marked', damageMultiplier: skill.markMult ?? 1.5, turnsLeft: skill.markTurns ?? 3 });
      log(state, `🎯 ${p.name} marca ${state.currentMonsters[mIdx].name}! ×${skill.markMult}`, 'player_action');
    }
  }
  if (eff === 'defense_up') {
    const val = skill.defBonus ?? 8;
    const turns = skill.defBonusTurns ?? 2;
    const cp = state.players[playerId];
    state.players[playerId] = { ...cp, buffs: { ...cp.buffs, tempDefBonus: (cp.buffs.tempDefBonus ?? 0) + val, tempBonusTurns: Math.max(cp.buffs.tempBonusTurns ?? 0, turns) } };
    log(state, `🛡️ ${p.name} ativa ${skill.emoji}! +${val} DEF por ${turns}t`, 'player_action');
  }
  if (eff === 'group_atk_up') {
    const val = skill.atkGroupBonus ?? 4;
    const turns = skill.atkGroupTurns ?? 3;
    Object.keys(state.players).forEach(pid => {
      const tp = state.players[pid];
      if (!tp.isAlive) return;
      state.players[pid] = { ...tp, buffs: { ...tp.buffs, tempAtkBonus: tp.buffs.tempAtkBonus + val, tempBonusTurns: Math.max(tp.buffs.tempBonusTurns, turns) } };
    });
    log(state, `📣 ${p.name} usa ${skill.emoji}! TODOS +${val} ATK!`, 'player_action');
  }
  if (eff === 'necro_buff') {
    const dmg = skill.necroAtkBonus ?? 8;
    const turns = skill.necroBonusTurns ?? 5;
    Object.keys(state.players).forEach(pid => {
      const tp = state.players[pid];
      if (!tp.isAlive) return;
      state.players[pid] = { ...tp, buffs: { ...tp.buffs, necroBonusDmg: dmg, necroBonusTurnsLeft: turns } };
    });
    log(state, `💀 ${p.name} invoca Morto-Vivo! TODOS +${dmg} dano!`, 'player_action');
  }
  if (eff === 'balada') {
    const atkVal = skill.baladaAtk ?? 7;
    const defVal = skill.baladaDef ?? 7;
    const healVal = skill.baladaHeal ?? 30;
    Object.keys(state.players).forEach(pid => {
      const tp = state.players[pid];
      if (!tp.isAlive) return;
      const h = Math.min(tp.maxHp - tp.hp, healVal);
      state.players[pid] = { ...tp, hp: tp.hp + h, buffs: { ...tp.buffs, tempAtkBonus: tp.buffs.tempAtkBonus + atkVal, tempDefBonus: tp.buffs.tempDefBonus + defVal, tempBonusTurns: Math.max(tp.buffs.tempBonusTurns, 3) } };
    });
    log(state, `🎺 ${p.name} toca Balada Épica!`, 'player_action');
  }
  if (eff === 'aim') {
    const cp = state.players[playerId];
    state.players[playerId] = { ...cp, buffs: { ...cp.buffs, aimBonus: cp.buffs.aimBonus + (skill.aimBonus ?? 18) } };
    log(state, `🦅 ${p.name} mira! +${skill.aimBonus} no próximo ataque`, 'player_action');
  }
  if (eff === 'regen' && action.targetId) {
    const tp = state.players[action.targetId];
    if (tp) {
      state.players[action.targetId] = { ...tp, buffs: { ...tp.buffs, regenHpPerTurn: tp.buffs.regenHpPerTurn + (skill.regenHp ?? 15), regenTurnsLeft: Math.max(tp.buffs.regenTurnsLeft, skill.regenTurns ?? 4) } };
      log(state, `♻️ ${p.name} regenera ${tp.name}! +${skill.regenHp}HP/t`, 'player_action');
    }
  }
  if (eff === 'wall') {
    Object.keys(state.players).forEach(pid => {
      const tp = state.players[pid];
      if (!tp.isAlive) return;
      state.players[pid] = { ...tp, buffs: { ...tp.buffs, wallTurnsLeft: Math.max(tp.buffs.wallTurnsLeft, skill.wallTurns ?? 2) } };
    });
    log(state, `🏰 ${p.name} ergue Muralha! 20% dano por ${skill.wallTurns ?? 2}t!`, 'player_action');
  }
  if (eff === 'counter') {
    const cp = state.players[playerId];
    state.players[playerId] = { ...cp, buffs: { ...cp.buffs, counterReflect: skill.counterPct ?? 0.6 } };
    log(state, `🔄 ${p.name} prepara Contra-Ataque!`, 'player_action');
  }
  if (eff === 'berserk') {
    const cp = state.players[playerId];
    state.players[playerId] = { ...cp, buffs: { ...cp.buffs, tempAtkBonus: cp.buffs.tempAtkBonus + (skill.berserkAtkBonus ?? 8), tempDefBonus: cp.buffs.tempDefBonus - (skill.berserkDefPenalty ?? 3), tempBonusTurns: Math.max(cp.buffs.tempBonusTurns, skill.berserkTurns ?? 3), berserkTurnsLeft: skill.berserkTurns ?? 3 } };
    log(state, `😡 ${p.name} FRENESI!`, 'player_action');
  }
  if (eff === 'dodge') {
    const cp = state.players[playerId];
    state.players[playerId] = { ...cp, buffs: { ...cp.buffs, dodgeTurnsLeft: 2 } };
    log(state, `💨 ${p.name} ativa esquiva!`, 'player_action');
  }
  if (eff === 'taunt') {
    (state.players[playerId] as any).tauntTurns = 2;
    log(state, `${skill.emoji} ${p.name} provoca inimigos!`, 'player_action');
  }
  if (eff === 'revive' && action.targetId) {
    const tp = state.players[action.targetId];
    if (tp && !tp.isAlive) {
      const revHp = Math.floor(tp.maxHp * (skill.reviveHpPct ?? 0.4));
      state.players[action.targetId] = { ...tp, isAlive: true, hp: revHp };
      log(state, `✝️ ${p.name} ressuscita ${tp.name}!`, 'player_action');
    }
  }
}

// ─── boss ultimate execution ──────────────────────────────────────────────────

function executeBossUlt(state: GameState, monster: Monster, ult: BossUlt): Monster {
  log(state, `🌟 ${monster.emoji}${monster.name} usa a ULTIMATE: ${ult.emoji} ${ult.name}!`, 'level_up');

  state.activeUlt = {
    playerId: monster.id,
    playerName: monster.name,
    classType: 'warrior' as any,
    ultName: ult.name,
    ultLines: ult.lines,
    ultColor: ult.color,
    ultBg: ult.bg,
    ultEmoji: ult.emoji,
    isBossUlt: true,
    bossName: monster.name,
  };

  if (ult.aoeDamage) {
    Object.keys(state.players).forEach(pid => {
      const p = state.players[pid];
      if (!p.isAlive) return;
      if (p.buffs.guardianUltTurnsLeft > 0) {
        log(state, `🛡️ ${p.name} está invulnerável!`, 'monster_action');
        return;
      }
      let dmg = ult.aoeDamage!;
      if (p.buffs.wallTurnsLeft > 0) dmg = Math.max(1, Math.floor(dmg * 0.5));
      state.players[pid] = { ...p, hp: Math.max(0, p.hp - dmg) };
      log(state, `💥 ${ult.emoji} ${ult.name} atinge ${p.name}! ${dmg} dano!`, 'monster_action');
      if (state.players[pid].hp <= 0) {
        state.players[pid] = { ...state.players[pid], isAlive: false };
        log(state, `💀 ${p.name} foi derrotado!`, 'death');
      }
    });
  }

  let updatedMonster = { ...monster };
  if (ult.healSelf) {
    updatedMonster.hp = Math.min(updatedMonster.maxHp, updatedMonster.hp + ult.healSelf);
    log(state, `💚 ${monster.name} se cura ${ult.healSelf} HP!`, 'system');
  }
  if (ult.removeAllDebuffs) {
    updatedMonster.effects = [];
    log(state, `✨ ${monster.name} remove todos os debuffs!`, 'system');
  }
  if (ult.buffAtk && ult.buffAtkTurns) {
    updatedMonster.attack = updatedMonster.attack + ult.buffAtk;
    log(state, `⬆️ ${monster.name} +${ult.buffAtk} ATK!`, 'system');
  }
  if (ult.enrageMultiplier) {
    updatedMonster.attack = Math.floor(updatedMonster.attack * ult.enrageMultiplier);
    log(state, `🔥 ${monster.name} FÚRIA ETERNA! ATK ×${ult.enrageMultiplier}!`, 'level_up');
  }

  updatedMonster.ultTurnsLeft = updatedMonster.ultCooldown ?? 4;
  updatedMonster.ultUsed = true;

  return updatedMonster;
}

// ─── monster phase ────────────────────────────────────────────────────────────

function processMonsterTurns(state: GameState): void {
  state.turnPhase = 'monster_turns';
  log(state, `👹 Fase dos Monstros!`, 'system');

  const aliveMonsters = state.currentMonsters.filter(m => m.hp > 0);
  const alivePlayers = () => Object.values(state.players).filter(p => p.isAlive);

  state.currentMonsters = state.currentMonsters.map(monster => {
    if (!monster.isBoss || monster.enraged) return monster;
    if (monster.enrageThreshold && monster.hp / monster.maxHp <= monster.enrageThreshold) {
      const newAtk = monster.attack + (monster.enrageAtkBonus ?? 0);
      log(state, `🔴 ${monster.emoji}${monster.name} ENRAIVECEU! ATK +${monster.enrageAtkBonus}`, 'level_up');
      return { ...monster, attack: newAtk, enraged: true };
    }
    return monster;
  });

  state.currentMonsters = state.currentMonsters.map(monster => {
    if (!monster.isBoss || monster.hp <= 0 || !monster.bossUlt) return monster;
    const tl = (monster.ultTurnsLeft ?? 1) - 1;
    if (tl <= 0 && alivePlayers().length > 0) {
      return executeBossUlt(state, { ...monster, ultTurnsLeft: tl }, monster.bossUlt);
    }
    return { ...monster, ultTurnsLeft: tl };
  });

  state.currentMonsters = state.currentMonsters.map(monster => {
    if (monster.hp <= 0 || !monster.regenPerTurn) return monster;
    const heal = monster.regenPerTurn;
    const newHp = Math.min(monster.maxHp, monster.hp + heal);
    if (newHp > monster.hp) log(state, `💚 ${monster.emoji}${monster.name} regenera ${heal}HP!`, 'system');
    return { ...monster, hp: newHp };
  });

  aliveMonsters.forEach(monsterSnapshot => {
    if (alivePlayers().length === 0) return;
    const mIdx = state.currentMonsters.findIndex(m => m.id === monsterSnapshot.id);
    if (mIdx === -1) return;
    const monster = state.currentMonsters[mIdx];
    if (monster.hp <= 0) return;

    if (isMonsterStunned(monster)) {
      log(state, `😵 ${monster.emoji}${monster.name} está atordoado!`, 'monster_action');
      return;
    }

    const attackCount = monster.isBoss ? (monster.multiAttack ?? 1) : 1;
    const piercePct = monster.armorPierce ?? 0;

    for (let attackNum = 0; attackNum < attackCount; attackNum++) {
      if (alivePlayers().length === 0) break;
      const isSplash = monster.isBoss && Math.random() < (monster.splashChance ?? 0);

      if (isSplash) {
        log(state, `💢 ${monster.emoji}${monster.name} ATAQUE EXPLOSIVO!`, 'monster_action');
        Object.keys(state.players).forEach(pid => {
          const p = state.players[pid];
          if (!p.isAlive) return;
          if (p.buffs.dodgeTurnsLeft > 0) {
            log(state, `💨 ${p.name} ESQUIVA!`, 'monster_action');
            return;
          }
          if (p.buffs.guardianUltTurnsLeft > 0) {
            log(state, `🛡️ ${p.name} está invulnerável!`, 'monster_action');
            return;
          }
          const dice = rollDice();
          const effectiveDef = Math.floor(getEffectiveDef(p) * (1 - piercePct));
          const cursedAtk = monster.effects?.find(e => e.type === 'cursed');
          const monAtk = Math.max(1, monster.attack - (cursedAtk?.atkReduction ?? 0));
          let damage = Math.max(1, calculateDamage(monAtk, effectiveDef, dice));
          if (p.buffs.wallTurnsLeft > 0) damage = Math.max(1, Math.floor(damage * 0.2));
          state.players[pid] = { ...state.players[pid], hp: Math.max(0, p.hp - damage) };
          log(state, `  💥 ${p.name}: ${damage} dano`, 'monster_action');
          if (state.players[pid].hp <= 0) {
            state.players[pid] = { ...state.players[pid], isAlive: false };
            log(state, `💀 ${p.name} foi derrotado!`, 'death');
          }
        });
      } else {
        let targets = alivePlayers();
        if (targets.length === 0) break;
        const tauntTarget = targets.find(p => (p as any).tauntTurns > 0);
        const target = tauntTarget ?? targets[Math.floor(Math.random() * targets.length)];
        const tp = state.players[target.id];

        if (tp.buffs.dodgeTurnsLeft > 0) {
          log(state, `💨 ${target.name} ESQUIVA de ${monster.emoji}${monster.name}!`, 'monster_action');
          continue;
        }

        if (tp.buffs.guardianUltTurnsLeft > 0) {
          log(state, `🛡️ ${target.name} está invulnerável!`, 'monster_action');
          continue;
        }

        const dice = rollDice();
        const effectiveDef = Math.floor(getEffectiveDef(tp) * (1 - piercePct));
        const cursedAtk = monster.effects?.find(e => e.type === 'cursed');
        const monAtk = Math.max(1, monster.attack - (cursedAtk?.atkReduction ?? 0));
        const slowed = monster.effects?.some(e => e.type === 'slowed');
        let damage = Math.max(1, calculateDamage(monAtk, effectiveDef, dice));
        if (slowed) damage = Math.max(1, Math.floor(damage * 0.7));
        if (tp.buffs.wallTurnsLeft > 0) damage = Math.max(1, Math.floor(damage * 0.2));

        if (tp.buffs.counterReflect > 0) {
          const reflect = Math.max(1, Math.floor(damage * tp.buffs.counterReflect));
          const bossIdx = state.currentMonsters.findIndex(m => m.id === monster.id);
          if (bossIdx !== -1) {
            state.currentMonsters[bossIdx] = { ...state.currentMonsters[bossIdx], hp: Math.max(0, state.currentMonsters[bossIdx].hp - reflect) };
            log(state, `🔄 ${target.name} CONTRA-ATACA! ${reflect} dano refletido!`, 'player_action');
            if (state.currentMonsters[bossIdx].hp <= 0) onMonsterDeath(state, monster);
          }
          state.players[target.id] = { ...state.players[target.id], buffs: { ...state.players[target.id].buffs, counterReflect: 0 } };
        }

        state.players[target.id] = { ...state.players[target.id], hp: Math.max(0, state.players[target.id].hp - damage) };
        const hitLabel = attackCount > 1 ? ` (Golpe ${attackNum + 1}/${attackCount})` : '';
        log(state, `${monster.emoji}${monster.name} ataca ${target.name}${hitLabel}! [🎲${dice}] Dano: ${damage}`, 'monster_action');

        if (state.players[target.id].hp <= 0) {
          state.players[target.id] = { ...state.players[target.id], isAlive: false };
          log(state, `💀 ${target.name} foi derrotado!`, 'death');
        }
      }
    }
  });

  state.currentMonsters = state.currentMonsters.map(monster => {
    if (monster.hp <= 0) return monster;
    let hp = monster.hp;
    const newEffects: MonsterEffect[] = [];
    for (const e of monster.effects ?? []) {
      if (e.type === 'poisoned' && e.damage) {
        hp = Math.max(0, hp - e.damage);
        log(state, `☠️ ${monster.emoji}${monster.name} recebe ${e.damage} de veneno! (${e.turnsLeft - 1}t)`, 'system');
        if (hp <= 0) onMonsterDeath(state, monster);
      }
      if (e.turnsLeft - 1 > 0) newEffects.push({ ...e, turnsLeft: e.turnsLeft - 1 });
    }
    return { ...monster, hp, effects: newEffects };
  });

  Object.keys(state.players).forEach(pid => {
    let p = state.players[pid];
    if (!p.isAlive) return;
    const b = { ...p.buffs };

    if (b.regenTurnsLeft > 0) {
      const h = Math.min(p.maxHp - p.hp, b.regenHpPerTurn);
      p = { ...p, hp: p.hp + h };
      b.regenTurnsLeft--;
      if (b.regenTurnsLeft <= 0) b.regenHpPerTurn = 0;
      if (h > 0) log(state, `♻️ ${p.name} regenera ${h}HP!`, 'system');
    }

    if (b.tempBonusTurns > 0) {
      b.tempBonusTurns--;
      if (b.tempBonusTurns <= 0) { b.tempAtkBonus = 0; b.tempDefBonus = 0; }
    }
    if (b.necroBonusTurnsLeft > 0) {
      b.necroBonusTurnsLeft--;
      if (b.necroBonusTurnsLeft <= 0) b.necroBonusDmg = 0;
    }
    if (b.wallTurnsLeft > 0) {
      b.wallTurnsLeft--;
      if (b.wallTurnsLeft <= 0) log(state, `🏰 Muralha do grupo desmoronou!`, 'system');
    }
    if (b.guardianUltTurnsLeft > 0) {
      b.guardianUltTurnsLeft--;
      if (b.guardianUltTurnsLeft <= 0) log(state, `✨ ${p.name} deixa de estar invulnerável!`, 'system');
    }
    if (b.dodgeTurnsLeft > 0) b.dodgeTurnsLeft--;
    if ((p as any).tauntTurns > 0) (p as any).tauntTurns--;

    if (b.transformTurnsLeft > 0) {
      b.transformTurnsLeft--;
      if (b.transformTurnsLeft <= 0) {
        const transform = TRANSFORMS[p.classType];
        p = {
          ...p,
          attack: p.baseAttack,
          defense: p.baseDefense,
          maxHp: p.maxHp - transform.hpBonusFlat,
          hp: Math.max(1, p.hp - transform.hpBonusFlat),
        };
        log(state, `✨ Transformação de ${p.name} expirou. Retornou ao normal.`, 'system');
      } else {
        log(state, `🌟 ${p.name} [${TRANSFORMS[p.classType].emoji}]: ${b.transformTurnsLeft} turnos restantes.`, 'system');
      }
    }

    state.players[pid] = { ...p, buffs: b };
  });

  Object.keys(state.players).forEach(pid => {
    const p = state.players[pid];
    if (!p.isAlive) return;
    const mpRegen = Math.max(2, Math.floor(p.maxMp * 0.08));
    state.players[pid] = { ...p, mp: Math.min(p.maxMp, p.mp + mpRegen) };
  });
  log(state, `💎 Regen de Mana +8%.`, 'system');

  state.turn++;
  state.shopCountdown--;
  state.turnPhase = 'player_turns';
  state.actionsThisTurn = {};

  checkBattleEnd(state);
  if (state.phase === 'victory_shopping' || state.phase === 'defeat') return;

  if (state.shopCountdown <= 0) {
    state.phase = 'shopping';
    state.shopReady = {};
    Object.keys(state.players).forEach(pid => {
      state.players[pid] = { ...state.players[pid], coins: state.players[pid].coins + 30 };
    });
    log(state, `🛒 Pausa para loja! +30 moedas.`, 'system');
    return;
  }

  const first = state.playerOrder.find(pid => state.players[pid]?.isAlive);
  state.activePlayerId = first ?? null;
  log(state, `🎲 Turno ${state.turn}`, 'system');
  if (first) log(state, `🎯 Vez de ${state.players[first].name} agir!`, 'system');
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function afterAction(state: GameState): void {
  checkBattleEnd(state);
  if (state.phase === 'victory_shopping' || state.phase === 'defeat' || state.phase === 'shopping') return;
  advanceToNextPlayer(state);
}

function advanceToNextPlayer(state: GameState): void {
  const alive = state.playerOrder.filter(pid => state.players[pid]?.isAlive);
  if (alive.length === 0) return;
  const pending = alive.filter(pid => !state.actionsThisTurn[pid]);
  if (pending.length > 0) {
    state.activePlayerId = pending[0];
    log(state, `🎯 Vez de ${state.players[pending[0]].name} agir!`, 'system');
  } else {
    state.activePlayerId = null;
    processMonsterTurns(state);
  }
}

function checkBattleEnd(state: GameState): void {
  const aliveMonsters = state.currentMonsters.filter(m => m.hp > 0);
  const alivePlayers = Object.values(state.players).filter(p => p.isAlive);

  if (alivePlayers.length === 0) {
    state.phase = 'defeat';
    log(state, `💀 DERROTA!`, 'system');
    return;
  }

  if (aliveMonsters.length === 0) {
    const mapDef = MAPS.find(m => m.id === state.currentMap)!;
    const hadBoss = state.currentMonsters.some(m => m.isBoss);

    if (hadBoss && !state.bossDefeated) {
      state.bossDefeated = true;
      const nextMapId = (state.currentMap + 1) as MapId;
      if (nextMapId <= 12 && !state.unlockedMaps.includes(nextMapId)) {
        state.unlockedMaps.push(nextMapId);
        const nm = MAPS.find(m => m.id === nextMapId);
        if (nm) log(state, `🗺️ ${nm.theme} ${nm.name} desbloqueado!`, 'level_up');
      }

      if (state.currentMap === 7) {
        Object.keys(state.players).forEach(pid => {
          const p = state.players[pid];
          if (!p.inventory.some(i => i.isTransformItem)) {
            state.players[pid] = { ...p, inventory: [...p.inventory, { ...TRANSFORM_ITEM }] };
          }
        });
        log(state, `✨ O Deus Antigo deixou cair: 🌟 Essência do Deus Antigo! Todos os jogadores receberam!`, 'level_up');
        log(state, `🌟 Use a Essência em combate para TRANSFORMAR seu personagem por 6 turnos (uso único por combate)!`, 'level_up');
      }

      Object.keys(state.players).forEach(pid => {
        const p = state.players[pid];
        let updated = { ...p, xp: p.xp + mapDef.boss.xpReward, coins: p.coins + 100 };
        for (let i = 0; i < 5; i++) {
          const r = levelUp(updated);
          if (!r.didLevelUp) break;
          log(state, `🎉 ${updated.name} → Nível ${r.player.level}!`, 'level_up');
          updated = r.player;
        }
        state.players[pid] = { ...updated, hp: updated.maxHp, mp: updated.maxMp, isAlive: true };
      });
      log(state, `💰 +100 moedas e XP por matar o Boss!`, 'level_up');
      log(state, `🏆 VITÓRIA! ${mapDef.theme} ${mapDef.name} conquistado!`, 'system');
      state.phase = 'victory_shopping';

    } else if (!hadBoss) {
      log(state, `💥 Onda limpa! O BOSS aparece!`, 'system');
      const boss = { ...mapDef.boss, id: nanoid(), hp: mapDef.boss.maxHp, effects: [], enraged: false, ultUsed: false, ultTurnsLeft: mapDef.boss.ultCooldown ?? 4 };
      state.currentMonsters = [boss];
      state.actionsThisTurn = {};
      const first = state.playerOrder.find(pid => state.players[pid]?.isAlive);
      state.activePlayerId = first ?? null;
      if (first) log(state, `🎯 Vez de ${state.players[first].name} agir!`, 'system');
      if (mapDef.boss.multiAttack && mapDef.boss.multiAttack > 1) {
        log(state, `⚠️ ${mapDef.boss.name} ataca ${mapDef.boss.multiAttack}× por turno!`, 'level_up');
      }
      if (mapDef.boss.bossUlt) {
        log(state, `⚠️ ${mapDef.boss.name} tem um ULTIMATE!`, 'level_up');
      }
      if (state.currentMap === 7) {
        log(state, `🌟 Derrote o Deus Antigo para obter a Essência da Transformação!`, 'level_up');
      }
    }
  }
}

function onMonsterDeath(state: GameState, monster: Monster): void {
  log(state, `💀 ${monster.emoji}${monster.name} foi derrotado!`, 'system');
  distributeRewards(state, monster);
}

function distributeRewards(state: GameState, monster: Monster): void {
  const alive = Object.values(state.players).filter(p => p.isAlive);
  const xpEach = Math.ceil(monster.xpReward / alive.length);
  const coinsEach = Math.ceil(monster.coinReward / alive.length);
  state.groupCoins += monster.coinReward;
  alive.forEach(p => {
    let up = { ...p, xp: p.xp + xpEach, coins: p.coins + coinsEach };
    const r = levelUp(up);
    if (r.didLevelUp) log(state, `🎉 ${p.name} → Nível ${r.player.level}!`, 'level_up');
    state.players[p.id] = r.player;
  });
  log(state, `💰 +${monster.coinReward} moedas · +${xpEach}XP`, 'system');
}

function groupNecroBuff(state: GameState): number {
  return Object.values(state.players)
    .filter(p => p.isAlive && p.buffs.necroBonusTurnsLeft > 0)
    .map(p => p.buffs.necroBonusDmg)
    .reduce((a, b) => Math.max(a, b), 0);
}

function isMonsterStunned(m: Monster): boolean {
  return (m.effects ?? []).some(e => e.type === 'stunned' && e.turnsLeft > 0);
}

function applyMonsterCurse(m: Monster): number {
  const curse = (m.effects ?? []).find(e => e.type === 'cursed');
  return Math.max(0, m.defense - (curse?.defReduction ?? 0));
}

function getMarkMult(m: Monster): number {
  const mark = (m.effects ?? []).find(e => e.type === 'marked');
  return mark?.damageMultiplier ?? 1;
}

// ─── next map / reset ─────────────────────────────────────────────────────────

export function proceedToNextMap(state: GameState): GameState {
  const nextId = (state.currentMap + 1) as MapId;
  if (nextId > 12) {
    log(state, `🌟 PARABÉNS! Você derrotou o DEUS DO VAZIO!`, 'level_up');
    state.phase = 'defeat';
    return { ...state };
  }
  Object.keys(state.players).forEach(pid => {
    const p = state.players[pid];
    state.players[pid] = {
      ...resetPlayerCombatBuffs(p),
      hp: p.maxHp,
      mp: p.maxMp,
      isAlive: true,
    };
  });
  state.currentMap = nextId;
  state.phase = 'map_selection';
  state.bossDefeated = false;
  state.waveNumber = 0;
  state.currentMonsters = [];
  state.actionsThisTurn = {};
  state.activePlayerId = null;
  state.activeUlt = null;
  const nm = MAPS.find(m => m.id === nextId)!;
  log(state, `🗺️ Avançando para ${nm.theme} ${nm.name}!`, 'system');
  log(state, `💚 HP e MP restaurados!`, 'system');
  return { ...state };
}

export function resetRoom(roomId: string): void {
  global.gameRooms.delete(roomId);
}