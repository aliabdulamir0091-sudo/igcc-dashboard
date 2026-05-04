import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";

export function AuthPage({ authError = "", isCheckingUser = false }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const visibleError = formError || authError;

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
      <section className="auth-shell">
        <div className="auth-brand-panel">
          <div className="brand-group">
            <div className="brand-mark auth-mark">IG</div>
            <div>
              <h1>IGCC Financial Dashboard</h1>
              <p>Modern financial command center</p>
            </div>
          </div>

          <div className="auth-hero-copy">
            <p className="eyebrow">Restricted executive access</p>
            <h2>Financial control starts with a secure sign in.</h2>
            <p>
              Access is limited to approved users created by the administrator and verified in
              Firestore before the dashboard opens.
            </p>
          </div>
        </div>

        <section className="auth-card" aria-label="Sign in">
          <form className="auth-form" onSubmit={handleSubmit}>
            <input
              aria-label="Email address"
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email address"
              required
              type="email"
              value={email}
            />

            <input
              aria-label="Password"
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              required
              type="password"
              value={password}
            />

            {visibleError && <div className="auth-error">{visibleError}</div>}

            <button className="auth-login-button" disabled={isSubmitting || isCheckingUser} type="submit">
              {isSubmitting || isCheckingUser ? "Checking access..." : "Log In"}
            </button>
          </form>

          <button
            className="auth-link-button"
            type="button"
            onClick={() => setFormError("New accounts are created only by the administrator.")}
          >
            Forgot password?
          </button>

          <div className="auth-divider" />

          <button
            className="auth-create-button"
            type="button"
            onClick={() => setFormError("Sign up is restricted. The administrator must create the account in Firebase and Firestore.")}
          >
            Create New Account
          </button>

          <div className="auth-note">No public signup. Only approved IGCC users can access this application.</div>
        </section>
      </section>
    </main>
  );
}
