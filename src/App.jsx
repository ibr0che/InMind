import { useMemo, useState } from "react";
import AuthScreen from "./components/AuthScreen.jsx";
import TodayPage from "./pages/TodayPage.jsx";
import MemoriesPage from "./pages/MemoriesPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import { useAuth } from "./hooks/useAuth.js";
import { useTheme } from "./hooks/useThemes.js";
import { useClock } from "./hooks/useClock.js";
import { useEntries } from "./hooks/useEntries.js";
import { DEFAULT_TIMEZONE, computeStreak } from "./lib/dates.js";

import logo from "./images/logo.png";

const VIEWS = [
  { id: "journal", icon: "✎", label: "Today" },
  { id: "memories", icon: "▣", label: "Memories" },
  { id: "profile", icon: "◍", label: "Profile" },
];

export default function App() {
  const auth = useAuth();
  const appearance = useTheme(); // one call, keep the whole object

  if (auth.status === "loading") {
    return <div className="splash">Loading…</div>;
  }
  if (auth.status === "error") {
    return (
      <div className="splash">
        <p>{auth.error}</p>
        <button className="primary" onClick={auth.retry}>
          Try again
        </button>
      </div>
    );
  }
  if (auth.status === "anon") {
    return <AuthScreen onLogin={auth.login} onSignup={auth.signup} />;
  }
  return (
    <Journal
      user={auth.user}
      profile={auth.profile}
      onLogout={auth.logout}
      onRename={auth.updateUsername}
      appearance={appearance}
    />
  );
}

// Mounted only while signed in, so data loads after login and is discarded on logout.
function Journal({ user, profile, onLogout, onRename, appearance }) {
  const [view, setView] = useState("journal");
  const journal = useEntries();

  const timezone = user.user_metadata?.timezone || DEFAULT_TIMEZONE;
  const { today, secondsLeft } = useClock(timezone);

  const name =
    profile?.username ||
    user.user_metadata?.username ||
    user.email?.split("@")[0] ||
    "You";
  const initials = name.slice(0, 2).toUpperCase();
  const started = new Date(user.created_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const streak = useMemo(
    () =>
      computeStreak(
        journal.entries.map((entry) => entry.entry_date),
        today,
      ),
    [journal.entries, today],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src={logo} alt="" />
          <div>
            <strong>InMind</strong>
            <small>your life, remembered</small>
          </div>
        </div>
        <div className="top-actions">
          <button className="link-button" onClick={onLogout}>
            Sign out
          </button>
          <div className="avatar" aria-hidden="true">
            {initials}
          </div>
        </div>
      </header>
      <main className="layout">
        <aside className="sidebar">
          <div className="profile">
            <div className="profile-avatar">{initials}</div>
            <div>
              <strong>{name}'s journal</strong>
            </div>
          </div>
          <nav>
            {VIEWS.map((item) => (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => setView(item.id)}
              >
                {item.icon} <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="streak">
              <span className="sun">☼</span>
              <div>
                <strong>
                  {streak === 1 ? "1 day streak" : `${streak} day streak`}
                </strong>
                <small>
                  {streak ? "Keep showing up." : "Write today to begin."}
                </small>
              </div>
            </div>
          </div>
        </aside>
        <section className="content">
          {view === "journal" && (
            <TodayPage
              today={today}
              secondsLeft={secondsLeft}
              journal={journal}
            />
          )}
          {view === "memories" && (
            <MemoriesPage journal={journal} />
          )}
          {view === "profile" && (
            <ProfilePage
              user={user}
              name={name}
              started={started}
              timezone={timezone}
              appearance={appearance}
              onLogout={onLogout}
              onRename={onRename}
            />
          )}
        </section>
      </main>
    </div>
  );
}
