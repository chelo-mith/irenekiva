// src/integrations/supabase/auth-middleware.ts
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader.split(";").reduce(
    (acc, cookie) => {
      const [key, value] = cookie.trim().split("=");
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, string>,
  );
}

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      const missing = [
        ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
        ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
      ];
      const message = `Missing Supabase environment variable(s): ${missing.join(", ")}.`;
      console.error(`[Supabase] ${message}`);
      throw new Response(message, { status: 500 });
    }

    const request = getRequest();

    if (!request?.headers) {
      throw new Response("Unauthorized: No request available", { status: 401 });
    }

    const cookieHeader = request.headers.get("cookie");
    const cookies = parseCookies(cookieHeader);

    // ✅ Lire le token depuis le cookie sb-access-token
    const accessToken = cookies["sb-access-token"];

    if (!accessToken) {
      console.warn("[Supabase Auth] Pas de token dans les cookies");
      console.log("[Supabase Auth] Cookies disponibles:", Object.keys(cookies));
      throw new Response("Unauthorized: No access token", { status: 401 });
    }

    // ✅ Créer un client Supabase avec le token
    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // ✅ Vérifier le token
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      console.warn("[Supabase Auth] Token invalide:", error?.message);
      throw new Response("Unauthorized: Invalid token", { status: 401 });
    }

    return next({
      context: {
        userId: user.id,
        userEmail: user.email,
      },
    });
  },
);
