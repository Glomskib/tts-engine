'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type UserRole = 'admin' | 'creator' | 'recorder' | 'editor' | 'uploader' | 'va' | 'bot' | null;

interface AuthUser {
  id: string;
  email: string | undefined;
}

interface AuthContextType {
  loading: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  role: UserRole;
  isAdmin: boolean;
  isUploader: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isUploader, setIsUploader] = useState(false);

  const fetchAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.user) {
          setAuthenticated(true);
          setUser({ id: data.user.id, email: data.user.email });
          setRole(data.role || 'creator');
          setIsAdmin(data.isAdmin || false);
          setIsUploader(data.isUploader || data.isAdmin || false);
          setLoading(false);
          return;
        }
      }
      setAuthenticated(false);
      setUser(null);
      setRole(null);
      setIsAdmin(false);
      setIsUploader(false);
    } catch {
      setAuthenticated(false);
      setUser(null);
      setRole(null);
      setIsAdmin(false);
      setIsUploader(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuth();
  }, [fetchAuth]);

  return (
    <AuthContext.Provider value={{ loading, authenticated, user, role, isAdmin, isUploader, refresh: fetchAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
