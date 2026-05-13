export interface RegisterCompanyRequest {
  companyName: string;
  companyDomain: string;
  adminEmail: string;
  adminPassword: string;
  adminName: string;
}

export interface RegisterCompanyResponse {
  message: string;
  companyId: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  name: string;
  role: string;
  company: string;
}

export interface LoginResponse {
  access_token: string;
  user: AuthUser;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  companyId: string;
}

// ─── Invites ───
export interface CreateInviteRequest {
  email: string;
  roleName: 'EMPLOYEE' | 'ORG_ADMIN'; // from backend payload field
}

export interface CreateInviteResponse {
  inviteToken: string;
  inviteUrl: string;
  expiresAt: string;
}

export interface InviteDetails {
  companyName: string;
  role: 'EMPLOYEE' | 'ORG_ADMIN';
  email: string;
  inviterName: string;
}

export interface AcceptInviteRequest {
  name: string;
  password: string;
}


export interface Office {
  id: string;
  name: string;
  width: number;
  height: number;
}

export enum ZoneType {
  MEETING = 'MEETING',
  FOCUS = 'FOCUS',
  LOBBY = 'LOBBY',
  PRIVATE_DESK = 'PRIVATE_DESK',
}

export interface ZoneSnapshot {
  id: string;
  name: string;
  type: ZoneType;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OfficeWithZones extends Office {
  zones: ZoneSnapshot[];
}

export interface PlayerState {
  socketId: string;
  userId: string;
  name: string;
  x: number;
  y: number;
  currentZoneId: string | null;
  currentZoneType: string | null;
  isScreenSharing?: boolean;
}

export interface OfficeJoinPayload {
  officeId: string;
}

export interface PlayerMovePayload {
  x: number;
  y: number;
}

export interface OfficeStatePayload {
  players: PlayerState[];
  zones: ZoneSnapshot[];
}

export interface PlayerLeftPayload {
  userId: string;
}

export interface PlayerMovedPayload {
  userId: string;
  x: number;
  y: number;
}

export interface ZoneEnteredPayload {
  zoneId: string;
  zoneName: string;
  zoneType: ZoneType;
}

export interface ZoneLeftPayload {
  zoneId: string;
}

export interface ZonePlayerPayload {
  userId: string;
  zoneId: string;
}

export interface MeetingJoinPayload {
  zoneId: string;
  participants: string[];
}

export interface MeetingPeerPayload {
  userId: string;
}

export interface ScreenSharePayload {
  userId: string;
}

export interface MediaStatePayload {
  userId: string;
  state: {
    isMicOn?: boolean;
    isCameraOn?: boolean;
  };
}

export type SfuMediaTag = 'mic' | 'camera' | 'screen';

export type SfuConsumerCloseReason =
  | 'distance'
  | 'left-office'
  | 'left-meeting'
  | 'producer-closed'
  | 'receiver-closed'
  | 'transport-closed'
  | 'server-cleanup'
  | 'worker-died';

export interface RemoteUserMedia {
  mic?: MediaStream;
  camera?: MediaStream;
  screen?: MediaStream;
}

export interface SfuGetRouterRtpCapabilitiesResponse {
  rtpCapabilities: unknown;
}

export interface SfuCreateWebRtcTransportRequest {
  direction: 'send' | 'recv';
  rtpCapabilities?: unknown;
}

export interface SfuTransportParameters {
  id: string;
  iceParameters: unknown;
  iceCandidates: unknown[];
  dtlsParameters: unknown;
  iceServers?: RTCIceServer[];
}

export interface SfuConnectTransportRequest {
  transportId: string;
  dtlsParameters: unknown;
}

export interface SfuProduceRequest {
  transportId: string;
  kind: 'audio' | 'video';
  rtpParameters: unknown;
  appData: {
    mediaTag: SfuMediaTag;
  };
}

export interface SfuProduceResponse {
  producerId: string;
}

export interface SfuResumeConsumerRequest {
  consumerId: string;
}

export interface SfuCloseProducerRequest {
  producerId?: string;
  mediaTag?: SfuMediaTag;
}

export interface SfuPauseProducerRequest {
  mediaTag: SfuMediaTag;
}

export interface SfuResumeProducerRequest {
  mediaTag: SfuMediaTag;
}

export interface SfuNewConsumerPayload {
  consumerId: string;
  producerId: string;
  remoteUserId: string;
  kind: 'audio' | 'video';
  rtpParameters: unknown;
  mediaTag: SfuMediaTag;
}

export interface SfuConsumerClosedPayload {
  consumerId: string;
  producerId?: string;
  remoteUserId?: string;
  mediaTag: SfuMediaTag;
  reason: SfuConsumerCloseReason;
}

export interface SocketRequestEvents {
  'sfu:get-router-rtp-capabilities': {
    payload: Record<string, never>;
    response: SfuGetRouterRtpCapabilitiesResponse;
  };
  'sfu:create-webrtc-transport': {
    payload: SfuCreateWebRtcTransportRequest;
    response: SfuTransportParameters;
  };
  'sfu:connect-transport': {
    payload: SfuConnectTransportRequest;
    response: { connected: true };
  };
  'sfu:produce': {
    payload: SfuProduceRequest;
    response: SfuProduceResponse;
  };
  'sfu:resume-consumer': {
    payload: SfuResumeConsumerRequest;
    response: { resumed: true };
  };
  'sfu:close-producer': {
    payload: SfuCloseProducerRequest;
    response: { closed: true };
  };
  'sfu:pause-producer': {
    payload: SfuPauseProducerRequest;
    response: { paused: true };
  };
  'sfu:resume-producer': {
    payload: SfuResumeProducerRequest;
    response: { resumed: true };
  };
}

export interface SocketClientToServerEvents {
  'office:join': (payload: OfficeJoinPayload) => void;
  'player:move': (payload: PlayerMovePayload) => void;
  'screenshare:start': (payload: Record<string, never>) => void;
  'screenshare:stop': (payload: Record<string, never>) => void;
  'media:state': (payload: { isMicOn?: boolean; isCameraOn?: boolean }) => void;
}

export interface SocketServerToClientEvents {
  'office:state': (payload: OfficeStatePayload) => void;
  'player:joined': (payload: PlayerState) => void;
  'player:left': (payload: PlayerLeftPayload) => void;
  'player:moved': (payload: PlayerMovedPayload) => void;
  'zone:entered': (payload: ZoneEnteredPayload) => void;
  'zone:left': (payload: ZoneLeftPayload) => void;
  'zone:player-entered': (payload: ZonePlayerPayload) => void;
  'zone:player-left': (payload: ZonePlayerPayload) => void;
  'meeting:join': (payload: MeetingJoinPayload) => void;
  'meeting:peer-joined': (payload: MeetingPeerPayload) => void;
  'meeting:peer-left': (payload: MeetingPeerPayload) => void;
  'sfu:new-consumer': (payload: SfuNewConsumerPayload) => void;
  'sfu:consumer-closed': (payload: SfuConsumerClosedPayload) => void;
  'screenshare:start': (payload: ScreenSharePayload) => void;
  'screenshare:stop': (payload: ScreenSharePayload) => void;
  'media:state': (payload: MediaStatePayload) => void;
}
