import React from 'react';

import { cn } from '@core/utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex w-full flex-col gap-2">
        {label ? (
          <label htmlFor={inputId} className="pl-1 text-sm font-medium tracking-[0.01em] text-slate-200">
            {label}
          </label>
        ) : null}
        <input
          id={inputId}
          ref={ref}
          aria-invalid={Boolean(error)}
          className={cn(
            'flex h-12 w-full rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white shadow-inner shadow-slate-950/40 outline-none transition-all duration-200 placeholder:text-slate-500 focus:border-cyan-300/45 focus:bg-slate-950/70 focus:ring-2 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-red-400/50 focus:border-red-400/60 focus:ring-red-400/20',
            className,
          )}
          {...props}
        />
        {error ? (
          <span className="pl-1 text-sm text-rose-300">{error}</span>
        ) : hint ? (
          <span className="pl-1 text-xs text-slate-500">{hint}</span>
        ) : null}
      </div>
    );
  },
);

Input.displayName = 'Input';
