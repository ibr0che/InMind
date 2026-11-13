import { useState } from "react";
import logo from "../images/logo.png";

export default function AuthScreen({ onLogin, onSignup }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", username: "" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";
  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  function switchMode(next) {
    setMode(next);
    setError("");
    setInfo("");
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (isLogin) {
        await onLogin(form.email, form.password);
      } else {
        const result = await onSignup(form);
        if (result.message) {
          setMode("login");
          setInfo(result.message);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand">
          <img className="brand-logo" src={logo} alt="" />
          <div>
            <strong>InMind</strong>
            <small>your life, remembered</small>
          </div>
        </div>

        <h1 className="auth-title">{isLogin ? "Welcome back" : "Start your journal"}</h1>

        {!isLogin && (
          <label className="field">
            Username
            <input
              required
              autoComplete="username"
              minLength={3}
              maxLength={30}
              pattern="[a-zA-Z0-9_.\-]+"
              title="3–30 letters, numbers, dots, dashes or underscores"
              value={form.username}
              onChange={update("username")}
            />
          </label>
        )}
        <label className="field">
          Email
          <input required type="email" autoComplete="email" value={form.email} onChange={update("email")} />
        </label>
        <label className="field">
          Password
          <input
            required
            type="password"
            minLength={6}
            autoComplete={isLogin ? "current-password" : "new-password"}
            value={form.password}
            onChange={update("password")}
          />
        </label>

        {error && <p className="form-error">{error}</p>}
        {info && <p className="form-info">{info}</p>}

        <button className="primary auth-submit" disabled={busy}>
          {busy ? "One moment…" : isLogin ? "Sign in" : "Create account"}
        </button>

        <p className="auth-switch">
          {isLogin ? "New here?" : "Already have an account?"}{" "}
          <button type="button" className="link-button" onClick={() => switchMode(isLogin ? "signup" : "login")}>
            {isLogin ? "Create an account" : "Sign in"}
          </button>
        </p>
      </form>
    </div>
  );
}
