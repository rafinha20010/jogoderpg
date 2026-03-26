'use client';

import { useSocket } from '@/hooks/useSocket';
import { ClassType, MapId } from '@/lib/types';
import Lobby from '@/components/Lobby';
import ClassSelection from '@/components/ClassSelection';
import MapAndShop from '@/components/MapAndShop';
import Combat from '@/components/Combat';
import styles from './page.module.css';

export default function GamePage() {
  const { gameState, connected, myId, emit } = useSocket();

  if (!connected || !gameState) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingSpinner} />
        <p className={styles.loadingText}>Conectando ao servidor...</p>
      </div>
    );
  }

  const phase = gameState.phase;

  if (phase === 'lobby' || (!gameState.players[myId] && phase === 'class_selection')) {
    return (
      <Lobby
        gameState={gameState}
        myId={myId}
        onJoin={(name) => emit('player_join', { name })}
      />
    );
  }

  if (phase === 'class_selection') {
    return (
      <ClassSelection
        gameState={gameState}
        myId={myId}
        onSelectClass={(classType: ClassType) => emit('select_class', { classType })}
        onReady={() => emit('player_ready')}
      />
    );
  }

  if (phase === 'map_selection' || phase === 'shopping' || phase === 'victory_shopping') {
    return (
      <MapAndShop
        gameState={gameState}
        myId={myId}
        onSelectMap={(mapId: MapId) => emit('select_map', { mapId })}
        onBuyItem={(itemId: string) => emit('buy_item', { itemId })}
        onShopReady={() => emit('shop_ready')}
        onProceedToNextMap={() => emit('proceed_to_next_map')}
      />
    );
  }

  if (phase === 'combat' || phase === 'defeat') {
    return (
      <Combat
        gameState={gameState}
        myId={myId}
        onAction={(action) => emit('player_action', action)}
        onReset={() => emit('reset_game')}
        onClearUlt={() => emit('clear_ult')}
        onTransform={() => emit('use_transform')}
      />
    );
  }

  return (
    <div className={styles.loading}>
      <p className={styles.loadingText}>Phase: {phase}</p>
    </div>
  );
}