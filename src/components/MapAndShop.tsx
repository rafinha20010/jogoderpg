'use client';

import { GameState, MapId } from '@/lib/types';
import { MAPS, SHOP_ITEMS, CLASSES } from '@/lib/gameData';
import styles from './MapAndShop.module.css';

interface Props {
  gameState: GameState;
  myId: string;
  onSelectMap: (mapId: MapId) => void;
  onBuyItem: (itemId: string) => void;
  onShopReady: () => void;
  onProceedToNextMap: () => void;
}

export default function MapAndShop({ gameState, myId, onSelectMap, onBuyItem, onShopReady, onProceedToNextMap }: Props) {
  const myPlayer = gameState.players[myId];
  const phase = gameState.phase;
  const isMidCombatShop = phase === 'shopping' && gameState.turn > 0;
  const isVictoryShop = phase === 'victory_shopping';
  const isShopPhase = isMidCombatShop || isVictoryShop;
  const currentMap = MAPS.find(m => m.id === gameState.currentMap);
  const nextMapId = (gameState.currentMap + 1) as MapId;
  const nextMap = MAPS.find(m => m.id === nextMapId);
  const amIReady = !!gameState.shopReady?.[myId];
  const alivePlayers = Object.values(gameState.players).filter(p => p.isAlive);
  const readyCount = alivePlayers.filter(p => gameState.shopReady?.[p.id]).length;
  const totalCount = alivePlayers.length;

  return (
    <div className={styles.container}>
      {phase === 'map_selection' && (
        <div className={styles.mapSection}>
          <h2 className={styles.sectionTitle}>🗺 Escolha o Mapa</h2>
          <p className={styles.hint}>Qualquer jogador pode escolher o destino da aventura</p>

          <div className={styles.mapGrid}>
            {MAPS.map(map => {
              const isUnlocked = gameState.unlockedMaps.includes(map.id);
              return (
                <div
                  key={map.id}
                  className={`${styles.mapCard} ${!isUnlocked ? styles.locked : ''}`}
                  onClick={() => isUnlocked && onSelectMap(map.id)}
                  style={{ '--map-bg': map.bgColor } as React.CSSProperties}
                >
                  {!isUnlocked && <div className={styles.lockOverlay}><span>🔒</span><span>Bloqueado</span></div>}

                  <div className={styles.mapTheme}>{map.theme}</div>
                  <h3 className={styles.mapName}>{map.name}</h3>
                  <span className={`${styles.diffBadge} ${getDiffClass(map.difficulty, styles)}`}>
                    {map.difficulty}
                  </span>
                  <p className={styles.mapDesc}>{map.description}</p>

                  <div className={styles.mapEffects}>
                    {map.defenseDebuff > 0 && (
                      <div className={styles.effect + ' ' + styles.debuff}>
                        🛡️ -{map.defenseDebuff * 100}% Defesa
                      </div>
                    )}
                    {map.manaCostMultiplier > 1 && (
                      <div className={styles.effect + ' ' + styles.debuff}>
                        💎 Mana x{map.manaCostMultiplier}
                      </div>
                    )}
                    {map.defenseDebuff === 0 && map.manaCostMultiplier === 1 && (
                      <div className={styles.effect + ' ' + styles.neutral}>
                        ✅ Sem penalidades
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(phase === 'shopping' || phase === 'victory_shopping') && (
        <div className={styles.shopSection}>
          <div className={styles.shopHeader}>
            <div>
              {isVictoryShop && (
                <div className={styles.victoryBanner}>
                  🏆 VITÓRIA! {currentMap?.theme} {currentMap?.name} conquistado!
                </div>
              )}
              <h2 className={styles.sectionTitle}>
                {isVictoryShop ? '🛒 Loja Pós-Vitória' : isMidCombatShop ? '⚔️ Pausa de Combate — Loja' : '🛒 Loja do Aventureiro'}
              </h2>
              <p className={styles.hint}>
                Mapa: {currentMap?.name} |
                {gameState.turn > 0 && ` Turno: ${gameState.turn} |`}
                Moedas do grupo: <span className={styles.coins}>💰 {gameState.groupCoins}</span>
              </p>
              {isMidCombatShop && (
                <p className={styles.shopWarning}>
                  ⚠️ Após a loja, o combate continua por mais 3 turnos antes da próxima pausa.
                </p>
              )}
              {isVictoryShop && nextMap && (
                <p className={styles.shopWarning} style={{ borderColor: 'rgba(39,174,96,0.4)', color: 'var(--accent-green-bright)', background: 'rgba(39,174,96,0.08)' }}>
                  ➡️ Próximo mapa: {nextMap.theme} {nextMap.name} ({nextMap.difficulty})
                </p>
              )}
              {isVictoryShop && !nextMap && (
                <p className={styles.shopWarning} style={{ borderColor: 'rgba(212,160,23,0.4)', color: 'var(--accent-gold-bright)', background: 'rgba(212,160,23,0.08)' }}>
                  🌟 Você completou todos os mapas disponíveis!
                </p>
              )}
            </div>

            <div className={styles.readySection}>
              <div className={styles.readyList}>
                {alivePlayers.map(p => (
                  <div key={p.id} className={styles.readyChip}>
                    <span>{CLASSES[p.classType].emoji}</span>
                    <span>{p.name}</span>
                    {gameState.shopReady?.[p.id]
                      ? <span className={styles.readyDot}>✅</span>
                      : <span className={styles.notReadyDot}>⌛</span>}
                  </div>
                ))}
              </div>

              <div className={styles.readyCounter}>
                {readyCount}/{totalCount} prontos
              </div>

              <button
                className={amIReady ? styles.cancelReadyBtn : styles.readyBtn}
                onClick={onShopReady}
              >
                {amIReady
                  ? '❌ Cancelar Pronto'
                  : isVictoryShop
                    ? `➡️ Pronto para ${nextMap ? nextMap.name : 'Fim de Jogo'}!`
                    : '⚔️ Pronto para Combate!'}
              </button>
            </div>
          </div>

          <div className={styles.shopLayout}>
            <div className={styles.shopItems}>
              <h3 className={styles.shopSubtitle}>Equipamentos Disponíveis</h3>
              <div className={styles.itemGrid}>
                {SHOP_ITEMS.map(item => {
                  const ownedItem = myPlayer?.inventory.find(i => i.id === item.id);
                  const alreadyOwned = !item.consumable && !!ownedItem;
                  const canAfford = (myPlayer?.coins ?? 0) >= item.price;

                  return (
                    <div
                      key={item.id}
                      className={`${styles.itemCard} ${alreadyOwned ? styles.owned : ''} ${!canAfford && !alreadyOwned ? styles.cantAfford : ''}`}
                    >
                      <div className={styles.itemEmoji}>{item.emoji}</div>
                      <div className={styles.itemInfo}>
                        <div className={styles.itemName}>
                          {item.name}
                          {item.consumable && <span className={styles.consumableBadge}>consumível</span>}
                        </div>
                        <div className={styles.itemDesc}>{item.description}</div>
                      </div>
                      <div className={styles.itemActions}>
                        <div className={styles.itemPrice}>💰 {item.price}</div>
                        {alreadyOwned ? (
                          <span className={styles.ownedBadge}>Equipado</span>
                        ) : (
                          <button
                            className={styles.buyBtn}
                            onClick={() => onBuyItem(item.id)}
                            disabled={!canAfford}
                          >
                            {item.consumable && ownedItem ? `+${item.quantity ?? 1}` : 'Comprar'}
                          </button>
                        )}
                        {item.consumable && ownedItem && (
                          <span className={styles.qtyBadge}>x{ownedItem.quantity}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.playerStats}>
              <h3 className={styles.shopSubtitle}>Seus Stats</h3>
              {myPlayer && (
                <div className={styles.statCard}>
                  <div className={styles.playerHeader}>
                    <span className={styles.playerEmoji}>{CLASSES[myPlayer.classType].emoji}</span>
                    <div>
                      <div className={styles.playerName}>{myPlayer.name}</div>
                      <div className={styles.playerClass}>{CLASSES[myPlayer.classType].name} Nv.{myPlayer.level}</div>
                    </div>
                    <div className={styles.playerCoins}>💰 {myPlayer.coins}</div>
                  </div>

                  <div className={styles.statGrid}>
                    <div className={styles.statItem}>
                      <span className={styles.statIcon}>❤️</span>
                      <span className={styles.statVal}>{myPlayer.hp}/{myPlayer.maxHp} HP</span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statIcon}>💎</span>
                      <span className={styles.statVal}>{myPlayer.mp}/{myPlayer.maxMp} MP</span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statIcon}>⚔️</span>
                      <span className={styles.statVal}>{myPlayer.attack} ATK</span>
                    </div>
                    <div className={styles.statItem}>
                      <span className={styles.statIcon}>🛡️</span>
                      <span className={styles.statVal}>{myPlayer.defense} DEF</span>
                    </div>
                  </div>

                  {myPlayer.inventory.length > 0 && (
                    <div className={styles.inventory}>
                      <div className={styles.invTitle}>Inventário:</div>
                      <div className={styles.invItems}>
                        {myPlayer.inventory.map(i => (
                          <span key={i.id} className={styles.invItem} title={i.description}>
                            {i.emoji} {i.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className={styles.allPlayers}>
                <h3 className={styles.shopSubtitle}>Grupo</h3>
                {Object.values(gameState.players).map(p => (
                  <div key={p.id} className={styles.memberRow}>
                    <span>{CLASSES[p.classType].emoji}</span>
                    <span className={styles.memberName}>{p.name}</span>
                    <span className={styles.memberClass}>{CLASSES[p.classType].name}</span>
                    <span style={{ fontSize: 12, color: 'var(--hp-color)' }}>❤️{p.hp}</span>
                    <span style={{ fontSize: 12, color: 'var(--mp-color)' }}>💎{p.mp}</span>
                    {p.id === myId && <span className={styles.you}>você</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getDiffClass(difficulty: string, styles: Record<string, string>): string {
  const map: Record<string, string> = {
    'Iniciante': styles.diff_iniciante,
    'Intermediário': styles.diff_intermediario,
    'Avançado': styles.diff_avancado,
    'Épico': styles.diff_epico,
    'Lendário': styles.diff_lendario,
    'Infernal': styles.diff_infernal,
    'Divino': styles.diff_divino,
  };
  return map[difficulty] ?? '';
}