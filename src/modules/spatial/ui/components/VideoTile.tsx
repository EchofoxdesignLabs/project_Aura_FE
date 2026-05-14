import { useEffect, useRef, useState } from 'react';

interface VideoTileProps {
  videoStream: MediaStream | null;
  audioStream?: MediaStream | null;
  userName: string;
  userId: string;
  isLocal?: boolean;
  isMuted?: boolean;
  isCameraOn?: boolean;
  isScreenShare?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'full';
  shape?: 'circle' | 'rect';
  className?: string;
}

const SIZE_MAP: Record<string, number | undefined> = {
  sm: 72,
  md: 140,
  lg: 240,
  full: undefined,
};

const AVATAR_COLORS = [
  '#f97316', '#a855f7', '#ec4899', '#22c55e',
  '#3b82f6', '#14b8a6', '#eab308', '#ef4444',
];

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (const c of userId) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function VideoTile({
  videoStream,
  audioStream,
  userName,
  userId,
  isLocal = false,
  isMuted = false,
  isCameraOn = true,
  isScreenShare = false,
  size = 'md',
  shape = 'rect',
  className,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ─── Attach stream to video element ───
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    // Explicitly re-set srcObject if stream exists and video should be shown
    if (videoStream && (isCameraOn || isScreenShare)) {
      video.srcObject = videoStream;
    } else {
      video.srcObject = null;
    }
    
    return () => {
      video.srcObject = null;
    };
  }, [videoStream, isCameraOn, isScreenShare]);

  // ─── Speaking detection (non-local, non-muted only) ───
  // Use audioStream (separate mic stream) for analysis; fall back to videoStream
  useEffect(() => {
    const analysisStream = audioStream ?? videoStream;

    if (isLocal || !analysisStream || isMuted) {
      const frameId = requestAnimationFrame(() => setIsSpeaking(false));
      return () => cancelAnimationFrame(frameId);
    }

    const audioTrack = analysisStream.getAudioTracks()[0];
    if (!audioTrack) return;

    let audioCtx: AudioContext;
    try {
      audioCtx = new AudioContext();
    } catch {
      return;
    }

    const source = audioCtx.createMediaStreamSource(analysisStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    // NOTE: do NOT connect to audioCtx.destination — playback is via <audio> elements

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let animFrame = 0;

    function tick() {
      analyser.getByteFrequencyData(dataArray);
      // Speech frequency bins: ~344–3440 Hz at standard sample rates
      const speechBins = dataArray.slice(2, 20);
      const avg = speechBins.reduce((a, b) => a + b, 0) / speechBins.length;
      setIsSpeaking(avg > 20);
      animFrame = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(animFrame);
      source.disconnect();
      audioCtx.close();
      setIsSpeaking(false);
    };
  }, [audioStream, videoStream, isLocal, isMuted]);

  // ─── Computed ───
  const px = SIZE_MAP[size];
  const showVideo = videoStream && (isCameraOn || isScreenShare);
  const initials = getInitials(userName);
  const avatarColor = getAvatarColor(userId);

  return (
    <div
      className={className}
      style={{
        width: px ? `${px}px` : '100%',
        height: px ? `${px}px` : '100%',
        borderRadius: shape === 'circle' ? '50%' : '12px',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        // Speaking glow — boxShadow avoids layout shift
        boxShadow: isSpeaking
          ? '0 0 0 3px #22c55e, 0 0 12px rgba(34,197,94,0.5)'
          : '0 0 0 2px rgba(255,255,255,0.08)',
        transition: 'box-shadow 0.15s ease',
      }}
    >
      {/* ─── Video element ─── */}
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={true}
          style={{
            width: '100%',
            height: '100%',
            objectFit: isScreenShare ? 'contain' : 'cover',
            transform: isLocal && !isScreenShare ? 'scaleX(-1)' : 'none',
            backgroundColor: isScreenShare ? '#000' : 'transparent',
          }}
        />
      ) : (
        /* ─── Camera-off fallback ─── */
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#1e293b',
          }}
        >
          <span
            style={{
              width: size === 'sm' ? 32 : 56,
              height: size === 'sm' ? 32 : 56,
              borderRadius: '50%',
              backgroundColor: avatarColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: size === 'sm' ? '12px' : '20px',
              fontWeight: 600,
              color: '#fff',
            }}
          >
            {initials}
          </span>
        </div>
      )}

      {/* ─── Name label (hidden for sm — shown via title tooltip) ─── */}
      {size !== 'sm' && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            right: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 6px',
            backgroundColor: 'rgba(0,0,0,0.65)',
            borderRadius: 6,
            backdropFilter: 'blur(4px)',
          }}
        >
          {isScreenShare && (
            <span style={{ fontSize: 11 }}>🖥️</span>
          )}
          <span
            style={{
              fontSize: 12,
              color: '#fff',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {isLocal ? `${userName} (You)` : userName}
          </span>
        </div>
      )}

      {/* ─── Mute indicator ─── */}
      {isMuted && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: size === 'sm' ? 16 : 24,
            height: size === 'sm' ? 16 : 24,
            borderRadius: '50%',
            backgroundColor: 'rgba(220,38,38,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size === 'sm' ? 8 : 12,
          }}
          title="Microphone off"
        >
          🔇
        </div>
      )}

      {/* ─── Screen share badge (top-left) ─── */}
      {isScreenShare && size !== 'sm' && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            padding: '2px 6px',
            backgroundColor: 'rgba(59,130,246,0.9)',
            borderRadius: 4,
            fontSize: 11,
            color: '#fff',
            fontWeight: 600,
          }}
        >
          SCREEN
        </div>
      )}

      {/* ─── "You" badge for local sm tile ─── */}
      {isLocal && size === 'sm' && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.6)',
            fontSize: 9,
            color: '#a1a1aa',
          }}
        >
          You
        </div>
      )}
    </div>
  );
}
