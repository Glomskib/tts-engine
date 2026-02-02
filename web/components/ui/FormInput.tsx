'use client';

import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';
import { AlertCircle, Check, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

// ============================================
// Base Input Props
// ============================================

interface BaseFieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  success?: boolean;
  className?: string;
}

// ============================================
// Text Input
// ============================================

interface FormInputProps extends BaseFieldProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  inputClassName?: string;
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, error, hint, required, success, className = '', inputClassName = '', type = 'text', ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword && showPassword ? 'text' : type;

    const hasError = !!error;
    const hasSuccess = success && !hasError;

    return (
      <div className={className}>
        {label && (
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            {label}
            {required && <span className="text-red-400 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            type={inputType}
            className={`
              w-full h-12 px-4 bg-zinc-800 border rounded-xl text-white placeholder:text-zinc-500
              focus:outline-none transition-colors
              ${hasError ? 'border-red-500 focus:border-red-500' : ''}
              ${hasSuccess ? 'border-green-500 focus:border-green-500' : ''}
              ${!hasError && !hasSuccess ? 'border-zinc-700 focus:border-teal-500' : ''}
              ${isPassword ? 'pr-12' : ''}
              ${inputClassName}
            `}
            aria-invalid={hasError}
            aria-describedby={error ? `${props.id}-error` : hint ? `${props.id}-hint` : undefined}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-300"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          )}
          {hasSuccess && !isPassword && (
            <Check className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
          )}
        </div>
        {error && (
          <p id={`${props.id}-error`} className="flex items-center gap-1.5 mt-2 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${props.id}-hint`} className="mt-2 text-sm text-zinc-500">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

FormInput.displayName = 'FormInput';

// ============================================
// Textarea
// ============================================

interface FormTextareaProps extends BaseFieldProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  textareaClassName?: string;
  showCount?: boolean;
  maxLength?: number;
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  ({ label, error, hint, required, success, className = '', textareaClassName = '', showCount, maxLength, value, ...props }, ref) => {
    const hasError = !!error;
    const hasSuccess = success && !hasError;
    const currentLength = typeof value === 'string' ? value.length : 0;

    return (
      <div className={className}>
        {label && (
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            {label}
            {required && <span className="text-red-400 ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          value={value}
          maxLength={maxLength}
          className={`
            w-full px-4 py-3 bg-zinc-800 border rounded-xl text-white placeholder:text-zinc-500
            focus:outline-none transition-colors resize-none
            ${hasError ? 'border-red-500 focus:border-red-500' : ''}
            ${hasSuccess ? 'border-green-500 focus:border-green-500' : ''}
            ${!hasError && !hasSuccess ? 'border-zinc-700 focus:border-teal-500' : ''}
            ${textareaClassName}
          `}
          aria-invalid={hasError}
          {...props}
        />
        <div className="flex justify-between mt-2">
          <div>
            {error && (
              <p className="flex items-center gap-1.5 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </p>
            )}
            {hint && !error && (
              <p className="text-sm text-zinc-500">{hint}</p>
            )}
          </div>
          {showCount && maxLength && (
            <span className={`text-sm ${currentLength >= maxLength ? 'text-red-400' : 'text-zinc-500'}`}>
              {currentLength}/{maxLength}
            </span>
          )}
        </div>
      </div>
    );
  }
);

FormTextarea.displayName = 'FormTextarea';

// ============================================
// Select
// ============================================

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface FormSelectProps extends BaseFieldProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  options: SelectOption[];
  selectClassName?: string;
  placeholder?: string;
}

export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(
  ({ label, error, hint, required, success, options, className = '', selectClassName = '', placeholder, ...props }, ref) => {
    const hasError = !!error;
    const hasSuccess = success && !hasError;

    return (
      <div className={className}>
        {label && (
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            {label}
            {required && <span className="text-red-400 ml-1">*</span>}
          </label>
        )}
        <select
          ref={ref}
          className={`
            w-full h-12 px-4 bg-zinc-800 border rounded-xl text-white
            focus:outline-none transition-colors appearance-none cursor-pointer
            ${hasError ? 'border-red-500 focus:border-red-500' : ''}
            ${hasSuccess ? 'border-green-500 focus:border-green-500' : ''}
            ${!hasError && !hasSuccess ? 'border-zinc-700 focus:border-teal-500' : ''}
            ${selectClassName}
          `}
          aria-invalid={hasError}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="flex items-center gap-1.5 mt-2 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </p>
        )}
        {hint && !error && (
          <p className="mt-2 text-sm text-zinc-500">{hint}</p>
        )}
      </div>
    );
  }
);

FormSelect.displayName = 'FormSelect';

// ============================================
// Checkbox
// ============================================

interface FormCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  label: string;
  description?: string;
  error?: string;
  className?: string;
}

export const FormCheckbox = forwardRef<HTMLInputElement, FormCheckboxProps>(
  ({ label, description, error, className = '', ...props }, ref) => {
    return (
      <div className={className}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            ref={ref}
            type="checkbox"
            className="mt-1 w-5 h-5 rounded border-zinc-700 bg-zinc-800 text-teal-600 focus:ring-teal-500 focus:ring-offset-0 cursor-pointer"
            {...props}
          />
          <div>
            <span className="text-sm font-medium text-white">{label}</span>
            {description && (
              <p className="text-sm text-zinc-400 mt-0.5">{description}</p>
            )}
          </div>
        </label>
        {error && (
          <p className="flex items-center gap-1.5 mt-2 ml-8 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </p>
        )}
      </div>
    );
  }
);

FormCheckbox.displayName = 'FormCheckbox';

// ============================================
// Radio Group
// ============================================

interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface FormRadioGroupProps {
  name: string;
  label?: string;
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  required?: boolean;
  className?: string;
  direction?: 'horizontal' | 'vertical';
}

export function FormRadioGroup({
  name,
  label,
  options,
  value,
  onChange,
  error,
  required,
  className = '',
  direction = 'vertical',
}: FormRadioGroupProps) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-zinc-300 mb-3">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <div className={`flex ${direction === 'horizontal' ? 'flex-row gap-4' : 'flex-col gap-3'}`}>
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex items-start gap-3 cursor-pointer ${option.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={(e) => onChange?.(e.target.value)}
              disabled={option.disabled}
              className="mt-1 w-5 h-5 border-zinc-700 bg-zinc-800 text-teal-600 focus:ring-teal-500 focus:ring-offset-0 cursor-pointer"
            />
            <div>
              <span className="text-sm font-medium text-white">{option.label}</span>
              {option.description && (
                <p className="text-sm text-zinc-400 mt-0.5">{option.description}</p>
              )}
            </div>
          </label>
        ))}
      </div>
      {error && (
        <p className="flex items-center gap-1.5 mt-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
