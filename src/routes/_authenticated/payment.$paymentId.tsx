// src/routes/_authenticated/payment.$paymentId.tsx
// Page de statut de paiement - Affiche le résultat du paiement

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ArrowLeft,
  CreditCard,
  RefreshCw,
  Home,
  FileText,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { getPaymentDetails, checkPaymentStatus } from "../../server-fns/payments.functions";
import { formatXOF } from "@/lib/catalog";

export const Route = createFileRoute("/_authenticated/payment/$paymentId")({
  head: () => ({ meta: [{ title: "Statut du paiement — KIVA" }] }),
  component: PaymentStatusPage,
});

type PaymentStatus = "pending" | "approved" | "canceled" | "declined";

function PaymentStatusPage() {
  const { paymentId } = Route.useParams();
  const navigate = useNavigate();
  const [payment, setPayment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  // Charger les détails du paiement
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getPaymentDetails({ data: { paymentId } });
        if (active) setPayment(data);
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [paymentId]);

  // Polling si le paiement est encore en attente
  useEffect(() => {
    if (!payment || payment.status !== "pending") return;

    const interval = setInterval(async () => {
      setChecking(true);
      try {
        const updated = await checkPaymentStatus({ data: { paymentId } });
        setPayment(updated);
      } catch (err) {
        console.error(err);
      } finally {
        setChecking(false);
      }
    }, 5000); // Vérifier toutes les 5 secondes

    return () => clearInterval(interval);
  }, [payment?.status, paymentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="grid min-h-[60vh] place-items-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <XCircle className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="mt-4 font-display text-2xl font-semibold">Paiement introuvable</h1>
          <p className="mt-2 text-muted-foreground">
            Ce paiement n'existe pas ou vous n'y avez pas accès.
          </p>
          <Button asChild className="mt-6">
            <Link to="/dashboard">Retour au tableau de bord</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  const status = payment.status as PaymentStatus;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Link>
        </Button>

        {/* ─── Statut du paiement ─────────────────────────────────── */}
        <div className="mt-6 rounded-3xl border border-border/60 bg-card p-8 shadow-soft">
          {status === "approved" && (
            <>
              <div className="flex flex-col items-center text-center">
                <div className="rounded-full bg-green-100 p-4 dark:bg-green-900/30">
                  <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
                </div>
                <h1 className="mt-4 font-display text-3xl font-semibold">Paiement réussi !</h1>
                <p className="mt-2 text-muted-foreground">
                  Votre paiement de <strong>{formatXOF(payment.amount)}</strong> a été validé.
                </p>
              </div>
            </>
          )}

          {status === "pending" && (
            <>
              <div className="flex flex-col items-center text-center">
                <div className="rounded-full bg-yellow-100 p-4 dark:bg-yellow-900/30">
                  <Clock className="h-12 w-12 text-yellow-600 dark:text-yellow-400" />
                </div>
                <h1 className="mt-4 font-display text-3xl font-semibold">Paiement en cours...</h1>
                <p className="mt-2 text-muted-foreground">
                  Nous attendons la confirmation de votre paiement de{" "}
                  <strong>{formatXOF(payment.amount)}</strong>.
                </p>
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  {checking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span>Vérification automatique en cours...</span>
                </div>
                <Button
                  variant="outline"
                  className="mt-6"
                  onClick={async () => {
                    setChecking(true);
                    const updated = await checkPaymentStatus({ data: { paymentId } });
                    setPayment(updated);
                    setChecking(false);
                  }}
                >
                  {checking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Vérifier maintenant
                </Button>
              </div>
            </>
          )}

          {(status === "canceled" || status === "declined") && (
            <>
              <div className="flex flex-col items-center text-center">
                <div className="rounded-full bg-red-100 p-4 dark:bg-red-900/30">
                  <XCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
                </div>
                <h1 className="mt-4 font-display text-3xl font-semibold">
                  Paiement {status === "canceled" ? "annulé" : "refusé"}
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Le paiement de <strong>{formatXOF(payment.amount)}</strong> n'a pas abouti.
                </p>
              </div>
            </>
          )}

          {/* ─── Détails ──────────────────────────────────────────── */}
          <div className="mt-8 space-y-3 border-t border-border/40 pt-6 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Montant</span>
              <span className="font-medium">{formatXOF(payment.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Description</span>
              <span className="font-medium">{payment.description}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">
                {payment.payment_type === "upfront"
                  ? "Acompte"
                  : payment.payment_type === "monthly"
                    ? "Mensualité"
                    : "Paiement complet"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">
                {new Date(payment.created_at).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            {payment.paid_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payé le</span>
                <span className="font-medium text-green-600">
                  {new Date(payment.paid_at).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}
            {payment.fedapay_transaction_id && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Référence</span>
                <span className="font-mono text-xs">#{payment.fedapay_transaction_id}</span>
              </div>
            )}
          </div>
        </div>

        {/* ─── Actions ────────────────────────────────────────────── */}
        <div className="mt-6 flex flex-wrap gap-3">
          {status === "approved" ? (
            <>
              <Button asChild>
                <Link to="/dashboard">
                  <Home className="h-4 w-4" />
                  Tableau de bord
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/packs">
                  <FileText className="h-4 w-4" />
                  Voir mes demandes
                </Link>
              </Button>
            </>
          ) : status === "pending" ? (
            <>
              <Button asChild>
                <Link to="/dashboard">
                  <Home className="h-4 w-4" />
                  Tableau de bord
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild>
                <Link to="/dashboard">
                  <CreditCard className="h-4 w-4" />
                  Réessayer le paiement
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/dashboard">
                  <Home className="h-4 w-4" />
                  Tableau de bord
                </Link>
              </Button>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
