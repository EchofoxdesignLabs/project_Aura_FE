import { useGameStore } from '@core/store/game.store';
import { webRTCManager } from '@core/services/webrtc.manager';
import { proximitySystem } from './ProximitySystem';

export class MeetingSystem {
  private unsubscribe: (() => void) | null = null;
  private connectedParticipants: Set<string> = new Set();

  public init(): void {
    console.log('[MeetingSystem] Initialized');
    
    // Subscribe to the game store to watch for meeting state changes
    this.unsubscribe = useGameStore.subscribe(
      (state) => ({
        inMeeting: state.inMeeting,
        participants: state.meetingParticipants,
        localPlayerId: state.localPlayerId
      }),
      (current, previous) => this.handleStateChange(current, previous),
      { 
        equalityFn: (a, b) => 
          a.inMeeting === b.inMeeting && 
          a.participants.join() === b.participants.join() && 
          a.localPlayerId === b.localPlayerId 
      }
    );
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.disconnectAll();
    console.log('[MeetingSystem] Destroyed');
  }

  private handleStateChange(
    current: { inMeeting: boolean; participants: string[]; localPlayerId: string | null },
    previous: { inMeeting: boolean; participants: string[]; localPlayerId: string | null }
  ): void {
    // 1. Transition into a meeting
    if (current.inMeeting && !previous.inMeeting) {
      console.log('[MeetingSystem] Entered meeting mode');
      proximitySystem.stop(); // Stop distance-based audio
      this.syncParticipants(current.participants, current.localPlayerId);
    } 
    // 2. Update existing meeting (someone joined or left the room)
    else if (current.inMeeting && previous.inMeeting) {
      this.syncParticipants(current.participants, current.localPlayerId);
    } 
    // 3. Transition out of a meeting
    else if (!current.inMeeting && previous.inMeeting) {
      console.log('[MeetingSystem] Left meeting mode');
      this.disconnectAll();
      proximitySystem.start(); // Resume distance-based audio
    }
  }

  private syncParticipants(participants: string[], localPlayerId: string | null): void {
    const currentSet = new Set(participants);
    
    // Connect to new participants
    for (const userId of participants) {
      if (userId === localPlayerId) continue;
      
      if (!this.connectedParticipants.has(userId)) {
        console.log('[MeetingSystem] Connecting to new participant', userId);
        this.connectedParticipants.add(userId);
        webRTCManager.connectToPeer(userId);
        // Volume defaults to 1.0 when the audio node is created in ontrack.
        // No need to call setAudioVolume here — the gain node doesn't exist yet.
      }
    }

    // Disconnect from participants who left
    for (const userId of this.connectedParticipants) {
      if (!currentSet.has(userId)) {
        console.log('[MeetingSystem] Participant left', userId);
        this.connectedParticipants.delete(userId);
        webRTCManager.disconnectPeer(userId);
      }
    }
  }

  private disconnectAll(): void {
    for (const userId of this.connectedParticipants) {
      webRTCManager.disconnectPeer(userId);
    }
    this.connectedParticipants.clear();
  }
}

export const meetingSystem = new MeetingSystem();