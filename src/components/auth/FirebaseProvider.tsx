import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  extractQuotaUpgradeUrl,
  handleFirestoreError,
  OperationType,
  signInWithGooglePopup,
  signOutFirebase,
  testFirestoreConnection,
} from '../../firebase';

export interface UserProfileDoc {
  uid: string;
  displayName?: string;
  email?: string;
  tourCompleted: boolean;
  tourSkipped: boolean;
  preferredSimpleAdvanced: 'SIMPLE' | 'ADVANCED';
  createdAt?: Timestamp | unknown;
  updatedAt?: Timestamp | unknown;
}

export type RoutePresetKey =
  | 'SHORTEST'
  | 'LOWER_TERRAIN_COST'
  | 'SCIENCE_ORIENTED'
  | 'PAIR_EVA'
  | 'ROVER_ASSISTED';

export interface SavedRoutePlanDoc {
  id: string;
  ownerUid: string;
  name: string;
  regionId: string;
  objectiveId: string;
  startLon: number;
  startLat: number;
  endLon: number;
  endLat: number;
  maxSlopeDeg: number;
  avoidDunes: boolean;
  selectedPreset: RoutePresetKey;
  distanceM: number;
  elevationGainM: number;
  maxSlopeActualDeg: number;
  createdAt?: Timestamp | unknown;
  updatedAt?: Timestamp | unknown;
}

export interface TargetBookmarkDoc {
  id: string;
  ownerUid: string;
  targetId: string;
  targetName: string;
  regionId: string;
  objectiveId: string;
  note: string;
  createdAt?: Timestamp | unknown;
  updatedAt?: Timestamp | unknown;
}

export interface SaveRoutePlanInput {
  id?: string;
  name: string;
  regionId: string;
  objectiveId: string;
  startLon: number;
  startLat: number;
  endLon: number;
  endLat: number;
  maxSlopeDeg: number;
  avoidDunes: boolean;
  selectedPreset: RoutePresetKey;
  distanceM: number;
  elevationGainM: number;
  maxSlopeActualDeg: number;
}

export interface SaveBookmarkInput {
  targetId: string;
  targetName: string;
  regionId: string;
  objectiveId: string;
  note: string;
}

interface FirebaseContextValue {
  authReady: boolean;
  user: User | null;
  firestoreOffline: boolean;
  quotaExceededUrl: string | null;
  authError: string | null;
  signingIn: boolean;
  userProfile: UserProfileDoc | null;
  savedRoutes: SavedRoutePlanDoc[];
  targetBookmarks: TargetBookmarkDoc[];
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
  saveRoutePlan: (input: SaveRoutePlanInput) => Promise<void>;
  deleteRoutePlan: (planId: string) => Promise<void>;
  saveTargetBookmark: (input: SaveBookmarkInput) => Promise<void>;
  deleteTargetBookmark: (bookmarkId: string) => Promise<void>;
  syncPreferences: (prefs: {
    tourCompleted?: boolean;
    tourSkipped?: boolean;
    preferredSimpleAdvanced?: 'SIMPLE' | 'ADVANCED';
  }) => Promise<void>;
}

const VALID_PRESETS = new Set<RoutePresetKey>([
  'SHORTEST',
  'LOWER_TERRAIN_COST',
  'SCIENCE_ORIENTED',
  'PAIR_EVA',
  'ROVER_ASSISTED',
]);

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
  return cleaned || `id-${Date.now()}`;
}

function clampFinite(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [firestoreOffline, setFirestoreOffline] = useState(false);
  const [quotaExceededUrl, setQuotaExceededUrl] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfileDoc | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoutePlanDoc[]>([]);
  const [targetBookmarks, setTargetBookmarks] = useState<TargetBookmarkDoc[]>([]);

  useEffect(() => {
    void testFirestoreConnection().then((res) => {
      if (res.offline) setFirestoreOffline(true);
    });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setUserProfile(null);
        setSavedRoutes([]);
        setTargetBookmarks([]);
      }
    });
    return () => unsub();
  }, []);

  // Ensure profile document exists when authenticated, and attach bounded Firestore listeners
  useEffect(() => {
    if (!authReady || !user) return;
    const uid = user.uid;
    const profilePath = `users/${uid}`;
    const profileRef = doc(db, 'users', uid);

    let active = true;

    (async () => {
      try {
        const snap = await getDoc(profileRef);
        if (!active) return;
        if (!snap.exists()) {
          let localTourCompleted = false;
          let localTourSkipped = false;
          try {
            const raw = window.localStorage.getItem('marspath_tour_state');
            if (raw) {
              const parsed = JSON.parse(raw) as { completed?: boolean; skipped?: boolean };
              localTourCompleted = Boolean(parsed.completed);
              localTourSkipped = Boolean(parsed.skipped);
            }
          } catch {
            // Ignore local storage errors
          }

          await setDoc(profileRef, {
            uid,
            ...(user.displayName ? { displayName: user.displayName.slice(0, 100) } : {}),
            ...(user.email ? { email: user.email.slice(0, 160) } : {}),
            tourCompleted: localTourCompleted,
            tourSkipped: localTourSkipped,
            preferredSimpleAdvanced: 'SIMPLE',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const quotaUrl = extractQuotaUpgradeUrl(msg);
        if (quotaUrl) {
          setQuotaExceededUrl(quotaUrl);
          return;
        }
        try {
          handleFirestoreError(err, OperationType.WRITE, profilePath);
        } catch {
          // Recorded via structured log
        }
      }
    })();

    const unsubProfile = onSnapshot(
      profileRef,
      (snap) => {
        if (snap.exists()) {
          setUserProfile(snap.data() as UserProfileDoc);
        }
      },
      (err) => {
        const quotaUrl = extractQuotaUpgradeUrl(err.message);
        if (quotaUrl) {
          setQuotaExceededUrl(quotaUrl);
          return;
        }
        handleFirestoreError(err, OperationType.GET, profilePath);
      }
    );

    const routesPath = `users/${uid}/routePlans`;
    const routesQuery = query(
      collection(db, 'users', uid, 'routePlans'),
      orderBy('updatedAt', 'desc'),
      limit(50)
    );
    const unsubRoutes = onSnapshot(
      routesQuery,
      (snap) => {
        setSavedRoutes(snap.docs.map((d) => d.data() as SavedRoutePlanDoc));
      },
      (err) => {
        const quotaUrl = extractQuotaUpgradeUrl(err.message);
        if (quotaUrl) {
          setQuotaExceededUrl(quotaUrl);
          return;
        }
        handleFirestoreError(err, OperationType.LIST, routesPath);
      }
    );

    const bookmarksPath = `users/${uid}/targetBookmarks`;
    const bookmarksQuery = query(
      collection(db, 'users', uid, 'targetBookmarks'),
      orderBy('updatedAt', 'desc'),
      limit(50)
    );
    const unsubBookmarks = onSnapshot(
      bookmarksQuery,
      (snap) => {
        setTargetBookmarks(snap.docs.map((d) => d.data() as TargetBookmarkDoc));
      },
      (err) => {
        const quotaUrl = extractQuotaUpgradeUrl(err.message);
        if (quotaUrl) {
          setQuotaExceededUrl(quotaUrl);
          return;
        }
        handleFirestoreError(err, OperationType.LIST, bookmarksPath);
      }
    );

    return () => {
      active = false;
      unsubProfile();
      unsubRoutes();
      unsubBookmarks();
    };
  }, [authReady, user]);

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGooglePopup();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In was cancelled or blocked.';
      setAuthError(msg);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    try {
      await signOutFirebase();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign out.');
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const saveRoutePlan = useCallback(
    async (input: SaveRoutePlanInput) => {
      if (!user) throw new Error('Sign in with Google to save route plans to cloud storage.');
      const planId = sanitizeId(input.id ?? `plan-${Date.now()}`);
      const path = `users/${user.uid}/routePlans/${planId}`;
      const ref = doc(db, 'users', user.uid, 'routePlans', planId);
      const preset = VALID_PRESETS.has(input.selectedPreset)
        ? input.selectedPreset
        : 'LOWER_TERRAIN_COST';

      const payload = {
        id: planId,
        ownerUid: user.uid,
        name: (input.name.trim() || 'Marswalk Traverse').slice(0, 120),
        regionId: input.regionId.slice(0, 64),
        objectiveId: input.objectiveId.slice(0, 64),
        startLon: clampFinite(input.startLon, -180, 180, 137.3889),
        startLat: clampFinite(input.startLat, -90, 90, -4.826),
        endLon: clampFinite(input.endLon, -180, 180, 137.39),
        endLat: clampFinite(input.endLat, -90, 90, -4.81),
        maxSlopeDeg: clampFinite(input.maxSlopeDeg, 5, 45, 18),
        avoidDunes: Boolean(input.avoidDunes),
        selectedPreset: preset,
        distanceM: clampFinite(input.distanceM, 0, 500000, 0),
        elevationGainM: clampFinite(input.elevationGainM, 0, 50000, 0),
        maxSlopeActualDeg: clampFinite(input.maxSlopeActualDeg, 0, 90, 0),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      try {
        await setDoc(ref, payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const quotaUrl = extractQuotaUpgradeUrl(msg);
        if (quotaUrl) setQuotaExceededUrl(quotaUrl);
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    [user]
  );

  const deleteRoutePlan = useCallback(
    async (planId: string) => {
      if (!user) return;
      const safeId = sanitizeId(planId);
      const path = `users/${user.uid}/routePlans/${safeId}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'routePlans', safeId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user]
  );

  const saveTargetBookmark = useCallback(
    async (input: SaveBookmarkInput) => {
      if (!user) throw new Error('Sign in with Google to bookmark science targets.');
      const bookmarkId = sanitizeId(input.targetId);
      const path = `users/${user.uid}/targetBookmarks/${bookmarkId}`;
      const ref = doc(db, 'users', user.uid, 'targetBookmarks', bookmarkId);

      try {
        const existing = await getDoc(ref);
        if (existing.exists()) {
          await updateDoc(ref, {
            note: input.note.trim().slice(0, 1000),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            id: bookmarkId,
            ownerUid: user.uid,
            targetId: input.targetId.slice(0, 128),
            targetName: input.targetName.trim().slice(0, 160),
            regionId: input.regionId.slice(0, 64),
            objectiveId: input.objectiveId.slice(0, 64),
            note: input.note.trim().slice(0, 1000),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const quotaUrl = extractQuotaUpgradeUrl(msg);
        if (quotaUrl) setQuotaExceededUrl(quotaUrl);
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    [user]
  );

  const deleteTargetBookmark = useCallback(
    async (bookmarkId: string) => {
      if (!user) return;
      const safeId = sanitizeId(bookmarkId);
      const path = `users/${user.uid}/targetBookmarks/${safeId}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'targetBookmarks', safeId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [user]
  );

  const syncPreferences = useCallback(
    async (prefs: {
      tourCompleted?: boolean;
      tourSkipped?: boolean;
      preferredSimpleAdvanced?: 'SIMPLE' | 'ADVANCED';
    }) => {
      if (!user) return;
      const path = `users/${user.uid}`;
      const ref = doc(db, 'users', user.uid);
      try {
        const existing = await getDoc(ref);
        if (!existing.exists()) {
          await setDoc(ref, {
            uid: user.uid,
            ...(user.displayName ? { displayName: user.displayName.slice(0, 100) } : {}),
            ...(user.email ? { email: user.email.slice(0, 160) } : {}),
            tourCompleted: Boolean(prefs.tourCompleted),
            tourSkipped: Boolean(prefs.tourSkipped),
            preferredSimpleAdvanced: prefs.preferredSimpleAdvanced ?? 'SIMPLE',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(ref, {
            ...(prefs.tourCompleted !== undefined ? { tourCompleted: prefs.tourCompleted } : {}),
            ...(prefs.tourSkipped !== undefined ? { tourSkipped: prefs.tourSkipped } : {}),
            ...(prefs.preferredSimpleAdvanced !== undefined
              ? { preferredSimpleAdvanced: prefs.preferredSimpleAdvanced }
              : {}),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const quotaUrl = extractQuotaUpgradeUrl(msg);
        if (quotaUrl) {
          setQuotaExceededUrl(quotaUrl);
          return;
        }
        try {
          handleFirestoreError(err, OperationType.UPDATE, path);
        } catch {
          // Do not interrupt user onboarding flow on background sync failure
        }
      }
    },
    [user]
  );

  return (
    <FirebaseContext.Provider
      value={{
        authReady,
        user,
        firestoreOffline,
        quotaExceededUrl,
        authError,
        signingIn,
        userProfile,
        savedRoutes,
        targetBookmarks,
        signInWithGoogle,
        signOut,
        clearAuthError,
        saveRoutePlan,
        deleteRoutePlan,
        saveTargetBookmark,
        deleteTargetBookmark,
        syncPreferences,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebase(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return ctx;
}
