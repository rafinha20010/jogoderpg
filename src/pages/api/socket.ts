import { Server as SocketIOServer } from 'socket.io';
import { NextApiRequest, NextApiResponse } from 'next';
import { Server as NetServer } from 'http';
import { Socket as NetSocket } from 'net';
import {
  getOrCreateRoom,
  joinRoom,
  selectClass,
  setPlayerReady,
  selectMap,
  buyItem,
  startCombat,
  continueCombat,
  processPlayerAction,
  proceedToNextMap,
  toggleShopReady,
  saveRoom,
  resetRoom,
  clearUlt,
  useTransform,
} from '@/lib/gameEngine';

interface SocketServer extends NetServer {
  io?: SocketIOServer;
}

interface SocketWithIO extends NetSocket {
  server: SocketServer;
}

interface NextApiResponseWithSocket extends NextApiResponse {
  socket: SocketWithIO;
}

const ROOM_ID = 'main-room';

export default function handler(req: NextApiRequest, res: NextApiResponseWithSocket) {
  if (res.socket.server.io) {
    res.end();
    return;
  }

  const io = new SocketIOServer(res.socket.server, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  res.socket.server.io = io;

  io.on('connection', (socket) => {
    console.log(`[Socket] Player connected: ${socket.id}`);

    socket.join(ROOM_ID);

    const state = getOrCreateRoom(ROOM_ID);
    socket.emit('game_state', state);

    socket.on('player_join', ({ name }: { name: string }) => {
      let state = getOrCreateRoom(ROOM_ID);
      state = joinRoom(state, socket.id, name);
      saveRoom(state);
      io.to(ROOM_ID).emit('game_state', state);
    });

    socket.on('select_class', ({ classType }: { classType: string }) => {
      let state = getOrCreateRoom(ROOM_ID);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state = selectClass(state, socket.id, classType as any);
      saveRoom(state);
      io.to(ROOM_ID).emit('game_state', state);
    });

    socket.on('player_ready', () => {
      let state = getOrCreateRoom(ROOM_ID);
      state = setPlayerReady(state, socket.id);
      saveRoom(state);
      io.to(ROOM_ID).emit('game_state', state);
    });

    socket.on('select_map', ({ mapId }: { mapId: number }) => {
      let state = getOrCreateRoom(ROOM_ID);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state = selectMap(state, socket.id, mapId as any);
      saveRoom(state);
      io.to(ROOM_ID).emit('game_state', state);
    });

    socket.on('buy_item', ({ itemId }: { itemId: string }) => {
      let state = getOrCreateRoom(ROOM_ID);
      state = buyItem(state, socket.id, itemId);
      saveRoom(state);
      io.to(ROOM_ID).emit('game_state', state);
    });

    socket.on('start_combat', () => {
      let state = getOrCreateRoom(ROOM_ID);
      state = startCombat(state);
      saveRoom(state);
      io.to(ROOM_ID).emit('game_state', state);
    });

    socket.on('continue_combat', () => {
      let state = getOrCreateRoom(ROOM_ID);
      state = continueCombat(state);
      saveRoom(state);
      io.to(ROOM_ID).emit('game_state', state);
    });

    socket.on('player_action', (action: { type: string; targetId?: string; skillIndex?: number; itemId?: string }) => {
      let state = getOrCreateRoom(ROOM_ID);
      state = processPlayerAction(state, socket.id, action);
      saveRoom(state);
      io.to(ROOM_ID).emit('game_state', state);
    });

    socket.on('use_transform', () => {
      let state = getOrCreateRoom(ROOM_ID);
      state = useTransform(state, socket.id);
      saveRoom(state);
      io.to(ROOM_ID).emit('game_state', state);
    });

    socket.on('shop_ready', () => {
      let state = getOrCreateRoom(ROOM_ID);
      state = toggleShopReady(state, socket.id);
      saveRoom(state);
      io.to(ROOM_ID).emit('game_state', state);
    });

    socket.on('proceed_to_next_map', () => {
      let state = getOrCreateRoom(ROOM_ID);
      state = proceedToNextMap(state);
      saveRoom(state);
      io.to(ROOM_ID).emit('game_state', state);
    });

    socket.on('clear_ult', () => {
      let state = getOrCreateRoom(ROOM_ID);
      state = clearUlt(state);
      saveRoom(state);
      io.to(ROOM_ID).emit('game_state', state);
    });

    socket.on('reset_game', () => {
      resetRoom(ROOM_ID);
      const newState = getOrCreateRoom(ROOM_ID);
      io.to(ROOM_ID).emit('game_state', newState);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Player disconnected: ${socket.id}`);
      const state = getOrCreateRoom(ROOM_ID);
      if (state.players[socket.id]) {
        const name = state.players[socket.id].name;
        delete state.players[socket.id];
        state.playerOrder = state.playerOrder.filter(id => id !== socket.id);
        delete state.actionsThisTurn[socket.id];
        if (Object.keys(state.players).length === 0) state.phase = 'lobby';
        if (state.activePlayerId === socket.id) {
          const nextAlive = state.playerOrder.find(pid => state.players[pid]?.isAlive && !state.actionsThisTurn[pid]);
          state.activePlayerId = nextAlive ?? null;
        }
        state.combatLog.push({ id: Math.random().toString(), turn: state.turn, message: `${name} saiu da sala.`, type: 'system', timestamp: Date.now() });
        saveRoom(state);
        io.to(ROOM_ID).emit('game_state', state);
      }
    });
  });

  res.end();
}