'use client';

import { GameState, ClassType } from '@/lib/types';
import { CLASSES, SKILLS } from '@/lib/gameData';
import styles from './ClassSelection.module.css';

interface Props {
  gameState: GameState;
  myId: string;
  onSelectClass: (classType: ClassType) => void;
  onReady: () => void;
}

export default function ClassSelection({ gameState, myId, onSelectClass, onReady }: Props) {
  const myPlayer = gameState.players[myId];
  const selectedClass = myPlayer?.classType;
  const isReady = myPlayer?.isReady;

  // Classes already picked by OTHER players
  const takenClasses = new Set(
    Object.values(gameState.players)
      .filter(p => p.id !== myId && p.classType)
      .map(p => p.classType)
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>⚔ Escolha sua Classe</h2>
        <p className={styles.subtitle}>12 classes disponíveis — cada classe só pode ser escolhida por um jogador</p>
      </div>

      <div className={styles.grid}>
        {(Object.entries(CLASSES) as [ClassType, typeof CLASSES[ClassType]][]).map(([key, cls]) => {
          const isSelected = selectedClass === key;
          const isTaken = takenClasses.has(key) && !isSelected;
          const skills = SKILLS[key];

          return (
            <div
              key={key}
              className={`${styles.card} ${isSelected ? styles.selected : ''} ${isTaken ? styles.takenCard : ''}`}
              onClick={() => !isReady && !isTaken && onSelectClass(key)}
              style={{ '--cls-color': isTaken ? '#3a3a3a' : cls.color } as React.CSSProperties}
              title={isTaken ? 'Já escolhida por outro jogador' : ''}
            >
              {isTaken && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 5,
                  background: 'rgba(5,5,8,0.75)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  borderRadius: 10, gap: 6,
                }}>
                  <span style={{ fontSize: 24 }}>🔒</span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
                    Ocupada
                  </span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-secondary)' }}>
                    {Object.values(gameState.players).find(p => p.classType === key && p.id !== myId)?.name ?? ''}
                  </span>
                </div>
              )}

              <div className={styles.cardHeader}>
                <span className={styles.emoji}>{cls.emoji}</span>
                <div>
                  <h3 className={styles.className}>{cls.name}</h3>
                  <p className={styles.classDesc}>{cls.description}</p>
                </div>
              </div>

              <div className={styles.stats}>
                <StatBar label="HP"  value={cls.baseStats.hp}      max={160} color="var(--hp-color)" />
                <StatBar label="MP"  value={cls.baseStats.mp}      max={140} color="var(--mp-color)" />
                <StatBar label="ATK" value={cls.baseStats.attack}  max={15}  color="var(--accent-red-bright)" />
                <StatBar label="DEF" value={cls.baseStats.defense} max={14}  color="var(--accent-blue-bright)" />
              </div>

              <div className={styles.skillList}>
                {skills.map((sk, i) => (
                  <div key={i} className={`${styles.skill} ${i >= 3 ? styles.specialSkill : ''}`}>
                    <span>{sk.emoji}</span>
                    <span className={styles.skillName}>{sk.name}</span>
                    {sk.mpCost > 0
                      ? <span className={styles.mpCost}>{sk.mpCost}MP</span>
                      : <span className={styles.freeCost}>livre</span>}
                  </div>
                ))}
              </div>

              {isSelected && <div className={styles.selectedBadge}>✓ Selecionado</div>}
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <div className={styles.playerStatus}>
          {Object.values(gameState.players).map(p => (
            <div key={p.id} className={styles.playerChip}>
              <span>{CLASSES[p.classType]?.emoji || '?'}</span>
              <span>{p.name}</span>
              {p.id === myId && <span className={styles.you}>(você)</span>}
              {p.isReady
                ? <span className={styles.readyDot} title="Pronto" />
                : <span className={styles.notReadyDot} title="Não pronto" />}
            </div>
          ))}
        </div>

        <button
          className={styles.readyBtn}
          onClick={onReady}
          disabled={isReady || !selectedClass}
        >
          {isReady ? '✓ Pronto!' : 'Confirmar Classe'}
        </button>
      </div>
    </div>
  );
}

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className={styles.statRow}>
      <span className={styles.statLabel}>{label}</span>
      <div className={styles.statTrack}>
        <div className={styles.statFill} style={{ width: `${(value / max) * 100}%`, background: color }} />
      </div>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}