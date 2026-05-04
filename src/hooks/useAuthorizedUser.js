import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../firebase";
import { getRolePermissions } from "../data/accessControl";
import { FIRESTORE_COLLECTIONS } from "../data/firestoreCollections";

function normalizeEmail(email) {
  return email?.trim().toLowerCase() || "";
}

async function readAllowedUser(email) {
  if (!db || !email) {
    return null;
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedSnap = await getDoc(doc(db, FIRESTORE_COLLECTIONS.allowedUsers, normalizedEmail));

  if (normalizedSnap.exists()) {
    return {
      id: normalizedSnap.id,
      ...normalizedSnap.data(),
    };
  }

  if (normalizedEmail !== email.trim()) {
    const originalSnap = await getDoc(doc(db, FIRESTORE_COLLECTIONS.allowedUsers, email.trim()));
    return originalSnap.exists()
      ? {
          id: originalSnap.id,
          ...originalSnap.data(),
        }
      : null;
  }

  return null;
}

function isApprovedAllowedUser(allowedUser) {
  return Boolean(allowedUser && allowedUser.active === true);
}

export function useAuthorizedUser() {
  const [user, setUser] = useState(null);
  const [accessProfile, setAccessProfile] = useState(null);
  const [authError, setAuthError] = useState("");
  const [accessDenied, setAccessDenied] = useState(null);
  const [isCheckingUser, setIsCheckingUser] = useState(Boolean(isFirebaseConfigured && auth && db));

  const resetAccessDenied = useCallback(() => {
    setAccessDenied(null);
    setAuthError("");
  }, []);

  const signOutUser = useCallback(async () => {
    setUser(null);
    setAccessProfile(null);
    setAccessDenied(null);

    if (auth) {
      await signOut(auth);
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !db) {
      setAuthError("Firebase is not configured for this environment.");
      setIsCheckingUser(false);
      return undefined;
    }

    return onAuthStateChanged(auth, async (nextUser) => {
      setIsCheckingUser(true);
      setAuthError("");

      if (!nextUser) {
        setUser(null);
        setAccessProfile(null);
        setIsCheckingUser(false);
        return;
      }

      try {
        const email = normalizeEmail(nextUser.email);
        const allowedUser = await readAllowedUser(email);

        if (!isApprovedAllowedUser(allowedUser)) {
          setUser(null);
          setAccessProfile(null);
          setAccessDenied({
            email: nextUser.email,
            reason: allowedUser ? "inactive" : "missing",
          });
          await signOut(auth);
          return;
        }

        const role = allowedUser.role || "Viewer";

        setAccessDenied(null);
        setUser(nextUser);
        setAccessProfile({
          ...allowedUser,
          email,
          role,
          permissions: getRolePermissions(role),
        });
      } catch (error) {
        setUser(null);
        setAccessProfile(null);
        setAccessDenied({
          email: nextUser.email,
          reason: "verification-failed",
        });
        await signOut(auth);
      } finally {
        setIsCheckingUser(false);
      }
    });
  }, []);

  return {
    user,
    accessProfile,
    authError,
    accessDenied,
    isCheckingUser,
    isFirebaseReady: Boolean(isFirebaseConfigured && auth && db),
    resetAccessDenied,
    signOutUser,
  };
}
