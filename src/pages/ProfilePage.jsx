import { useState } from "react";
import { THEMES } from "../hooks/useThemes.js";

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
        </div>
        <div className="swatches">
          {THEMES.map((id) => (
            // data-theme gives the swatch that theme's own --accent (see styles.css)
            <button
              key={id}
              data-theme={id}
              className="swatch"
              aria-pressed={theme === id}
              onClick={() => setTheme(id)}
            >
              <span className="swatch-dot" />
              {id}
            </button>
          ))}
        </div>
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
