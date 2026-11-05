import { useCallback, useEffect, useState } from "react";
import { api, getSession, setSession, setSessionLostHandler } from "../lib/api.js";
import { browserTimezone } from "../lib/dates.js";

const SIGNED_OUT = { status: "anon", user: null, profile: null, error: "" };

// status: "loading" | "anon" | "authed" | "error"
export function useAuth() {
  const [state, setState] = useState({ ...SIGNED_OUT, status: "loading" });

  const loadMe = useCallback(async () => {
    const { user, profile } = await api.me();
    setState({ status: "authed", user, profile, error: "" });
  }, []);

  const bootstrap = useCallback(async () => {
    if (!getSession()) {
      setState(SIGNED_OUT);
      return;
    }
    setState((current) => ({ ...current, status: "loading" }));
    try {
      await loadMe();
    } catch (error) {
      if (error.status === 401) {
        setSession(null);
        setState(SIGNED_OUT);
      } else {
        setState({ status: "error", user: null, profile: null, error: error.message });
      }
    }
  }, [loadMe]);

  useEffect(() => {
    setSessionLostHandler(() => setState(SIGNED_OUT));
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(
    async (email, password) => {
      const data = await api.login({ email, password });
      setSession(data.session);
      await loadMe();
    },
    [loadMe],
  );

  const signup = useCallback(
    async ({ email, password, username }) => {
      const data = await api.signup({ email, password, username, timezone: browserTimezone() });
      if (data.session) {
        setSession(data.session);
        await loadMe();
        return {};
      }
      // Email confirmation is on: no session until the link is clicked.
      return { message: data.message };
    },
    [loadMe],
  );

  const logout = useCallback(() => {
    setSession(null);
    setState(SIGNED_OUT);
  }, []);

  return { ...state, login, signup, logout, retry: bootstrap };
}
