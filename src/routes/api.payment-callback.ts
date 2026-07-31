// src/routes/api.payment-callback.ts
// URL de retour après paiement FedaPay
// FedaPay redirige l'utilisateur ici après le paiement
// Le statut dans l'URL n'est PAS fiable - on vérifie via FedaPay

import { createFileRoute, redirect } from "@tanstack/react-router";
import { verifyFedaPayTransaction, updatePaymentStatus } from "@/server/payments.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/payment-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const paymentId = url.searchParams.get("payment_id");
        const urlStatus = url.searchParams.get("status"); // NON FIABLE, juste pour info
        const transactionId = url.searchParams.get("transaction_id");

        console.log("[Callback] Retour FedaPay:", {
          payment_id: paymentId,
          url_status: urlStatus,
          transaction_id: transactionId,
        });

        // Redirection par défaut vers le dashboard
        const defaultRedirect = "/dashboard";

        if (!paymentId) {
          throw redirect({ to: defaultRedirect });
        }

        // Récupérer le paiement
        const { data: payment } = await supabaseAdmin
          .from("payments")
          .select("fedapay_transaction_id, status, amount")
          .eq("id", paymentId)
          .single();

        if (!payment) {
          throw redirect({ to: defaultRedirect });
        }

        // Vérifier le statut auprès de FedaPay (TOUJOURS vérifier côté serveur)
        const txId = payment.fedapay_transaction_id || transactionId;
        if (txId) {
          const fedapayStatus = await verifyFedaPayTransaction(txId);

          if (fedapayStatus) {
            if (fedapayStatus.status === "approved" && payment.status !== "approved") {
              await updatePaymentStatus(
                paymentId,
                "approved",
                "Paiement confirmé via callback FedaPay.",
                { verified_from: "callback", fedapay_status: fedapayStatus.status },
              );
              throw redirect({
                to: "/payment/$paymentId",
                params: { paymentId },
              });
            } else if (
              (fedapayStatus.status === "canceled" || fedapayStatus.status === "declined") &&
              payment.status === "pending"
            ) {
              await updatePaymentStatus(
                paymentId,
                fedapayStatus.status as "canceled" | "declined",
                "Paiement annulé ou refusé (confirmé via callback).",
                { verified_from: "callback", fedapay_status: fedapayStatus.status },
              );

              throw redirect({ to: "/dashboard" });
            }
          }
        }

        // Rediriger vers la page de statut du paiement
        throw redirect({
          to: "/payment/$paymentId",
          params: { paymentId },
        });
      },
    },
  },
});
