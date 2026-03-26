'use client';

import { useState } from 'react';
import { GameState } from '@/lib/types';
import styles from './Lobby.module.css';

interface Props {
  gameState: GameState;
  myId: string;
  onJoin: (name: string) => void;
}

export default function Lobby({ gameState, myId, onJoin }: Props) {
  const [name, setName] = useState('');
  const isInRoom = !!gameState.players[myId];
  const playerCount = Object.keys(gameState.players).length;

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <div className={styles.runes}>✦ ◆ ✦ ◆ ✦</div>
        <h1 className={styles.title}>Yard of Spirits</h1>
        <p className={styles.subtitle}>Batalha em Turnos — Multijogador</p>
        <div className={styles.runes}>⚔ ✦ ⚔ ✦ ⚔</div>
      </div>

      <div className={styles.content}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>⚔ Sala de Espera</h2>
          <p className={styles.playerCount}>{playerCount}/6 aventureiros presentes</p>

          <div className={styles.playerList}>
            {Object.values(gameState.players).map(p => (
              <div key={p.id} className={styles.playerRow}>
                <span className={styles.playerDot} />
                <span className={styles.playerName}>{p.name}</span>
                {p.id === myId && <span className={styles.youBadge}>Você</span>}
                {p.isReady && <span className={styles.readyBadge}>✓ Pronto</span>}
              </div>
            ))}
            {Array.from({ length: Math.max(0, 1 - playerCount) }).map((_, i) => (
              <div key={i} className={styles.playerRowEmpty}>
                <span className={styles.playerDotEmpty} />
                <span className={styles.playerNameEmpty}>Aguardando aventureiro...</span>
              </div>
            ))}
          </div>

          {!isInRoom ? (
            <div className={styles.joinForm}>
              <input
                className={styles.input}
                type="text"
                placeholder="Seu nome de guerra..."
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && name.trim() && onJoin(name.trim())}
                maxLength={20}
              />
              <button
                className={styles.joinBtn}
                onClick={() => name.trim() && onJoin(name.trim())}
                disabled={!name.trim()}
              >
                Entrar nos Mortos
              </button>
            </div>
          ) : (
            <p className={styles.waiting}>⌛ Aguardando todos escolherem sua classe...</p>
          )}
        </div>

        <div className={styles.infoCard}>
          <h3 className={styles.infoTitle}>📜 Atenção Viajantes!</h3>
          <ul className={styles.infoList}>
            <li>1–6 aventureiros unem-se e escolhem suas classes</li>
            <li>12 classes únicas — cada uma exclusiva por jogador</li>
            <li>Explore 12 mapas com dificuldade crescente</li>
            <li>Combate em turnos: cada herói age um por vez</li>
            <li>A loja abre periodicamente — todos devem confirmar para continuar</li>
            <li>Derrote o Deus Corrompido para desbloquear a Transformação</li>
            <li>⚠️ Progresso perdido se o servidor reiniciar</li>
          </ul>
        </div>
      </div>
    </div>
  );
}