'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { z } from 'zod';

interface UseFormOptions<T> {
  initialValues: T;
  schema?: z.ZodSchema<T>;
  onSubmit?: (values: T) => Promise<void> | void;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
}

interface UseFormReturn<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  isValid: boolean;
  isDirty: boolean;
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setValues: (values: Partial<T>) => void;
  setError: (field: keyof T, message: string) => void;
  clearError: (field: keyof T) => void;
  handleChange: (field: keyof T) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  handleBlur: (field: keyof T) => () => void;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  reset: () => void;
  validate: () => boolean;
  validateField: (field: keyof T) => string | null;
}

/**
 * Custom form hook with validation support
 */
export function useForm<T extends Record<string, unknown>>(
  options: UseFormOptions<T>
): UseFormReturn<T> {
  const {
    initialValues,
    schema,
    onSubmit,
    validateOnChange = false,
    validateOnBlur = true,
  } = options;

  const [values, setValuesState] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialValuesRef = useRef(initialValues);

  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValuesRef.current);

  const validateField = useCallback(
    (field: keyof T): string | null => {
      if (!schema) return null;

      // Create a partial schema for single field validation
      const result = schema.safeParse(values);
      if (result.success) return null;

      const fieldError = result.error.errors.find(
        (err) => err.path[0] === field
      );
      return fieldError?.message || null;
    },
    [schema, values]
  );

  const validate = useCallback((): boolean => {
    if (!schema) return true;

    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return true;
    }

    const newErrors: Partial<Record<keyof T, string>> = {};
    result.error.errors.forEach((err) => {
      const field = err.path[0] as keyof T;
      if (!newErrors[field]) {
        newErrors[field] = err.message;
      }
    });
    setErrors(newErrors);
    return false;
  }, [schema, values]);

  const isValid = !schema || schema.safeParse(values).success;

  const setValue = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setValuesState((prev) => ({ ...prev, [field]: value }));

      if (validateOnChange) {
        const error = validateField(field);
        if (error) {
          setErrors((prev) => ({ ...prev, [field]: error }));
        } else {
          setErrors((prev) => {
            const next = { ...prev };
            delete next[field];
            return next;
          });
        }
      }
    },
    [validateOnChange, validateField]
  );

  const setValues = useCallback((newValues: Partial<T>) => {
    setValuesState((prev) => ({ ...prev, ...newValues }));
  }, []);

  const setError = useCallback((field: keyof T, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }, []);

  const clearError = useCallback((field: keyof T) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleChange = useCallback(
    (field: keyof T) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { value, type } = e.target;
        const newValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
        setValue(field, newValue as T[keyof T]);
      },
    [setValue]
  );

  const handleBlur = useCallback(
    (field: keyof T) => () => {
      setTouched((prev) => ({ ...prev, [field]: true }));

      if (validateOnBlur) {
        const error = validateField(field);
        if (error) {
          setErrors((prev) => ({ ...prev, [field]: error }));
        } else {
          setErrors((prev) => {
            const next = { ...prev };
            delete next[field];
            return next;
          });
        }
      }
    },
    [validateOnBlur, validateField]
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();

      // Mark all fields as touched
      const allTouched = Object.keys(values).reduce(
        (acc, key) => ({ ...acc, [key]: true }),
        {} as Record<keyof T, boolean>
      );
      setTouched(allTouched);

      if (!validate()) return;

      setIsSubmitting(true);
      try {
        await onSubmit?.(values);
      } finally {
        setIsSubmitting(false);
      }
    },
    [values, validate, onSubmit]
  );

  const reset = useCallback(() => {
    setValuesState(initialValuesRef.current);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, []);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    isValid,
    isDirty,
    setValue,
    setValues,
    setError,
    clearError,
    handleChange,
    handleBlur,
    handleSubmit,
    reset,
    validate,
    validateField,
  };
}

// ============================================
// Autosave Hook
// ============================================

interface UseAutosaveOptions<T> {
  data: T;
  onSave: (data: T) => Promise<void>;
  debounceMs?: number;
  enabled?: boolean;
}

/**
 * Hook for automatic saving with debounce
 */
export function useAutosave<T>({
  data,
  onSave,
  debounceMs = 2000,
  enabled = true,
}: UseAutosaveOptions<T>) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const dataRef = useRef(data);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialDataRef = useRef(JSON.stringify(data));

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!enabled) return;

    // Skip if data hasn't changed from initial
    if (JSON.stringify(data) === initialDataRef.current) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      setError(null);

      try {
        await onSave(dataRef.current);
        setLastSaved(new Date());
        initialDataRef.current = JSON.stringify(dataRef.current);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsSaving(false);
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, onSave, debounceMs, enabled]);

  const saveNow = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(dataRef.current);
      setLastSaved(new Date());
      initialDataRef.current = JSON.stringify(dataRef.current);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsSaving(false);
    }
  }, [onSave]);

  return {
    isSaving,
    lastSaved,
    error,
    saveNow,
  };
}
