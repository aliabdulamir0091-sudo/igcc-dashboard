const REASON_MESSAGES = {
  missing: "No matching document was found in Firestore allowedUsers for this email.",
  inactive: "The matching allowedUsers document exists, but active is not true.",
  "firestore-permission-denied": "Firestore Rules blocked the app from reading allowedUsers for this signed-in user.",
  "verification-failed": "The app could not complete the Firestore access verification.",
};

export function AccessDeniedPage({ deniedEmail, reason, onBackToLogin }) {
  const reasonMessage = REASON_MESSAGES[reason] || REASON_MESSAGES["verification-failed"];

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
        <div className="denied-reason">{reasonMessage}</div>
        {deniedEmail && <div className="denied-email">{deniedEmail}</div>}
        <button type="button" onClick={onBackToLogin}>
          Back to Login
        </button>
      </section>
    </main>
  );
}
