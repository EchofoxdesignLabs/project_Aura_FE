import { useState } from 'react';
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Maximize2, Minimize2 } from 'lucide-react';
import { useGameStore } from '@core/store/game.store';
import { useMediaStore } from '@core/store/media.store';
import { useAuthStore } from '@core/store/auth.store';
import { VideoTile } from './components/VideoTile';

function getGridCols(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count <= 2) return 'grid-cols-2';
  return 'grid-cols-3';
}

export function MeetingOverlay() {
  const inMeeting = useGameStore((s) => s.inMeeting);
  const meetingParticipants = useGameStore((s) => s.meetingParticipants);
  const meetingZoneId = useGameStore((s) => s.meetingZoneId);
  const zones = useGameStore((s) => s.zones);
  const players = useGameStore((s) => s.players);
  const localPlayerId = useGameStore((s) => s.localPlayerId);

  const remoteStreams = useMediaStore((s) => s.remoteStreams);
  const peerMediaStates = useMediaStore((s) => s.peerMediaStates);
  const screenSharingUsers = useMediaStore((s) => s.screenSharingUsers);
  const localStream = useMediaStore((s) => s.localStream);
  const screenStream = useMediaStore((s) => s.screenStream);
  const isMicOn = useMediaStore((s) => s.isMicOn);
  const isCameraOn = useMediaStore((s) => s.isCameraOn);
  const isScreenSharing = useMediaStore((s) => s.isScreenSharing);
  const toggleMic = useMediaStore((s) => s.toggleMic);
  const toggleCamera = useMediaStore((s) => s.toggleCamera);
  const startScreenShare = useMediaStore((s) => s.startScreenShare);
  const stopScreenShare = useMediaStore((s) => s.stopScreenShare);

  const localUser = useAuthStore((s) => s.user);

  const [isExpanded, setIsExpanded] = useState(false);

  if (!inMeeting) return null;

  // ─── Determine layout data ───
  const activeSharer = screenSharingUsers.find(
    (id) => meetingParticipants.includes(id) || id === localPlayerId,
  );
  const isLocalSharing = activeSharer === localPlayerId;
  const isScreenShareMode = !!activeSharer || isScreenSharing;

  const meetingZone = zones.find((z) => z.id === meetingZoneId);
  const roomName = meetingZone?.name ?? 'Meeting Room';

  const remoteParticipants = meetingParticipants.filter(
    (id) => id !== localPlayerId,
  );

  function getScreenShareStream() {
    if (isScreenSharing && screenStream) return screenStream;
    if (activeSharer && remoteStreams[activeSharer]) return remoteStreams[activeSharer];
    return null;
  }

  const screenSharerName = isLocalSharing
    ? (localUser?.name ?? 'You')
    : (activeSharer ? (players[activeSharer]?.name ?? 'Unknown') : '');

  // ─── Controls bar (shared by both modes) ───
  const controlsBar = (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleMic}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
          isMicOn
            ? 'bg-slate-700 text-white hover:bg-slate-600'
            : 'bg-rose-500/20 text-rose-500 hover:bg-rose-500/30'
        }`}
        title={isMicOn ? 'Mute' : 'Unmute'}
      >
        {isMicOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
      </button>

      <button
        onClick={toggleCamera}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
          isCameraOn
            ? 'bg-slate-700 text-white hover:bg-slate-600'
            : 'bg-rose-500/20 text-rose-500 hover:bg-rose-500/30'
        }`}
        title={isCameraOn ? 'Stop Video' : 'Start Video'}
      >
        {isCameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
      </button>

      <button
        onClick={isScreenSharing ? stopScreenShare : startScreenShare}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
          isScreenSharing
            ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
            : 'bg-slate-700 text-white hover:bg-slate-600'
        }`}
        title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
      >
        {isScreenSharing ? <MonitorOff className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
      </button>
    </div>
  );

  // ════════════════════════════════════════════════════
  //  EXPANDED MODE — Full-screen meeting view
  // ════════════════════════════════════════════════════
  if (isExpanded) {
    const gridCols = getGridCols(remoteParticipants.length);

    return (
      <div
        className="absolute inset-0 flex flex-col animate-fadeIn"
        style={{
          backgroundColor: 'rgba(3, 7, 18, 0.92)',
          backdropFilter: 'blur(16px)',
          zIndex: 30,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 15 }}>📹</span>
            <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 15 }}>
              {roomName}
            </span>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 20,
                backgroundColor: 'rgba(34,197,94,0.15)',
                color: '#4ade80',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {remoteParticipants.length + 1} in room
            </span>
            {isScreenShareMode && (
              <span style={{ fontSize: 12, color: '#60a5fa' }}>
                🖥️ {isLocalSharing ? 'You are sharing' : `${screenSharerName} is sharing`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {controlsBar}
            <div style={{ width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <button
              onClick={() => setIsExpanded(false)}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              style={{ fontSize: 13 }}
            >
              <Minimize2 className="h-4 w-4" />
              Office View
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {isScreenShareMode ? (
            <div className="flex flex-1 gap-3 p-4">
              {/* Featured screen share */}
              <div
                className="flex-1 rounded-xl overflow-hidden"
                style={{ border: '1px solid rgba(59,130,246,0.3)', backgroundColor: '#000' }}
              >
                <VideoTile
                  stream={getScreenShareStream()}
                  userName={screenSharerName}
                  userId={activeSharer ?? localPlayerId ?? ''}
                  isLocal={isLocalSharing}
                  isMuted={!isMicOn}
                  isCameraOn={true}
                  isScreenShare={true}
                  size="full"
                  shape="rect"
                />
              </div>
              {/* Sidebar */}
              <div className="flex flex-col gap-2 overflow-y-auto" style={{ width: 160 }}>
                <div style={{ height: 90, flexShrink: 0 }} className="rounded-lg overflow-hidden">
                  <VideoTile
                    stream={localStream}
                    userName={localUser?.name ?? 'You'}
                    userId={localPlayerId ?? ''}
                    isLocal={true}
                    isMuted={!isMicOn}
                    isCameraOn={isCameraOn}
                    size="full"
                    shape="rect"
                  />
                </div>
                {remoteParticipants.map((userId) => (
                  <div key={userId} style={{ height: 90, flexShrink: 0 }} className="rounded-lg overflow-hidden">
                    <VideoTile
                      stream={remoteStreams[userId] ?? null}
                      userName={players[userId]?.name ?? 'Unknown'}
                      userId={userId}
                      isMuted={!(peerMediaStates[userId]?.isMicOn ?? true)}
                      isCameraOn={!!remoteStreams[userId] && (peerMediaStates[userId]?.isCameraOn ?? true) && !screenSharingUsers.includes(userId)}
                      size="full"
                      shape="rect"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={`flex-1 grid ${gridCols} gap-3 p-4 overflow-y-auto auto-rows-fr`}>
              {remoteParticipants.map((userId) => (
                <div
                  key={userId}
                  className="rounded-xl overflow-hidden animate-scaleIn"
                  style={{ minHeight: 180, border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <VideoTile
                    stream={remoteStreams[userId] ?? null}
                    userName={players[userId]?.name ?? 'Unknown'}
                    userId={userId}
                    isMuted={!(peerMediaStates[userId]?.isMicOn ?? true)}
                    isCameraOn={!!remoteStreams[userId] && (peerMediaStates[userId]?.isCameraOn ?? true)}
                    size="full"
                    shape="rect"
                  />
                </div>
              ))}
              {remoteParticipants.length === 0 && (
                <div
                  className="flex flex-col items-center justify-center rounded-xl"
                  style={{ minHeight: 200, border: '1px dashed rgba(255,255,255,0.1)', color: '#64748b' }}
                >
                  <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
                  <div style={{ fontSize: 14 }}>Waiting for others to join…</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Self-view PiP (non-screen-share mode only) */}
        {!isScreenShareMode && localStream && (
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              right: 24,
              width: 160,
              height: 90,
              borderRadius: 12,
              overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.15)',
              zIndex: 10,
            }}
          >
            <VideoTile
              stream={localStream}
              userName={localUser?.name ?? 'You'}
              userId={localPlayerId ?? ''}
              isLocal={true}
              isMuted={!isMicOn}
              isCameraOn={isCameraOn}
              size="full"
              shape="rect"
            />
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════
  //  COLLAPSED MODE — Gather-style top strip
  //  Game world is visible, user can walk freely
  // ════════════════════════════════════════════════════
  return (
    <div
      className="animate-slideUp"
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      {/* ─── Meeting strip ─── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px',
          backgroundColor: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(12px)',
          borderRadius: 50,
          border: '1px solid rgba(255,255,255,0.1)',
          pointerEvents: 'auto',
        }}
      >
        {/* Room badge */}
        <div className="flex items-center gap-1.5" style={{ marginRight: 4 }}>
          <span style={{ fontSize: 14 }}>📹</span>
          <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>
            {roomName}
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.12)' }} />

        {/* Self-view bubble */}
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

        {/* Remote participant bubbles */}
        {remoteParticipants.map((userId) => (
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
                !!remoteStreams[userId] && (peerMediaStates[userId]?.isCameraOn ?? true) && !screenSharingUsers.includes(userId)
              }
              size="sm"
              shape="circle"
            />
          </div>
        ))}

        {/* Divider */}
        <div style={{ width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.12)' }} />

        {/* Inline controls */}
        {controlsBar}

        {/* Expand button */}
        <button
          onClick={() => setIsExpanded(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-white hover:bg-slate-600 transition-colors"
          title="Expand Meeting"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* ─── Screen share tile (below strip) ─── */}
      {isScreenShareMode && (
        <div
          className="animate-scaleIn"
          style={{
            width: 360,
            height: 200,
            borderRadius: 12,
            overflow: 'hidden',
            border: '2px solid rgba(59,130,246,0.5)',
            backgroundColor: '#000',
            pointerEvents: 'auto',
          }}
        >
          <VideoTile
            stream={getScreenShareStream()}
            userName={screenSharerName}
            userId={activeSharer ?? localPlayerId ?? ''}
            isLocal={isLocalSharing}
            isMuted={!isMicOn}
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
