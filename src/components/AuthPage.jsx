import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";

export function AuthPage({ authError = "", isCheckingUser = false }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");
    setIsSubmitting(true);

    try {
      if (!auth) {
        throw new Error("Firebase Auth is not configured.");
      }

      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      setFormError("Sign in failed. Use an approved account created by the administrator.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark auth-mark">IG</div>
        <p className="eyebrow">Restricted application</p>
        <h1>IGCC Financial Dashboard</h1>
        <p>
          Sign in with an approved account. Access is checked against Firebase Auth and the
          Firestore users collection before the dashboard opens.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label>
            Password
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {(authError || formError) && <div className="auth-error">{authError || formError}</div>}

          <button disabled={isSubmitting || isCheckingUser} type="submit">
            {isSubmitting || isCheckingUser ? "Checking access..." : "Sign In"}
          </button>
        </form>

        <div className="auth-note">Account creation is managed only by the administrator.</div>
      </section>
    </main>
  );
}
