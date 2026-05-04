import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../firebase";
import { FIRESTORE_COLLECTIONS } from "../data/firestoreCollections";

async function readAuthorizedUserProfile(firebaseUser) {
  if (!db || !firebaseUser) {
    return null;
  }

  const uidProfile = await getDoc(doc(db, FIRESTORE_COLLECTIONS.users, firebaseUser.uid));

  if (uidProfile.exists()) {
    return uidProfile.data();
  }

  const emailKey = firebaseUser.email?.trim().toLowerCase();

  if (!emailKey) {
    return null;
  }

  const emailProfile = await getDoc(doc(db, FIRESTORE_COLLECTIONS.users, emailKey));
  return emailProfile.exists() ? emailProfile.data() : null;
}

function isAllowedProfile(profile) {
  if (!profile) {
    return false;
  }

  if (profile.disabled === true || profile.active === false || profile.status === "disabled") {
    return false;
  }

  return true;
}

export function useAuthorizedUser() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authError, setAuthError] = useState("");
  const [isCheckingUser, setIsCheckingUser] = useState(Boolean(isFirebaseConfigured && auth && db));

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
        setProfile(null);
        setIsCheckingUser(false);
        return;
      }

      try {
        const nextProfile = await readAuthorizedUserProfile(nextUser);

        if (!isAllowedProfile(nextProfile)) {
          await signOut(auth);
          setUser(null);
          setProfile(null);
          setAuthError("This account is not authorized in Firestore users.");
          return;
        }

        setUser(nextUser);
        setProfile(nextProfile);
      } catch (error) {
        setUser(null);
        setProfile(null);
        setAuthError("Unable to verify this account against Firestore users.");
      } finally {
        setIsCheckingUser(false);
      }
    });
  }, []);

  return {
    user,
    profile,
    authError,
    isCheckingUser,
    isFirebaseReady: Boolean(isFirebaseConfigured && auth && db),
    signOutUser: () => (auth ? signOut(auth) : Promise.resolve()),
  };
}
