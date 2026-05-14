import { useMemo, useState } from 'react';

import { useAuthStore } from '@core/store/auth.store';
import { Button } from '@core/ui/Button';
import { Input } from '@core/ui/Input';
import type { AvatarConfig, RegisterCompanyRequest } from '@core/types';
import { AvatarPicker } from '@spatial/ui/components/AvatarPicker';
import { buildDefaultAvatarConfig } from '@spatial/utils/avatar-presets';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

const DOMAIN_PATTERN = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function createEmptyRegistrationState(): RegisterCompanyRequest {
  return {
    companyName: '',
    companyDomain: '',
    adminEmail: '',
    adminPassword: '',
    adminName: '',
  };
}

export function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const registerCompany = useAuthStore((state) => state.registerCompany);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const [formState, setFormState] = useState<RegisterCompanyRequest>(createEmptyRegistrationState);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(buildDefaultAvatarConfig);
  const [clientError, setClientError] = useState<string | null>(null);

  const isDisabled = useMemo(
    () => isLoading || Object.values(formState).some((value) => value.trim().length === 0),
    [formState, isLoading],
  );

  function updateField<Field extends keyof RegisterCompanyRequest>(
    field: Field,
    value: RegisterCompanyRequest[Field],
  ) {
    if (error) {
      clearError();
    }
    if (clientError) {
      setClientError(null);
    }

    setFormState((currentState) => ({
      ...currentState,
      [field]: value,
    }));
  }

  function validateForm(): string | null {
    if (formState.adminPassword.trim().length < 8) {
      return 'Password must be at least 8 characters long.';
    }

    if (!DOMAIN_PATTERN.test(formState.companyDomain.trim())) {
      return 'Company domain must look like example.com.';
    }

    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDisabled) {
      return;
    }

    const validationMessage = validateForm();
    if (validationMessage) {
      setClientError(validationMessage);
      return;
    }

    await registerCompany({
      companyName: formState.companyName.trim(),
      companyDomain: formState.companyDomain.trim(),
      adminEmail: formState.adminEmail.trim(),
      adminPassword: formState.adminPassword,
      adminName: formState.adminName.trim(),
      avatarConfig,
    });
  }

  const activeError = clientError ?? error;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {activeError ? (
        <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {activeError}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Company name"
          placeholder="Echofox Design"
          value={formState.companyName}
          onChange={(event) => updateField('companyName', event.target.value)}
          required
          disabled={isLoading}
        />

        <Input
          label="Company domain"
          placeholder="echofox.design"
          value={formState.companyDomain}
          onChange={(event) => updateField('companyDomain', event.target.value)}
          required
          disabled={isLoading}
          hint="Used by the backend to identify your organization."
        />

        <Input
          label="Admin name"
          placeholder="Aman Bhijith"
          value={formState.adminName}
          onChange={(event) => updateField('adminName', event.target.value)}
          required
          disabled={isLoading}
        />

        <Input
          label="Admin email"
          type="email"
          autoComplete="email"
          placeholder="admin@echofox.design"
          value={formState.adminEmail}
          onChange={(event) => updateField('adminEmail', event.target.value)}
          required
          disabled={isLoading}
        />
      </div>

      <Input
        label="Admin password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        value={formState.adminPassword}
        onChange={(event) => updateField('adminPassword', event.target.value)}
        required
        disabled={isLoading}
        hint="Creating a workspace also creates the first ORG_ADMIN account."
      />

      {/* Avatar Picker */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-slate-400">
          Choose Your Avatar
        </label>
        <AvatarPicker value={avatarConfig} onChange={setAvatarConfig} compact />
      </div>

      <div className="space-y-3 pt-2">
        <Button type="submit" className="w-full" size="lg" isLoading={isLoading} disabled={isDisabled}>
          Create Workspace
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="w-full justify-center text-slate-300"
          onClick={onSwitchToLogin}
          disabled={isLoading}
        >
          Already have access? Sign in
        </Button>
      </div>
    </form>
  );
}
