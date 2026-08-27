import { useEffect, useRef, useState } from 'react';

export function useLocalStorageState<T>(key: string, initialValue: T) {
  // Track whether we triggered the last write so we don't re-read our own update
  const writingRef = useRef(false);

  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  // Persist to localStorage whenever state changes
  useEffect(() => {
    try {
      writingRef.current = true;
      window.localStorage.setItem(key, JSON.stringify(state));
      // Dispatch a keyed event so OTHER components with different keys can react,
      // and cross-tab storage works too
      window.dispatchEvent(
        new CustomEvent('local-storage-update', { detail: { key } })
      );
    } catch {
      // ignore write failures
    } finally {
      // Reset flag after microtask so our own listener doesn't catch this round
      Promise.resolve().then(() => { writingRef.current = false; });
    }
  }, [key, state]);

  // Listen for updates from OTHER components or other tabs
  useEffect(() => {
    const handleCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      // Skip if it's our own write OR a different key
      if (writingRef.current || detail?.key !== key) return;
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) setState(JSON.parse(raw) as T);
      } catch {
        // ignore parse error
      }
    };

    // Cross-tab sync (native storage event — always from another tab)
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key !== key) return;
      try {
        if (e.newValue) setState(JSON.parse(e.newValue) as T);
      } catch {
        // ignore
      }
    };

    window.addEventListener('local-storage-update', handleCustomEvent);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener('local-storage-update', handleCustomEvent);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [key]);

  return [state, setState] as const;
}
