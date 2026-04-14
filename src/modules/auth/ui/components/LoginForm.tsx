import { useMemo, useState } from 'react';

import { useAuthStore } from '@core/store/auth.store';
import { Button } from '@core/ui/Button';
import { Input } from '@core/ui/Input';

interface LoginFormProps {
  onSwitchToRegister: () => void;
}

export function LoginForm({ onSwitchToRegister }: LoginFormProps) {
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const isDisabled = useMemo(
    () => isLoading || email.trim().length === 0 || password.trim().length === 0,
    [email, isLoading, password],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDisabled) {
      return;
    }

    await login(email.trim(), password);
  }

  function updateEmail(nextValue: string) {
    if (error) {
      clearError();
    }

    setEmail(nextValue);
  }

  function updatePassword(nextValue: string) {
    if (error) {
      clearError();
    }

    setPassword(nextValue);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? (
        <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="space-y-4">
        <Input
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="admin@company.com"
          value={email}
          onChange={(event) => updateEmail(event.target.value)}
          required
          disabled={isLoading}
          hint="Use the admin account linked to your organization."
        />

        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => updatePassword(event.target.value)}
          required
          disabled={isLoading}
          hint="Passwords are validated by the backend identity service."
        />
      </div>

      <div className="space-y-3 pt-2">
        <Button type="submit" className="w-full" size="lg" isLoading={isLoading} disabled={isDisabled}>
          Enter Workspace
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full justify-center text-slate-300"
          onClick={onSwitchToRegister}
          disabled={isLoading}
        >
          Need a workspace? Create one
        </Button>
      </div>
    </form>
  );
}
