import { createUserClient } from "./supabase.js";

export async function requireUser(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token)
    return res.status(401).json({ error: "Missing Bearer access token." });

  const supabase = createUserClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user)
    return res.status(401).json({ error: "Invalid or expired access token." });

  req.user = data.user;
  req.supabase = supabase;
  next();
}
