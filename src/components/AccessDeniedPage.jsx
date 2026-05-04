export function AccessDeniedPage({ deniedEmail, onBackToLogin }) {
  return (
    <main className="access-denied-page">
      <section className="access-denied-card">
        <div className="brand-mark auth-mark">IG</div>
        <p className="eyebrow">Access denied</p>
        <h1>This account is not approved for the dashboard.</h1>
        <p>
          The signed-in email is not active in Firestore allowedUsers. No dashboard pages or data
          were loaded.
        </p>
        {deniedEmail && <div className="denied-email">{deniedEmail}</div>}
        <button type="button" onClick={onBackToLogin}>
          Back to Login
        </button>
      </section>
    </main>
  );
}
