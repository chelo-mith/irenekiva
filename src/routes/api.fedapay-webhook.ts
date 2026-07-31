// src/routes/api.fedapay-webhook.ts
// Webhook FedaPay - Reçoit les notifications de paiement
// Ce endpoint est appelé par FedaPay (pas par le navigateur)

import { createFileRoute } from "@tanstack/react-router";
import { Webhook } from "fedapay";
import { getFedaPayWebhookSecret } from "@/integrations/fedapay/server";
import { updatePaymentStatus, verifyFedaPayTransaction } from "@/server/payments.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/fedapay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // 1. Récupérer le body brut pour la vérification de signature
          const rawBody = await request.text();
          const signature = request.headers.get("x-fedapay-signature");

          if (!signature) {
            console.error("[Webhook] Signature manquante");
            return new Response(JSON.stringify({ error: "Signature manquante" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 2. Vérifier la signature du webhook
          let event: any;
          try {
            const webhookSecret = getFedaPayWebhookSecret();
            event = Webhook.constructEvent(rawBody, signature, webhookSecret);
          } catch (err) {
            console.error("[Webhook] Signature invalide:", err);
            return new Response(JSON.stringify({ error: "Signature invalide" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          // 3. Traiter l'événement
          const eventName = event.name || event.type;
          const eventData = event.data || event;
          const transaction = eventData?.object || eventData;
          const metadata = transaction?.custom_metadata || {};
          const paymentId = metadata.payment_id;

          console.log(`[Webhook] Événement reçu: ${eventName}`, {
            transaction_id: transaction?.id,
            payment_id: paymentId,
            status: transaction?.status,
          });

          // 4. Éviter les doublons (idempotence)
          if (paymentId) {
            const { data: existingEvent } = await supabaseAdmin
              .from("payment_events")
              .select("id")
              .eq("payment_id", paymentId)
              .eq("status", mapFedaPayStatus(transaction?.status))
              .contains("metadata", { webhook_event_id: event.id || transaction?.id })
              .maybeSingle();

            if (existingEvent) {
              console.log("[Webhook] Événement déjà traité, skip.");
              return new Response(JSON.stringify({ received: true, duplicate: true }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
          }

          // 5. Traiter selon le type d'événement
          switch (eventName) {
            case "transaction.approved": {
              if (paymentId) {
                // Vérifier le montant pour sécurité
                const { data: payment } = await supabaseAdmin
                  .from("payments")
                  .select("amount")
                  .eq("id", paymentId)
                  .single();

                if (payment && transaction?.amount !== payment.amount) {
                  console.error(
                    `[Webhook] Montant incorrect: attendu ${payment.amount}, reçu ${transaction?.amount}`,
                  );
                  return new Response(JSON.stringify({ error: "Montant incorrect" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                  });
                }

                await updatePaymentStatus(
                  paymentId,
                  "approved",
                  `Paiement approuvé via webhook FedaPay. Transaction ID: ${transaction?.id}`,
                  {
                    webhook_event: eventName,
                    fedapay_transaction_id: transaction?.id,
                    fedapay_reference: transaction?.reference,
                    webhook_event_id: event.id,
                  },
                );
              }
              break;
            }

            case "transaction.canceled":
            case "transaction.declined": {
              if (paymentId) {
                const status = eventName === "transaction.canceled" ? "canceled" : "declined";
                await updatePaymentStatus(
                  paymentId,
                  status,
                  `Paiement ${status} via webhook FedaPay. Transaction ID: ${transaction?.id}`,
                  {
                    webhook_event: eventName,
                    fedapay_transaction_id: transaction?.id,
                    webhook_event_id: event.id,
                  },
                );
              }
              break;
            }

            case "transaction.created":
            case "transaction.updated": {
              // On log mais on ne change pas le statut (déjà géré)
              if (paymentId) {
                await supabaseAdmin.from("payment_events").insert({
                  payment_id: paymentId,
                  status: mapFedaPayStatus(transaction?.status),
                  comment: `Événement webhook: ${eventName}`,
                  metadata: {
                    webhook_event: eventName,
                    fedapay_transaction_id: transaction?.id,
                    webhook_event_id: event.id,
                  },
                });
              }
              break;
            }

            default:
              console.log(`[Webhook] Événement non géré: ${eventName}`);
          }

          // 6. Répondre rapidement avec 200
          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[Webhook] Erreur traitement:", err);
          // Toujours répondre 200 pour éviter les retries de FedaPay
          // mais logger l'erreur
          return new Response(JSON.stringify({ received: true, error: "Internal error logged" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

// Mapper les statuts FedaPay vers nos statuts
function mapFedaPayStatus(fedaPayStatus: string): string {
  switch (fedaPayStatus) {
    case "approved":
      return "approved";
    case "canceled":
      return "canceled";
    case "declined":
      return "declined";
    case "pending":
    case "pending_trans":
    default:
      return "pending";
  }
}
