import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ShieldCheck,
  Loader2,
  Package,
  Calendar,
  MapPin,
  ClipboardList,
  Plus,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import { RequestTimeline } from "@/components/requests/RequestTimeline";
import { formatXOF, type ProductRow } from "@/lib/catalog";
import { initiatePayment } from "../../server-fns/payments.functions";
import { toast } from "sonner";

import {
  STATUS_COLOR,
  STATUS_LABEL,
  formatDate,
  type RequestEventRow,
  type RequestRow,
} from "@/lib/requests";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — KIVA" }] }),
  component: Dashboard,
});

type RequestWithProduct = RequestRow & { products: ProductRow | null };

function Dashboard() {
  const { user, isAdmin } = useAuth();
  const name = (user?.user_metadata?.first_name as string) || user?.email?.split("@")[0] || "vous";

  const [requests, setRequests] = useState<RequestWithProduct[] | null>(null);
  const [eventsByReq, setEventsByReq] = useState<Record<string, RequestEventRow[]>>({});
  const [productCount, setProductCount] = useState<number | null>(null);
  const [requestCount, setRequestCount] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  // États pour la modale de paiement
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false); // 🌟 NOUVEAU

  const handlePayNow = async (requestId: string) => {
    setActiveRequestId(requestId);
    setIsPaymentModalOpen(true);
    setPaymentSuccess(false); // Réinitialiser
    setIsGeneratingLink(true);
    setPaymentUrl(null);

    try {
      const result = await initiatePayment({ data: { requestId } });
      if (result.paymentUrl) {
        setPaymentUrl(result.paymentUrl);
      } else {
        toast.error("Impossible de générer le lien de paiement.");
        setIsPaymentModalOpen(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors du paiement.");
      setIsPaymentModalOpen(false);
    } finally {
      setIsGeneratingLink(false);
    }
  };

  // ─── Vérification automatique du statut (Polling) ─────────────────────────
  useEffect(() => {
    if (!isPaymentModalOpen || !activeRequestId || paymentSuccess) return;

    const checkStatus = async () => {
      const { data } = await supabase
        .from("requests")
        .select("status")
        .eq("id", activeRequestId)
        .single();

      if (data && (data.status === "in_progress" || data.status === "completed")) {
        // 🌟 On affiche d'abord le beau message de succès
        setPaymentSuccess(true);

        // 🌟 On attend 2.5 secondes pour que l'utilisateur le voie, puis on ferme et recharge
        setTimeout(() => {
          toast.success("🎉 Paiement validé avec succès !");
          setIsPaymentModalOpen(false);
          setPaymentUrl(null);
          setActiveRequestId(null);
          setPaymentSuccess(false);
          window.location.reload();
        }, 2500);
      }
    };

    const intervalId = setInterval(checkStatus, 3000);
    return () => clearInterval(intervalId);
  }, [isPaymentModalOpen, activeRequestId, paymentSuccess]);

  // ... (Ton useEffect de chargement des données reste inchangé) ...
  useEffect(() => {
    if (isAdmin) {
      let active = true;
      (async () => {
        const productsRes = await supabase.from("products").select("id");
        const requestsRes = await supabase.from("requests").select("id");
        const pendingRes = await supabase.from("requests").select("id").eq("status", "pending");
        if (!active) return;
        setProductCount((productsRes.data ?? []).length);
        setRequestCount((requestsRes.data ?? []).length);
        setPendingCount((pendingRes.data ?? []).length);
      })();
      return () => {
        active = false;
      };
    }

    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("requests")
        .select("*, products(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!active) return;
      const list = (data ?? []) as unknown as RequestWithProduct[];
      setRequests(list);
      if (list.length > 0) {
        const { data: evs } = await supabase
          .from("request_events")
          .select("*")
          .in(
            "request_id",
            list.map((r) => r.id),
          )
          .order("created_at", { ascending: true });
        if (!active) return;
        const map: Record<string, RequestEventRow[]> = {};
        (evs ?? []).forEach((e) => {
          (map[e.request_id] ??= []).push(e);
        });
        setEventsByReq(map);
      }
    })();
    return () => {
      active = false;
    };
  }, [isAdmin, user]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-7xl px-6 py-12">
        {/* ... (Ton code d'affichage des demandes reste exactement le même) ... */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">
              {isAdmin ? "Espace admin" : "Espace personnel"}
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight md:text-5xl">
              Salut, {name}.
            </h1>
            <p className="mt-2 text-muted-foreground">
              {isAdmin
                ? "Suivez les statistiques et gérez les opérations."
                : "Suivez vos demandes et leur progression en temps réel."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin ? (
              <>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to="/admin/catalog">
                    <Package className="h-4 w-4" />
                    Catalogue
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to="/admin/requests">
                    <ClipboardList className="h-4 w-4" />
                    Demandes
                  </Link>
                </Button>
                <Button asChild className="rounded-full">
                  <Link to="/admin/catalog" search={{ openForm: "1" }}>
                    <Plus className="h-4 w-4" />
                    Ajouter un produit
                  </Link>
                </Button>
              </>
            ) : (
              <Button asChild className="rounded-full">
                <Link to="/packs">
                  <Package className="h-4 w-4" />
                  Parcourir le catalogue
                </Link>
              </Button>
            )}
          </div>
        </div>

        {isAdmin ? (
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <article className="rounded-3xl border border-border/60 bg-card p-6 shadow-soft">
              <p className="text-sm font-medium text-muted-foreground">Produits</p>
              <p className="mt-4 text-4xl font-semibold">
                {productCount ?? <Loader2 className="inline-block h-6 w-6 animate-spin" />}
              </p>
            </article>
          </div>
        ) : (
          <>
            <h2 className="mt-12 font-display text-2xl font-semibold">Mes demandes</h2>
            {!requests ? (
              <div className="grid place-items-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : requests.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-dashed border-border bg-card/40 p-12 text-center">
                <Package className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-4 font-medium">Aucune demande pour l'instant.</p>
                <Button asChild className="mt-6">
                  <Link to="/packs">Voir les packs</Link>
                </Button>
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {requests.map((r) => (
                  <article
                    key={r.id}
                    className="rounded-3xl border border-border/60 bg-card p-6 shadow-soft"
                  >
                    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                          <span className="text-xs text-muted-foreground">
                            Demande · créée le {formatDate(r.created_at)}
                          </span>
                        </div>
                        <h3 className="mt-3 font-display text-xl font-semibold">
                          {r.products?.title ?? "Produit"}
                        </h3>

                        {r.products && (
                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            {r.products.price_upfront && r.products.price_monthly ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-foreground">
                                    {formatXOF(r.products.price_upfront * r.quantity)} acompte
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {formatXOF(r.products.price_monthly * r.quantity)}/m ×{" "}
                                  {r.products.duration_months}m
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">
                                  {formatXOF(r.products.price_xof * r.quantity)}
                                </span>
                              </div>
                            )}

                            {(r.status === "pending" ||
                              r.status === "reviewing" ||
                              r.status === "scheduled") && (
                              <Button
                                size="sm"
                                className="rounded-full"
                                disabled={activeRequestId === r.id && isGeneratingLink}
                                onClick={() => handlePayNow(r.id)}
                              >
                                {activeRequestId === r.id && isGeneratingLink ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" /> Préparation...
                                  </>
                                ) : (
                                  <>
                                    <CreditCard className="h-4 w-4" /> Payer maintenant
                                  </>
                                )}
                              </Button>
                            )}

                            {r.status === "in_progress" ||
                            r.status === "delivered" ||
                            r.status === "completed" ? (
                              <Badge className="rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                ✓ Payé
                              </Badge>
                            ) : null}
                          </div>
                        )}
                        {/* ... (Le reste des détails de la demande reste inchangé) ... */}
                      </div>
                      <div className="rounded-2xl border border-border/40 bg-background/60 p-5">
                        <p className="mb-4 text-sm font-medium">Suivi</p>
                        <RequestTimeline
                          currentStatus={r.status}
                          events={eventsByReq[r.id] ?? []}
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <Footer />

      {/* ─── MODALE DE PAIEMENT AMÉLIORÉE ─── */}
      <Dialog
        open={isPaymentModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsPaymentModalOpen(false);
            setPaymentUrl(null);
            setActiveRequestId(null);
            setPaymentSuccess(false);
          }
        }}
      >
        <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Paiement sécurisé via FedaPay
            </DialogTitle>
            <DialogDescription>
              Veuillez compléter votre paiement. La fenêtre se fermera automatiquement une fois
              confirmé.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 relative bg-muted/30">
            {/* 🌟 ÉCRAN DE SUCCÈS MAGNIFIQUE */}
            {paymentSuccess ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-50 animate-in fade-in zoom-in duration-500">
                <div className="h-24 w-24 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-6 animate-bounce">
                  <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-3xl font-bold text-foreground">Paiement réussi !</h3>
                <p className="text-muted-foreground mt-3 text-center max-w-md text-lg">
                  Votre transaction a été validée avec succès.
                  <br />
                  Nous mettons à jour votre tableau de bord...
                </p>
                <Loader2 className="h-6 w-6 animate-spin text-primary mt-8" />
              </div>
            ) : isGeneratingLink ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm font-medium text-muted-foreground">
                  Génération du lien sécurisé...
                </p>
              </div>
            ) : paymentUrl ? (
              <>
                <iframe
                  src={paymentUrl}
                  className="w-full h-full border-0"
                  title="FedaPay Checkout"
                  allow="payment"
                />
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Erreur de chargement du paiement.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
