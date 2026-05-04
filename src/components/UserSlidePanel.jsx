import { useState } from "react";

const PANEL_ITEMS = [
  ["My Profile", "View and edit your profile", "MP"],
  ["Settings", "Preferences and configuration", "ST"],
  ["Preferences", "Dashboard, language and more", "PR"],
  ["Contact Us", "Get in touch with support", "CU"],
  ["Help Center", "Guides and documentation", "HC"],
  ["What's New", "Latest updates and features", "WN"],
];

const getUserName = (user, userProfile) => {
  if (userProfile?.displayName) return userProfile.displayName;
  if (userProfile?.name) return userProfile.name;
  if (user?.displayName) return user.displayName;
  if (user?.email) return user.email.split("@")[0].replace(/[._-]+/g, " ");
  return "IGCC User";
};

export function UserSlidePanel({ isOpen, onClose, onLogout, user, userProfile }) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!isOpen) return null;

  const userName = getUserName(user, userProfile);
  const avatar = userName.slice(0, 1).toUpperCase();
  const handleLogout = async () => {
    setIsLoggingOut(true);

    try {
      await onLogout?.();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="slide-panel-backdrop" onClick={onClose}>
      <aside className="slide-panel" onClick={(event) => event.stopPropagation()}>
        <button className="panel-close" type="button" onClick={onClose} aria-label="Close menu">
          x
        </button>

        <section className="panel-profile">
          <div className="panel-avatar">{avatar}</div>
          <strong>{userName}</strong>
          <span>Welcome</span>
        </section>

        <nav className="panel-menu" aria-label="User menu">
          {PANEL_ITEMS.map(([label, note, icon]) => (
            <button key={label} type="button" className="panel-row">
              <span className="panel-icon">{icon}</span>
              <span>
                <strong>{label}</strong>
                <small>{note}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="panel-spacer" />

        <button
          type="button"
          className="panel-row panel-logout"
          disabled={isLoggingOut}
          onClick={handleLogout}
        >
          <span className="panel-icon">LO</span>
          <span>
            <strong>{isLoggingOut ? "Logging out" : "Logout"}</strong>
            <small>{isLoggingOut ? "Returning to sign in" : "Sign out from your account"}</small>
          </span>
        </button>
      </aside>
    </div>
  );
}
