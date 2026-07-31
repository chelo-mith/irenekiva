// src/integrations/fedapay/server.ts
// Configuration FedaPay - Ce fichier ne s'exécute QUE côté serveur
// En production, changez juste FEDAPAY_ENV en 'live' et les clés

import { FedaPay } from "fedapay";

function initFedaPay() {
  const secretKey = process.env.FEDAPAY_SECRET_KEY;
  const env = (process.env.FEDAPAY_ENV || "sandbox") as "sandbox" | "live";

  if (!secretKey) {
    throw new Error(
      "Variable d'environnement FEDAPAY_SECRET_KEY manquante. " +
        "Configurez vos clés FedaPay dans le fichier .env",
    );
  }

  FedaPay.setApiKey(secretKey);
  FedaPay.setEnvironment(env);

  return FedaPay;
}

// Initialisation lazy (évite les erreurs au build)
let _fedapay: typeof FedaPay | undefined;

export function getFedaPay() {
  if (!_fedapay) {
    _fedapay = initFedaPay();
  }
  return _fedapay;
}

// Exports pratiques
export function getFedaPayEnv(): "sandbox" | "live" {
  return (process.env.FEDAPAY_ENV || "sandbox") as "sandbox" | "live";
}

export function getFedaPayPublicKey(): string {
  const key = process.env.FEDAPAY_PUBLIC_KEY;
  if (!key) {
    throw new Error("FEDAPAY_PUBLIC_KEY manquante dans .env");
  }
  return key;
}

export function getFedaPayWebhookSecret(): string {
  const secret = process.env.FEDAPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("FEDAPAY_WEBHOOK_SECRET manquant dans .env");
  }
  return secret;
}

function isLocalhostUrl(url?: string) {
  return (
    typeof url === "string" &&
    /^(https?:\/\/)(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(\/|$)/.test(url)
  );
}

export function getAppUrl(): string {
  const env = getFedaPayEnv();
  const appUrl = process.env.APP_URL;
  const publicAppUrl = process.env.PUBLIC_APP_URL;

  // En SANDBOX : On utilise TOUJOURS PUBLIC_APP_URL (ex: http://localhost:8080)
  // C'est ce qui permet au navigateur de rester en local après le paiement
  if (env === "sandbox") {
    return (publicAppUrl ?? appUrl ?? "http://localhost:8080").replace(/\/$/, "");
  }

  // En PRODUCTION (live) : On utilise APP_URL en priorité
  return (appUrl ?? publicAppUrl ?? "http://localhost:8080").replace(/\/$/, "");
}
