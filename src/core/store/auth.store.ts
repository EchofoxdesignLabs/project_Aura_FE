import { create } from 'zustand';

import { ApiError, apiClient } from '@core/api/api.client';
import type {
  AuthUser,
  LoginRequest,
  LoginResponse,
  RegisterCompanyRequest,
  RegisterCompanyResponse,
  CreateInviteResponse,
} from '@core/types';
import { socketService } from '@core/services/socket.service';
import { useGameStore } from '@core/store/game.store';
import { useMediaStore } from '@core/store/media.store';

const TOKEN_STORAGE_KEY = 'aura_token';
const USER_STORAGE_KEY = 'aura_user';

export const AUTH_STORAGE_KEYS = {
  token: TOKEN_STORAGE_KEY,
  user: USER_STORAGE_KEY,
} as const;

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  inviteLoading: boolean;
  inviteError: string | null;
  login: (email: string, password: string) => Promise<void>;
  registerCompany: (payload: RegisterCompanyRequest) => Promise<void>;
  createInvite: (email: string, roleName: 'EMPLOYEE' | 'ORG_ADMIN') => Promise<CreateInviteResponse>;
  acceptInvite: (token: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
  clearError: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAuthUser(value: unknown): value is AuthUser {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.role === 'string' &&
    typeof value.company === 'string'
  );
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function clearPersistedAuth(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(TOKEN_STORAGE_KEY);
  storage.removeItem(USER_STORAGE_KEY);
}

function persistAuth(token: string, user: AuthUser): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(TOKEN_STORAGE_KEY, token);
  storage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unable to complete authentication.';
}

function setAuthenticatedSession(
  set: (partial: Partial<AuthState>) => void,
  response: LoginResponse,
): void {
  apiClient.setToken(response.access_token);
  persistAuth(response.access_token, response.user);

  set({
    token: response.access_token,
    user: response.user,
    isAuthenticated: true,
    isLoading: false,
    error: null,
  });
}

async function requestLogin(credentials: LoginRequest): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>('/auth/login', credentials);
}

function resetAuthState(set: (partial: Partial<AuthState>) => void): void {
  set({
    token: null,
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  });
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  inviteLoading: false,
  inviteError: null,
  login: async (email, password) => {
    set({
      isLoading: true,
      error: null,
    });

    try {
      const response = await requestLogin({
        email,
        password,
      });

      setAuthenticatedSession(set, response);
    } catch (error) {
      clearPersistedAuth();
      apiClient.setToken(null);
      resetAuthState(set);
      set({
        error: normalizeErrorMessage(error),
      });
    }
  },
  registerCompany: async (payload) => {
    set({
      isLoading: true,
      error: null,
    });

    try {
      await apiClient.post<RegisterCompanyResponse>('/auth/register-company', payload);
    } catch (error) {
      clearPersistedAuth();
      apiClient.setToken(null);
      resetAuthState(set);
      set({
        error: normalizeErrorMessage(error),
      });
      return;
    }

    try {
      const loginResponse = await requestLogin({
        email: payload.adminEmail,
        password: payload.adminPassword,
      });

      setAuthenticatedSession(set, loginResponse);
    } catch {
      clearPersistedAuth();
      apiClient.setToken(null);
      resetAuthState(set);
      set({
        error:
          'Workspace created successfully, but automatic sign-in failed. Please switch to Sign In and use your admin credentials.',
      });
    }
  },
  createInvite: async (email, roleName) => {
    set({ inviteLoading: true, inviteError: null });
    try {
      const response = await apiClient.post<CreateInviteResponse>('/auth/invites', { email, roleName });
      set({ inviteLoading: false });
      return response;
    } catch (error) {
      const msg = normalizeErrorMessage(error);
      set({ inviteLoading: false, inviteError: msg });
      throw new Error(msg);
    }
  },
  acceptInvite: async (token, name, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.post<LoginResponse>(`/auth/invites/${token}/accept`, { name, password });
      setAuthenticatedSession(set, response);
    } catch (error) {
      clearPersistedAuth();
      apiClient.setToken(null);
      resetAuthState(set);
      set({ error: normalizeErrorMessage(error) });
    }
  },
  logout: () => {
    clearPersistedAuth();
    apiClient.setToken(null);
    socketService.disconnect();
    useGameStore.getState().reset();

    const mediaStore = useMediaStore.getState();
    mediaStore.stopMedia();
    mediaStore.clearAllRemoteStreams();

    resetAuthState(set);
  },
  hydrate: () => {
    const storage = getStorage();
    if (!storage) {
      apiClient.setToken(null);
      resetAuthState(set);
      return;
    }

    const token = storage.getItem(TOKEN_STORAGE_KEY)?.trim() ?? '';
    const rawUser = storage.getItem(USER_STORAGE_KEY);

    if (!token || !rawUser) {
      clearPersistedAuth();
      apiClient.setToken(null);
      resetAuthState(set);
      return;
    }

    try {
      const parsedUser = JSON.parse(rawUser) as unknown;
      if (!isAuthUser(parsedUser)) {
        throw new Error('Malformed persisted auth user');
      }

      apiClient.setToken(token);
      set({
        token,
        user: parsedUser,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch {
      clearPersistedAuth();
      apiClient.setToken(null);
      resetAuthState(set);
    }
  },
  clearError: () => {
    set({
      error: null,
    });
  },
}));
