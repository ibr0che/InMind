import { authClient, createUserClient } from "./supabase.js";

// Verifies the access token locally against Supabase's cached public signing
// keys (ES256) instead of asking the Auth server on every request. The keys
// are fetched once and re-fetched every 10 minutes by supabase-js.
//
// Trade-off: a token stays valid until it expires (about an hour) even if the
// user signs out elsewhere, and user_metadata (timezone, username) reflects
// the moment the token was issued, so a change shows up after the next refresh.
export async function requireUser(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token)
    return res.status(401).json({ error: "Missing Bearer access token." });

  // getClaims throws (rather than returning an error) on some malformed
  // tokens, and Express 4 doesn't catch async throws, so catch it here.
  let claims;
  try {
    const { data, error } = await authClient.auth.getClaims(token);
    if (!error) claims = data?.claims;
  } catch {
    claims = null;
  }
  if (!claims?.sub || claims.role !== "authenticated")
    return res.status(401).json({ error: "Invalid or expired access token." });

  req.user = {
    id: claims.sub,
    email: claims.email,
    user_metadata: claims.user_metadata || {},
  };
  req.token = token;
  req.supabase = createUserClient(token);
  next();
}
