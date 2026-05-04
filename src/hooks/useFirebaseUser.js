import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, isFirebaseConfigured } from "../firebase";

export function useFirebaseUser() {
  const [user, setUser] = useState(null);
  const [isCheckingUser, setIsCheckingUser] = useState(Boolean(isFirebaseConfigured && auth));

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setIsCheckingUser(false);
      return undefined;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsCheckingUser(false);
    });
  }, []);

  return { user, isCheckingUser };
}
