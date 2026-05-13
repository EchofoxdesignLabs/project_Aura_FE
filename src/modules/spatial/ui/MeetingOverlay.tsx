import { useState } from 'react';
import { Camera, CameraOff, Maximize2, Mic, MicOff, Minimize2, Monitor, MonitorOff } from 'lucide-react';

import { useAuthStore } from '@core/store/auth.store';
import { useGameStore } from '@core/store/game.store';
import { useMediaStore } from '@core/store/media.store';

import { VideoTile } from './components/VideoTile';

function getGridCols(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count <= 2) return 'grid-cols-2';
  return 'grid-cols-3';
}

export function MeetingOverlay() {
  const inMeeting = useGameStore((state) => state.inMeeting);
  const meetingParticipants = useGameStore((state) => state.meetingParticipants);
  const meetingZoneId = useGameStore((state) => state.meetingZoneId);
  const zones = useGameStore((state) => state.zones);
  const players = useGameStore((state) => state.players);
  const localPlayerId = useGameStore((state) => state.localPlayerId);
  const remoteMedia = useMediaStore((state) => state.remoteMedia);
  const peerMediaStates = useMediaStore((state) => state.peerMediaStates);
  const localStream = useMediaStore((state) => state.localStream);
  const screenStream = useMediaStore((state) => state.screenStream);
  const isMicOn = useMediaStore((state) => state.isMicOn);
  const isCameraOn = useMediaStore((state) => state.isCameraOn);
  const isScreenSharing = useMediaStore((state) => state.isScreenSharing);
  const toggleMic = useMediaStore((state) => state.toggleMic);
  const toggleCamera = useMediaStore((state) => state.toggleCamera);
  const startScreenShare = useMediaStore((state) => state.startScreenShare);
  const stopScreenShare = useMediaStore((state) => state.stopScreenShare);
  const screenSharingUsers = useMediaStore((state) => state.screenSharingUsers);
  const localUser = useAuthStore((state) => state.user);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!inMeeting) {
    return null;
  }

  const meetingZone = zones.find((zone) => zone.id === meetingZoneId);
  const roomName = meetingZone?.name ?? 'Meeting Room';
  const remoteParticipants = meetingParticipants.filter(
    (id) => id !== localPlayerId,
  );

  // Find the active screen sharer (local or remote)
  const activeScreenSharer = isScreenSharing
    ? localPlayerId
    : screenSharingUsers.find((uid) => meetingParticipants.includes(uid)) ?? null;

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
            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600'
        }`}
        title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
      >
        {isCameraOn ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
      </button>

      <button
        onClick={isScreenSharing ? stopScreenShare : startScreenShare}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
          isScreenSharing
            ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600'
        }`}
        title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
      >
        {isScreenSharing ? <MonitorOff className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
      </button>
    </div>
  );

  if (isExpanded) {
    return (
      <div
        className="absolute inset-0 flex flex-col animate-fadeIn"
        style={{
          backgroundColor: 'rgba(3, 7, 18, 0.92)',
          backdropFilter: 'blur(16px)',
          zIndex: 30,
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-3">
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
          </div>

          <div className="flex items-center gap-3">
            {controlsBar}
            <div style={{ width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <button
              onClick={() => setIsExpanded(false)}
              className="flex items-center gap-2 rounded-full bg-slate-700 px-3 py-1.5 text-slate-300 transition-colors hover:bg-slate-600"
              style={{ fontSize: 13 }}
            >
              <Minimize2 className="h-4 w-4" />
              Office View
            </button>
          </div>
        </div>

        {/* ─── Featured screen share tile ─── */}
        {activeScreenSharer && (
          <div
            className="mx-4 mt-3 overflow-hidden rounded-xl"
            style={{
              minHeight: 240,
              maxHeight: '50vh',
              border: '1px solid rgba(59,130,246,0.3)',
              backgroundColor: '#000',
            }}
          >
            <VideoTile
              videoStream={
                activeScreenSharer === localPlayerId
                  ? screenStream
                  : remoteMedia[activeScreenSharer]?.screen ?? null
              }
              audioStream={
                activeScreenSharer === localPlayerId
                  ? localStream
                  : remoteMedia[activeScreenSharer]?.mic ?? null
              }
              userName={
                activeScreenSharer === localPlayerId
                  ? (localUser?.name ?? 'You')
                  : (players[activeScreenSharer]?.name ?? 'Unknown')
              }
              userId={activeScreenSharer}
              isLocal={activeScreenSharer === localPlayerId}
              isMuted={false}
              isCameraOn={true}
              isScreenShare={true}
              size="full"
              shape="rect"
            />
          </div>
        )}

        <div className={`grid flex-1 ${getGridCols(remoteParticipants.length + 1)} gap-3 overflow-y-auto p-4 auto-rows-fr`}>
          <div
            className="animate-scaleIn overflow-hidden rounded-xl"
            style={{ minHeight: 180, border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <VideoTile
              videoStream={localStream}
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
            <div
              key={userId}
              className="animate-scaleIn overflow-hidden rounded-xl"
              style={{ minHeight: 180, border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <VideoTile
                videoStream={remoteMedia[userId]?.camera ?? null}
                audioStream={remoteMedia[userId]?.mic ?? null}
                userName={players[userId]?.name ?? 'Unknown'}
                userId={userId}
                isMuted={!(peerMediaStates[userId]?.isMicOn ?? true)}
                isCameraOn={!!(peerMediaStates[userId]?.isCameraOn)}
                size="full"
                shape="rect"
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="animate-slideUp"
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        backgroundColor: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(12px)',
        borderRadius: 50,
        border: '1px solid rgba(255,255,255,0.1)',
        zIndex: 20,
        pointerEvents: 'auto',
      }}
    >
      <div className="flex items-center gap-1.5" style={{ marginRight: 4 }}>
        <span style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600 }}>
          {roomName}
        </span>
      </div>

      <div style={{ width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.12)' }} />

      {localStream && (
        <div title="You" className="animate-scaleIn">
          <VideoTile
            videoStream={localStream}
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

      {remoteParticipants.map((userId) => (
        <div
          key={userId}
          title={players[userId]?.name ?? userId}
          className="animate-scaleIn"
        >
          <VideoTile
            videoStream={remoteMedia[userId]?.camera ?? null}
            audioStream={remoteMedia[userId]?.mic ?? null}
            userName={players[userId]?.name ?? 'Unknown'}
            userId={userId}
            isMuted={!(peerMediaStates[userId]?.isMicOn ?? true)}
            isCameraOn={!!(peerMediaStates[userId]?.isCameraOn)}
            size="sm"
            shape="circle"
          />
        </div>
      ))}

      <div style={{ width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.12)' }} />

      {controlsBar}

      <button
        onClick={() => setIsExpanded(true)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-white transition-colors hover:bg-slate-600"
        title="Expand Meeting"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
    </div>
  );
}
