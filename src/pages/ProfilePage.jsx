const THEMES = [
  { id: "sand", label: "Sand" },
  { id: "violet", label: "Violet" },
  { id: "rainforest", label: "Rainforest" },
];
const MODES = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

function Setting({ label, hint, value, onChange, options }) {
  return (
    <label className="setting-row">
      <span>
        {label}
        <small>{hint}</small>
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function ProfilePage({
  user,
  name,
  started,
  timezone,
  appearance,
  onLogout,
}) {
  const { theme, setTheme, mode, setMode } = appearance;

  return (
    <div className="simple-page">
      <p className="eyebrow">YOUR SPACE</p>
      <h1>Profile</h1>

      <section className="card settings-card">
        <h2>Appearance</h2>
        <Setting
          label="Theme"
          hint="The color palette"
          value={theme}
          onChange={setTheme}
          options={THEMES}
        />
        <Setting
          label="Mode"
          hint="System follows your device"
          value={mode}
          onChange={setMode}
          options={MODES}
        />
      </section>

      <section className="card settings-card">
        <h2>Account</h2>
        <dl className="account-list">
          <dt>Username</dt>
          <dd>{name}</dd>
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Timezone</dt>
          <dd>{timezone}</dd>
          <dt>Member since</dt>
          <dd>{started}</dd>
        </dl>
        <button className="lock-button" onClick={onLogout}>
          Sign out
        </button>
      </section>
    </div>
  );
}
