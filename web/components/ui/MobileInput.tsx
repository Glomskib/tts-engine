'use client';

import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';

interface MobileInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function MobileInput({ label, error, className, ...props }: MobileInputProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-300">
        {label}
      </label>
      <input
        {...props}
        className={`
          w-full h-14 px-4
          text-base text-white
          bg-zinc-800 border border-zinc-700 rounded-xl
          placeholder:text-zinc-500
          focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-red-500 focus:ring-red-500' : ''}
          ${className || ''}
        `}
      />
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}

interface MobileTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export function MobileTextarea({ label, error, className, ...props }: MobileTextareaProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-300">
        {label}
      </label>
      <textarea
        {...props}
        className={`
          w-full min-h-[120px] px-4 py-3
          text-base text-white
          bg-zinc-800 border border-zinc-700 rounded-xl
          placeholder:text-zinc-500
          focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent
          resize-none
          ${error ? 'border-red-500' : ''}
          ${className || ''}
        `}
      />
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}

interface SelectOption {
  value: string;
  label: string;
}

interface MobileSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string;
  options: SelectOption[];
  error?: string;
}

export function MobileSelect({ label, options, error, className, ...props }: MobileSelectProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-300">
        {label}
      </label>
      <select
        {...props}
        className={`
          w-full h-14 px-4
          text-base text-white
          bg-zinc-800 border border-zinc-700 rounded-xl
          focus:outline-none focus:ring-2 focus:ring-teal-500
          appearance-none cursor-pointer
          bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNNSA3LjVMMTAgMTIuNUwxNSA3LjUiIHN0cm9rZT0iIzZiNzI4MCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz48L3N2Zz4=')]
          bg-no-repeat bg-[right_16px_center]
          ${error ? 'border-red-500' : ''}
          ${className || ''}
        `}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
