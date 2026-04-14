import React from 'react';

import { cn } from '@core/utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props },
    ref,
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center rounded-2xl border text-sm font-semibold tracking-[0.02em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 ring-offset-slate-950';

    const variants = {
      primary:
        'border-cyan-300/20 bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-400 text-slate-950 shadow-lg shadow-cyan-500/20 hover:-translate-y-0.5 hover:shadow-cyan-400/35',
      secondary:
        'border-white/10 bg-white/10 text-white shadow-lg shadow-slate-950/20 hover:bg-white/14',
      danger:
        'border-red-300/20 bg-gradient-to-r from-rose-400 to-red-500 text-white shadow-lg shadow-red-900/25 hover:-translate-y-0.5 hover:shadow-red-400/30',
      ghost:
        'border-transparent bg-transparent text-slate-300 hover:bg-white/6 hover:text-white',
      outline:
        'border-white/12 bg-slate-950/35 text-slate-100 shadow-lg shadow-slate-950/20 hover:border-cyan-300/35 hover:bg-cyan-300/8',
    };

    const sizes = {
      sm: 'h-10 px-4',
      md: 'h-11 px-5',
      lg: 'h-12 px-6 text-base',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={isLoading || disabled}
        {...props}
      >
        {isLoading ? (
          <svg
            className="mr-2 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Zm2 5.291A7.963 7.963 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647Z"
            />
          </svg>
        ) : null}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
