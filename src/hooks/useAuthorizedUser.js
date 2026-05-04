import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore/lite";
import { auth, db, firebaseProjectId, isFirebaseConfigured } from "../firebase";
import { getRolePermissions, normalizeRole } from "../data/accessControl";
import { FIRESTORE_COLLECTIONS } from "../data/firestoreCollections";

function normalizeEmail(email) {
  return email?.trim().toLowerCase() || "";
}

async function readAllowedUser(email) {
  if (!db || !email) {
    return null;
  }

  const normalizedEmail = normalizeEmail(email);
  const allowedUserSnap = await getDoc(doc(db, FIRESTORE_COLLECTIONS.allowedUsers, normalizedEmail));

  return allowedUserSnap.exists()
    ? {
        id: allowedUserSnap.id,
        ...allowedUserSnap.data(),
      }
    : null;
}

function readFlexibleField(record, fieldName) {
  const matchingKey = Object.keys(record || {}).find((key) => key.trim().toLowerCase() === fieldName);
  return matchingKey ? record[matchingKey] : undefined;
}

function isActiveValue(value) {
  if (value === true) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().toLowerCase() === "true";
  }

  return false;
}

function isApprovedAllowedUser(allowedUser) {
  return Boolean(allowedUser && isActiveValue(readFlexibleField(allowedUser, "active")));
}

function buildDeniedReason(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "");
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("permission denied on resource project")) {
    return "firebase-api-access-denied";
  }

  if (code.includes("permission-denied") || lowerMessage.includes("permission")) {
    return "firestore-permission-denied";
  }

  return "verification-failed";
}

function buildErrorDetail(error) {
  if (!error) {
    return "";
  }

  const code = error.code ? `Code: ${error.code}` : "Code: unknown";
  const message = error.message ? `Message: ${error.message}` : "";
  return [code, message].filter(Boolean).join(" | ");
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
        await nextUser.getIdToken(true);
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

        const role = normalizeRole(readFlexibleField(allowedUser, "role"));

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
          reason: buildDeniedReason(error),
          detail: buildErrorDetail(error),
          projectId: firebaseProjectId,
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
    firebaseProjectId,
    resetAccessDenied,
    signOutUser,
  };
}
