'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState } from '@/lib/types';

let socket: Socket | null = null;

export function useSocket() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [myId, setMyId] = useState<string>('');
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Initialize socket connection
    fetch('/api/socket').finally(() => {
      socket = io(window.location.origin, {
        path: '/api/socket',
        addTrailingSlash: false,
      });

      socket.on('connect', () => {
        setConnected(true);
        setMyId(socket!.id ?? '');
      });

      socket.on('disconnect', () => {
        setConnected(false);
      });

      socket.on('game_state', (state: GameState) => {
        setGameState(state);
      });
    });

    return () => {
      socket?.disconnect();
      socket = null;
      initialized.current = false;
    };
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    socket?.emit(event, data);
  }, []);

  return { gameState, connected, myId, emit };
}