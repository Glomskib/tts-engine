'use client';

import type { ReactNode, ButtonHTMLAttributes } from 'react';

export interface IconActionProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode;
  variant?: 'ghost' | 'outline';
  'aria-label': string;
}

export function IconAction({
  icon,
  variant = 'ghost',
  className = '',
  ...props
}: IconActionProps) {
  const base =
    'inline-flex items-center justify-center w-11 h-11 rounded-lg transition-colors cursor-pointer';
  const variants = {
    ghost: 'text-zinc-400 hover:text-white active:text-white hover:bg-zinc-800 active:bg-zinc-700',
    outline:
      'text-zinc-400 hover:text-white active:text-white border border-zinc-700 hover:bg-zinc-800 active:bg-zinc-700',
  };

  return (
    <button
      type="button"
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
}
