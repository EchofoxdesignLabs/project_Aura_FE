import { AURA_REALTIME_URL } from '@core/config';
import type {
  SocketClientToServerEvents,
  SocketServerToClientEvents,
} from '@core/types';
import { io, type Socket } from 'socket.io-client';

type AuraSocket = Socket<SocketServerToClientEvents, SocketClientToServerEvents>;

export class SocketService {
  private socket: AuraSocket | null = null;

  async connect(token: string): Promise<void> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw new Error('Cannot connect the realtime service without a JWT token.');
    }

    this.disconnect();

    const nextSocket: AuraSocket = io(AURA_REALTIME_URL, {
      auth: { token: normalizedToken },
      transports: ['websocket'],
      autoConnect: false,
    });

    this.socket = nextSocket;

    await new Promise<void>((resolve, reject) => {
      const handleConnect = () => {
        cleanup();
        resolve();
      };

      const handleConnectError = (error: Error) => {
        cleanup();
        nextSocket.disconnect();
        if (this.socket === nextSocket) {
          this.socket = null;
        }
        reject(error);
      };

      const cleanup = () => {
        nextSocket.off('connect', handleConnect);
        nextSocket.off('connect_error', handleConnectError);
      };

      nextSocket.once('connect', handleConnect);
      nextSocket.once('connect_error', handleConnectError);
      nextSocket.connect();
    });
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }

    const activeSocket = this.socket;
    this.socket = null;
    activeSocket.disconnect();
  }

  emit<EventName extends keyof SocketClientToServerEvents>(
    event: EventName,
    ...args: Parameters<SocketClientToServerEvents[EventName]>
  ): void {
    this.getSocketOrThrow().emit(event, ...args);
  }

  on<EventName extends keyof SocketServerToClientEvents>(
    event: EventName,
    handler: SocketServerToClientEvents[EventName],
  ): void {
    this.getSocketOrThrow().on(event, handler as never);
  }

  off<EventName extends keyof SocketServerToClientEvents>(
    event: EventName,
    handler?: SocketServerToClientEvents[EventName],
  ): void {
    const socket = this.getSocketOrThrow();
    if (handler) {
      socket.off(event, handler as never);
      return;
    }

    socket.off(event);
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  onConnect(handler: () => void): () => void {
    const socket = this.getSocketOrThrow();
    socket.on('connect', handler);
    return () => {
      socket.off('connect', handler);
    };
  }

  onDisconnect(handler: (reason: string) => void): () => void {
    const socket = this.getSocketOrThrow();
    socket.on('disconnect', handler);
    return () => {
      socket.off('disconnect', handler);
    };
  }

  onError(handler: (error: Error) => void): () => void {
    const socket = this.getSocketOrThrow();
    socket.on('connect_error', handler);
    return () => {
      socket.off('connect_error', handler);
    };
  }

  private getSocketOrThrow(): AuraSocket {
    if (!this.socket) {
      throw new Error('Socket has not been initialized. Call connect(token) first.');
    }

    return this.socket;
  }
}

export const socketService = new SocketService();
