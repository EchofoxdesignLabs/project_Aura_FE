import { useAuthStore } from '@core/store/auth.store';
import { useGameStore } from '@core/store/game.store';
import { useMediaStore } from '@core/store/media.store';

import { VideoTile } from './components/VideoTile';

export function ProximityIndicator() {
  const inMeeting = useGameStore((state) => state.inMeeting);
  const players = useGameStore((state) => state.players);
  const localPlayerId = useGameStore((state) => state.localPlayerId);
  const remoteStreams = useMediaStore((state) => state.remoteStreams);
  const peerMediaStates = useMediaStore((state) => state.peerMediaStates);
  const localStream = useMediaStore((state) => state.localStream);
  const isMicOn = useMediaStore((state) => state.isMicOn);
  const localUser = useAuthStore((state) => state.user);

  if (inMeeting) {
    return null;
  }

  const activePeerIds = Object.keys(remoteStreams);
  if (activePeerIds.length === 0 && !localStream) {
    return null;
  }

  return (
    <div
      className="animate-slideUp"
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        backgroundColor: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(10px)',
        borderRadius: 50,
        border: '1px solid rgba(255,255,255,0.08)',
        zIndex: 20,
        pointerEvents: 'auto',
      }}
    >
      {localStream && (
        <div title="You" className="animate-scaleIn">
          <VideoTile
            stream={localStream}
            userName={localUser?.name ?? 'You'}
            userId={localPlayerId ?? ''}
            isLocal={true}
            isMuted={!isMicOn}
            isCameraOn={false}
            size="sm"
            shape="circle"
          />
        </div>
      )}

      {activePeerIds.length > 0 && (
        <div
          style={{
            width: 1,
            height: 40,
            backgroundColor: 'rgba(255,255,255,0.1)',
          }}
        />
      )}

      {activePeerIds.map((userId) => (
        <div
          key={userId}
          title={players[userId]?.name ?? userId}
          className="animate-scaleIn"
        >
          <VideoTile
            stream={remoteStreams[userId] ?? null}
            userName={players[userId]?.name ?? 'Unknown'}
            userId={userId}
            isMuted={!(peerMediaStates[userId]?.isMicOn ?? true)}
            isCameraOn={false}
            size="sm"
            shape="circle"
          />
        </div>
      ))}
    </div>
  );
}
