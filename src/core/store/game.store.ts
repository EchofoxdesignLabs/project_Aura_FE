import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type {
  AvatarConfig,
  OfficeStateOffice,
  PlayerState,
  ZoneSnapshot,
  ZoneType,
} from '@core/types';

export type OfficeMetadata = OfficeStateOffice;

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
  selectedDeskZoneId: string | null;
  hoveredDeskZoneId: string | null;
  navigationTarget: { x: number; y: number } | null;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
  currentZone: CurrentZone | null;
  inMeeting: boolean;
  meetingZoneId: string | null;
  meetingParticipants: string[];
}

export interface GameState extends GameStoreData {
  setOffice: (office: OfficeMetadata, zones: ZoneSnapshot[]) => void;
  setLocalPlayerId: (id: string | null) => void;
  addPlayer: (player: PlayerState) => void;
  removePlayer: (userId: string) => void;
  updatePlayerPosition: (userId: string, x: number, y: number) => void;
  updatePlayerAvatar: (userId: string, avatarConfig: AvatarConfig) => void;
  setAllPlayers: (players: PlayerState[]) => void;
  setSelectedDeskZoneId: (zoneId: string | null) => void;
  setHoveredDeskZoneId: (zoneId: string | null) => void;
  updateDeskAssignment: (
    zoneId: string,
    assignedUserId: string | null,
    assignedUserName: string | null,
  ) => void;
  setNavigationTarget: (target: { x: number; y: number } | null) => void;
  setConnectionStatus: (status: GameStoreData['connectionStatus']) => void;
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
    selectedDeskZoneId: null,
    hoveredDeskZoneId: null,
    navigationTarget: null,
    connectionStatus: 'disconnected',
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
    setOffice: (office, zones) =>
      set((state) => ({
        ...createInitialGameData(),
        currentOfficeId: office.id,
        officeData: { ...office },
        zones: [...zones],
        localPlayerId: state.localPlayerId,
        connectionStatus: 'connected',
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
    updatePlayerAvatar: (userId, avatarConfig) =>
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
              avatarConfig,
            },
          },
        };
      }),
    setAllPlayers: (players) =>
      set(() => ({
        players: mapPlayers(players),
      })),
    setSelectedDeskZoneId: (zoneId) => set(() => ({ selectedDeskZoneId: zoneId })),
    setHoveredDeskZoneId: (zoneId) => set(() => ({ hoveredDeskZoneId: zoneId })),
    updateDeskAssignment: (zoneId, assignedUserId, assignedUserName) =>
      set((state) => ({
        zones: state.zones.map((zone) =>
          zone.id === zoneId
            ? {
                ...zone,
                assignedUserId,
                assignedUserName,
              }
            : zone,
        ),
      })),
    setNavigationTarget: (target) =>
      set(() => ({
        navigationTarget: target ? { ...target } : null,
      })),
    setConnectionStatus: (status) => set(() => ({ connectionStatus: status })),
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
