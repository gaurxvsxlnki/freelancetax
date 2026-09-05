import { useCallback, useEffect, useRef, useState } from 'react';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Loads data from a backend call on mount. `reload` refetches and keeps the
 * previous data visible while loading (no flicker).
 */
export function useAsync<T>(fn: () => Promise<T>): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  // Guards against two hazards: (1) out-of-order responses when reload() is
  // called while an earlier request is still in flight, and (2) setState on an
  // unmounted component (StrictMode double-mounts in development).
  const requestId = useRef(0);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const result = await fnRef.current();
      if (!mounted.current || id !== requestId.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (!mounted.current || id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void load();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  return { data, loading, error, reload };
}