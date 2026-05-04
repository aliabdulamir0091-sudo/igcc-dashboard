import { firebaseProjectId, isFirebaseConfigured } from "./firebase";

export default function App() {
  return (
    <main className="reset-shell">
      <section className="reset-panel">
        <div className="reset-mark">IGCC</div>
        <p className="reset-kicker">Clean rebuild workspace</p>
        <h1>Ready to redesign from zero</h1>
        <p className="reset-copy">
          The previous dashboard pages were removed. GitHub Pages, localhost scripts, and Firebase/Firestore configuration are preserved.
        </p>
        <div className="reset-grid">
          <div>
            <span>Firebase</span>
            <strong>{isFirebaseConfigured ? "Configured" : "Waiting for env"}</strong>
          </div>
          <div>
            <span>Project</span>
            <strong>{firebaseProjectId || "Not loaded locally"}</strong>
          </div>
          <div>
            <span>Localhost</span>
            <strong>localhost:5173</strong>
          </div>
        </div>
      </section>
    </main>
  );
}
