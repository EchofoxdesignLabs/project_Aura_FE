import { sfuManager } from '@core/services/sfu/sfu.manager';
import { useGameStore } from '@core/store/game.store';

import { proximitySystem } from './ProximitySystem';

export class MeetingSystem {
  private unsubscribe: (() => void) | null = null;

  public init(): void {
    console.log('[MeetingSystem] Initialized');

    this.unsubscribe = useGameStore.subscribe(
      (state) => ({
        inMeeting: state.inMeeting,
        participants: state.meetingParticipants,
        localPlayerId: state.localPlayerId,
      }),
      (current, previous) => this.handleStateChange(current, previous),
      {
        equalityFn: (a, b) =>
          a.inMeeting === b.inMeeting &&
          a.participants.join() === b.participants.join() &&
          a.localPlayerId === b.localPlayerId,
      },
    );
  }

  public destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    console.log('[MeetingSystem] Destroyed');
  }

  private handleStateChange(
    current: { inMeeting: boolean; participants: string[]; localPlayerId: string | null },
    previous: { inMeeting: boolean; participants: string[]; localPlayerId: string | null },
  ): void {
    if (current.inMeeting && !previous.inMeeting) {
      console.log('[MeetingSystem] Entered meeting mode');
      proximitySystem.stop();
      this.setMeetingVolumes(current.participants, current.localPlayerId);
      return;
    }

    if (current.inMeeting && previous.inMeeting) {
      this.setMeetingVolumes(current.participants, current.localPlayerId);
      return;
    }

    if (!current.inMeeting && previous.inMeeting) {
      console.log('[MeetingSystem] Left meeting mode');
      proximitySystem.start();
    }
  }

  private setMeetingVolumes(
    participants: string[],
    localPlayerId: string | null,
  ): void {
    for (const userId of participants) {
      if (userId !== localPlayerId) {
        sfuManager.setAudioVolume(userId, 1);
      }
    }
  }
}

export const meetingSystem = new MeetingSystem();
