import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { getBackend } from '../backend';
import type { Profile, SessionUser, UserPrefs } from '../lib/types';

interface AuthContextValue {
  user: SessionUser | null;
  /** True while the persisted session is being restored on first load. */
  initializing: boolean;
  profile: Profile | null;
  prefs: UserPrefs | null;
  signIn: (email: string, password: string) => Promise<Profile | null>;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ needsConfirmation: boolean; profile: Profile | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshPrefs: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const backend = getBackend();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Profile + prefs must settle before `initializing` flips so route guards
    // can make the onboarding decision without a flash of the wrong page.
    const loadProfileAndPrefs = async () => {
      try {
        const [p, pr] = await Promise.all([backend.getProfile(), backend.getPrefs()]);
        if (!cancelled) {
          setProfile(p);
          setPrefs(pr);
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
          setPrefs(null);
        }
      }
    };

    const applyUser = (u: SessionUser | null) => {
      setUser(u);
      if (u) {
        void loadProfileAndPrefs();
      } else {
        setProfile(null);
        setPrefs(null);
      }
    };

    const unsubscribe = backend.onAuthStateChange(applyUser);
    void (async () => {
      try {
        const u = await backend.getSessionUser();
        if (cancelled) return;
        setUser(u);
        if (u) await loadProfileAndPrefs();
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshProfile = useCallback(async () => {
    const p = await backend.getProfile();
    setProfile(p);
  }, [backend]);

  const refreshPrefs = useCallback(async () => {
    const p = await backend.getPrefs();
    setPrefs(p);
  }, [backend]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await backend.signIn(email, password);
      const p = await backend.getProfile();
      setProfile(p);
      return p;
    },
    [backend]
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const result = await backend.signUp(email, password);
      if (result.user) {
        const p = await backend.getProfile();
        setProfile(p);
        return { needsConfirmation: result.needsEmailConfirmation, profile: p };
      }
      return { needsConfirmation: result.needsEmailConfirmation, profile: null };
    },
    [backend]
  );

  const signOut = useCallback(async () => {
    await backend.signOut();
  }, [backend]);

  const value: AuthContextValue = {
    user,
    initializing,
    profile,
    prefs,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    refreshPrefs,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}