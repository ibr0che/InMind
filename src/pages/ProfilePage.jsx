import { useState } from "react";
import { THEMES, THEME_GROUPS } from "../hooks/useThemes.js";

const NEXT_KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

// Themes as preview cards, grouped (Classic, Duo). Works like radio buttons:
// arrow keys move between themes, Home/End jump to the first/last.
function ThemePicker({ theme, setTheme }) {
  function onKeyDown(event) {
    const index = THEMES.findIndex((t) => t.id === theme);
    let next = null;
    if (event.key in NEXT_KEYS) next = (index + NEXT_KEYS[event.key] + THEMES.length) % THEMES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = THEMES.length - 1;
    if (next === null) return;
    event.preventDefault();
    setTheme(THEMES[next].id);
    event.currentTarget.querySelector(`[data-theme="${THEMES[next].id}"]`)?.focus();
  }

  return (
    <div className="theme-picker" role="radiogroup" aria-label="Theme" onKeyDown={onKeyDown}>
      {THEME_GROUPS.map((group) => (
        <div key={group}>
          <p className="theme-group-label">{group.toUpperCase()}</p>
          <div className="theme-grid">
            {THEMES.filter((t) => t.group === group).map((t) => (
              // data-theme gives the card that theme's own colors (see styles.css)
              <button
                key={t.id}
                type="button"
                data-theme={t.id}
                className="theme-option"
                role="radio"
                aria-checked={theme === t.id}
                tabIndex={theme === t.id ? 0 : -1}
                onClick={() => setTheme(t.id)}
              >
                <span className="theme-preview" aria-hidden="true" />
                <span className="theme-name">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProfilePage({
  user,
  name,
  started,
  timezone,
  appearance,
  onLogout,
  onRename,
}) {
  const { theme, setTheme } = appearance;

  return (
    <div className="simple-page">
      <p className="eyebrow">YOUR SPACE</p>
      <h1>Profile</h1>

      <section className="card settings-card">
        <div className="card-head">
          <span>THEME</span>
          <span>{THEMES.find((t) => t.id === theme)?.label}</span>
        </div>
        <ThemePicker theme={theme} setTheme={setTheme} />
      </section>

      <section className="card settings-card">
        <div className="card-head">
          <span>ACCOUNT</span>
        </div>
        <dl className="account-list">
          <dt>Username</dt>
          <dd>
            <UsernameField name={name} onRename={onRename} />
          </dd>
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Timezone</dt>
          <dd>{timezone}</dd>
          <dt>Member since</dt>
          <dd>{started}</dd>
        </dl>
        <button className="outline-button" onClick={onLogout}>
          Sign out
        </button>
      </section>
    </div>
  );
}

function UsernameField({ name, onRename }) {
  const [draft, setDraft] = useState(null); // null = not editing
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (draft === null) {
    return (
      <span className="username-view">
        {name}
        <button className="link-button" onClick={() => setDraft(name)}>
          Edit
        </button>
      </span>
    );
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onRename(draft.trim());
      setDraft(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="username-form" onSubmit={save}>
      <div className="username-row">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setDraft(null)}
          minLength={3}
          maxLength={30}
          pattern="[a-zA-Z0-9_.\-]+"
          title="Letters, numbers, dots, dashes or underscores"
          aria-label="New username"
        />
        <button className="primary" disabled={busy || draft.trim() === name}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => setDraft(null)}
        >
          Cancel
        </button>
      </div>
      {error && <p className="inline-error">{error}</p>}
    </form>
  );
}
