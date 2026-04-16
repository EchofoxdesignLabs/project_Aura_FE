import { useGameStore } from '@core/store/game.store';
import { useMediaStore } from '@core/store/media.store';
import { useAuthStore } from '@core/store/auth.store';
import { VideoTile } from './components/VideoTile';

export function ProximityIndicator() {
  const inMeeting = useGameStore((s) => s.inMeeting);
  const players = useGameStore((s) => s.players);
  const localPlayerId = useGameStore((s) => s.localPlayerId);

  const remoteStreams = useMediaStore((s) => s.remoteStreams);
  const peerMediaStates = useMediaStore((s) => s.peerMediaStates);
  const screenSharingUsers = useMediaStore((s) => s.screenSharingUsers);
  const localStream = useMediaStore((s) => s.localStream);
  const isMicOn = useMediaStore((s) => s.isMicOn);
  const isCameraOn = useMediaStore((s) => s.isCameraOn);

  const localUser = useAuthStore((s) => s.user);

  // Only render when NOT in a meeting
  if (inMeeting) return null;

  // Only show when we have active streams or local media
  const activePeerIds = Object.keys(remoteStreams);
  if (activePeerIds.length === 0 && !localStream) return null;

  // Check if any nearby peer is screen sharing
  const screensharingPeerId = activePeerIds.find((id) =>
    screenSharingUsers.includes(id),
  );

  return (
    <div
      className="animate-slideUp"
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      {/* ─── Video bubbles row (top-right, like Gather) ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          backgroundColor: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(10px)',
          borderRadius: 50,
          border: '1px solid rgba(255,255,255,0.08)',
          pointerEvents: 'auto',
        }}
      >
        {/* ─── Self-view bubble ─── */}
        {localStream && (
          <div title="You" className="animate-scaleIn">
            <VideoTile
              stream={localStream}
              userName={localUser?.name ?? 'You'}
              userId={localPlayerId ?? ''}
              isLocal={true}
              isMuted={!isMicOn}
              isCameraOn={isCameraOn}
              size="sm"
              shape="circle"
            />
          </div>
        )}

        {/* ─── Divider ─── */}
        {activePeerIds.length > 0 && (
          <div
            style={{
              width: 1,
              height: 40,
              backgroundColor: 'rgba(255,255,255,0.1)',
            }}
          />
        )}

        {/* ─── Remote peer bubbles ─── */}
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
              isCameraOn={
                !!remoteStreams[userId] && 
                (peerMediaStates[userId]?.isCameraOn ?? true) && 
                !screenSharingUsers.includes(userId)
              }
              size="sm"
              shape="circle"
            />
          </div>
        ))}
      </div>

      {/* ─── Screen share tile (below bubbles, top-right) ─── */}
      {screensharingPeerId && (
        <div
          className="animate-scaleIn"
          style={{
            width: 320,
            height: 180,
            borderRadius: 12,
            overflow: 'hidden',
            border: '2px solid rgba(59,130,246,0.5)',
            backgroundColor: '#000',
            pointerEvents: 'auto',
          }}
        >
          <VideoTile
            stream={remoteStreams[screensharingPeerId]}
            userName={players[screensharingPeerId]?.name ?? 'Unknown'}
            userId={screensharingPeerId}
            isMuted={false}
            isCameraOn={true}
            isScreenShare={true}
            size="full"
            shape="rect"
          />
        </div>
      )}
    </div>
  );
}
