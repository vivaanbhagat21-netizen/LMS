import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export interface UserProfile {
  id: number | string;
  name: string;
  email: string;
  avatar?: string;
  role?: 'student' | 'teacher';
}

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
  refreshUser: () => Promise<UserProfile | null>;
  loginWithGoogle: (credential: string, role?: 'student' | 'teacher') => Promise<UserProfile>;
  loginPreview: (role: 'student' | 'teacher') => Promise<UserProfile>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const PREVIEW_KEY = 'edugen_preview_user';

  const loadPreviewUser = (): UserProfile | null => {
    try {
      const raw = localStorage.getItem(PREVIEW_KEY);
      return raw ? (JSON.parse(raw) as UserProfile) : null;
    } catch {
      return null;
    }
  };

  const savePreviewUser = (user: UserProfile) => {
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(user));
  };

  const clearPreviewUser = () => {
    localStorage.removeItem(PREVIEW_KEY);
  };

  const refreshUser = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/me', { credentials: 'include' });
      if (!response.ok) {
        const preview = loadPreviewUser();
        setUser(preview);
        return preview;
      }

      const json = await response.json();
      if (json) {
        setUser(json);
        return json;
      }

      const preview = loadPreviewUser();
      setUser(preview);
      return preview;
    } catch (err) {
      const preview = loadPreviewUser();
      setUser(preview);
      return preview;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    refreshUser().then((userData) => {
      if (!mounted) return;
      if (!userData) {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const loginWithGoogle = async (credential: string, role: 'student' | 'teacher' = 'student') => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ credential, role }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Login failed' }));
        throw new Error(data.error || 'Login failed');
      }

      const data = await response.json();
      if (!data.user) {
        throw new Error('Invalid login response');
      }

      clearPreviewUser();
      setUser(data.user);
      return data.user as UserProfile;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      setUser(null);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const loginPreview = async (role: 'student' | 'teacher') => {
    setLoading(true);
    setError(null);

    try {
      const devRes = await fetch(`/api/dev-login?role=${role}`, { credentials: 'include' });
      if (devRes.ok) {
        const meRes = await fetch('/api/me', { credentials: 'include' });
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData) {
            clearPreviewUser();
            setUser(meData);
            setLoading(false);
            return meData as UserProfile;
          }
        }
      }
    } catch (e) {
      console.warn('Backend dev-login endpoint unreachable, activating local preview mode');
    }

    const preview: UserProfile = {
      id: role === 'teacher' ? 'preview-teacher' : 'preview-student',
      name: role === 'teacher' ? 'Teacher Preview' : 'Student Preview',
      email: `${role}@edugen.local`,
      avatar: '/default-avatar.svg',
      role,
    };
    savePreviewUser(preview);
    setUser(preview);
    setLoading(false);
    return preview;
  };

  const logout = async () => {
    setLoading(true);
    setError(null);

    try {
      await fetch('/api/logout', { method: 'GET', credentials: 'include' });
      clearPreviewUser();
      setUser(null);
    } catch (err) {
      clearPreviewUser();
      setUser(null);
      setError(err instanceof Error ? err.message : 'Logout failed');
    } finally {
      setLoading(false);
    }
  };

  const value = useMemo(
    () => ({ user, loading, error, setError, refreshUser, loginWithGoogle, loginPreview, logout }),
    [user, loading, error, setError, refreshUser, loginWithGoogle, loginPreview, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
