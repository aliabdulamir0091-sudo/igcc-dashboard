export function AppFooter({ accessProfile }) {
  return (
    <footer className="app-footer">
      <span>Data timestamp: pending Firestore sync</span>
      <span>Currency: USD</span>
      <span>AFP: submitted and approved application for payment values</span>
      <span>Access: {accessProfile?.role || "Viewer"}</span>
      <span className="quality-pill">Data quality: awaiting validation</span>
    </footer>
  );
}
