import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type { PlayerState, ZoneSnapshot, ZoneType } from '@core/types';

export interface OfficeMetadata {
  width: number;
  height: number;
  name: string;
}

export interface CurrentZone {
  id: string;
  name: string;
  type: ZoneType;
}

interface GameStoreData {
  currentOfficeId: string | null;
  officeData: OfficeMetadata | null;
  zones: ZoneSnapshot[];
  players: Record<string, PlayerState>;
  localPlayerId: string | null;
  currentZone: CurrentZone | null;
  inMeeting: boolean;
  meetingZoneId: string | null;
  meetingParticipants: string[];
}

export interface GameState extends GameStoreData {
  setOffice: (id: string, data: OfficeMetadata, zones: ZoneSnapshot[]) => void;
  setLocalPlayerId: (id: string | null) => void;
  addPlayer: (player: PlayerState) => void;
  removePlayer: (userId: string) => void;
  updatePlayerPosition: (userId: string, x: number, y: number) => void;
  setAllPlayers: (players: PlayerState[]) => void;
  setCurrentZone: (zone: CurrentZone | null) => void;
  enterMeeting: (zoneId: string, participants: string[]) => void;
  addMeetingParticipant: (userId: string) => void;
  removeMeetingParticipant: (userId: string) => void;
  leaveMeeting: () => void;
  reset: () => void;
}

function createInitialGameData(): GameStoreData {
  return {
    currentOfficeId: null,
    officeData: null,
    zones: [],
    players: {},
    localPlayerId: null,
    currentZone: null,
    inMeeting: false,
    meetingZoneId: null,
    meetingParticipants: [],
  };
}

function mapPlayers(players: PlayerState[]): Record<string, PlayerState> {
  return players.reduce<Record<string, PlayerState>>((playerMap, player) => {
    playerMap[player.userId] = player;
    return playerMap;
  }, {});
}

function dedupeParticipants(participants: string[]): string[] {
  return [...new Set(participants)];
}

export const useGameStore = create<GameState>()(
  subscribeWithSelector((set) => ({
    ...createInitialGameData(),
    setOffice: (id, data, zones) =>
      set((state) => ({
        ...createInitialGameData(),
        currentOfficeId: id,
        officeData: { ...data },
        zones: [...zones],
        localPlayerId: state.localPlayerId,
      })),
    setLocalPlayerId: (id) => set(() => ({ localPlayerId: id })),
    addPlayer: (player) =>
      set((state) => ({
        players: {
          ...state.players,
          [player.userId]: player,
        },
      })),
    removePlayer: (userId) =>
      set((state) => {
        if (!state.players[userId]) {
          return {};
        }

        const remainingPlayers = { ...state.players };
        delete remainingPlayers[userId];
        return {
          players: remainingPlayers,
          meetingParticipants: state.meetingParticipants.filter(
            (participantId) => participantId !== userId,
          ),
        };
      }),
    updatePlayerPosition: (userId, x, y) =>
      set((state) => {
        const existingPlayer = state.players[userId];
        if (!existingPlayer) {
          return {};
        }

        return {
          players: {
            ...state.players,
            [userId]: {
              ...existingPlayer,
              x,
              y,
            },
          },
        };
      }),
    setAllPlayers: (players) =>
      set(() => ({
        players: mapPlayers(players),
      })),
    setCurrentZone: (zone) =>
      set(() => ({
        currentZone: zone ? { ...zone } : null,
      })),
    enterMeeting: (zoneId, participants) =>
      set(() => ({
        inMeeting: true,
        meetingZoneId: zoneId,
        meetingParticipants: dedupeParticipants(participants),
      })),
    addMeetingParticipant: (userId) =>
      set((state) => {
        if (state.localPlayerId === userId || state.meetingParticipants.includes(userId)) {
          return {};
        }

        return {
          meetingParticipants: [...state.meetingParticipants, userId],
        };
      }),
    removeMeetingParticipant: (userId) =>
      set((state) => {
        if (!state.meetingParticipants.includes(userId)) {
          return {};
        }

        return {
          meetingParticipants: state.meetingParticipants.filter(
            (participantId) => participantId !== userId,
          ),
        };
      }),
    leaveMeeting: () =>
      set(() => ({
        inMeeting: false,
        meetingZoneId: null,
        meetingParticipants: [],
      })),
    reset: () => set(() => createInitialGameData()),
  })),
);
