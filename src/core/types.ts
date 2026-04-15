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

export interface SignalOfferRequest {
  targetUserId: string;
  offer: RTCSessionDescriptionInit;
}

export interface SignalAnswerRequest {
  targetUserId: string;
  answer: RTCSessionDescriptionInit;
}

export interface SignalIceCandidateRequest {
  targetUserId: string;
  candidate: RTCIceCandidateInit;
}

export interface SignalOfferPayload {
  fromUserId: string;
  offer: RTCSessionDescriptionInit;
}

export interface SignalAnswerPayload {
  fromUserId: string;
  answer: RTCSessionDescriptionInit;
}

export interface SignalIceCandidatePayload {
  fromUserId: string;
  candidate: RTCIceCandidateInit;
}

export interface SocketClientToServerEvents {
  'office:join': (payload: OfficeJoinPayload) => void;
  'player:move': (payload: PlayerMovePayload) => void;
  'signal:offer': (payload: SignalOfferRequest) => void;
  'signal:answer': (payload: SignalAnswerRequest) => void;
  'signal:ice-candidate': (payload: SignalIceCandidateRequest) => void;
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
  'signal:offer': (payload: SignalOfferPayload) => void;
  'signal:answer': (payload: SignalAnswerPayload) => void;
  'signal:ice-candidate': (payload: SignalIceCandidatePayload) => void;
}
