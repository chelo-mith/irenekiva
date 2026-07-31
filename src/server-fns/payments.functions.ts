// src/server-fns/payments.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createPayment,
  verifyFedaPayTransaction,
  updatePaymentStatus,
  getPaymentById,
} from "../server/payments.server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const initiatePaymentSchema = z.object({
  requestId: z.string().uuid(),
});

const paymentIdSchema = z.object({
  paymentId: z.string().uuid(),
});

export const initiatePayment = createServerFn({ method: "POST" })
  .inputValidator((data) => initiatePaymentSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    // ✅ On utilise context.userId (string), pas context.supabase
    const userId = context.userId;

    const { data: request, error: reqError } = await supabaseAdmin
      .from("requests")
      .select("*, products(*)")
      .eq("id", data.requestId)
      .eq("user_id", userId)
      .single();

    if (reqError || !request) {
      throw new Response("Demande introuvable", { status: 404 });
    }

    if (!request.products) {
      throw new Response("Produit associé introuvable", { status: 404 });
    }

    const payableStatuses = ["pending", "reviewing", "scheduled"];
    if (!payableStatuses.includes(request.status)) {
      throw new Response(`Cette demande ne peut pas être payée (statut: ${request.status})`, {
        status: 400,
      });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name,last_name,phone")
      .eq("id", userId)
      .single();

    const product = request.products;
    let amount: number;
    let paymentType: "upfront" | "monthly" | "full";
    let description: string;

    if (product.price_upfront && product.price_monthly) {
      amount = product.price_upfront * request.quantity;
      paymentType = "upfront";
      description = `Acompte - ${product.title} (×${request.quantity})`;
    } else {
      amount = product.price_xof * request.quantity;
      paymentType = "full";
      description = `Paiement complet - ${product.title} (×${request.quantity})`;
    }

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = userData.user?.email ?? "";

    const result = await createPayment({
      requestId: data.requestId,
      userId,
      amount,
      description,
      customerEmail: email,
      customerFirstName: profile?.first_name ?? "Client",
      customerLastName: profile?.last_name ?? "KIVA",
      customerPhone: profile?.phone ?? undefined,
      paymentType,
    });

    if (!result.success) {
      throw new Response(result.error ?? "Erreur lors du paiement", { status: 500 });
    }

    // ✅ Retourner UNIQUEMENT des données sérialisables (primitives)
    return {
      paymentId: result.paymentId,
      paymentUrl: result.paymentUrl,
    };
  });

export const checkPaymentStatus = createServerFn({ method: "GET" })
  .inputValidator((data) => paymentIdSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const payment = await getPaymentById(data.paymentId);

    if (!payment) {
      throw new Response("Paiement introuvable", { status: 404 });
    }

    if (payment.user_id !== context.userId) {
      throw new Response("Accès non autorisé", { status: 403 });
    }

    if (payment.status === "pending" && payment.fedapay_transaction_id) {
      const fedapayStatus = await verifyFedaPayTransaction(payment.fedapay_transaction_id);

      if (fedapayStatus) {
        if (fedapayStatus.status === "approved") {
          await updatePaymentStatus(
            data.paymentId,
            "approved",
            "Paiement confirmé via vérification FedaPay.",
            { verified_from: "client_poll", fedapay_status: fedapayStatus.status },
          );
          return { ...payment, status: "approved" };
        }

        if (fedapayStatus.status === "canceled" || fedapayStatus.status === "declined") {
          const status = fedapayStatus.status as "canceled" | "declined";
          await updatePaymentStatus(data.paymentId, status, "Paiement annulé ou refusé.", {
            verified_from: "client_poll",
            fedapay_status: fedapayStatus.status,
          });
          return { ...payment, status };
        }
      }
    }

    return payment;
  });

export const getPaymentDetails = createServerFn({ method: "GET" })
  .inputValidator((data) => paymentIdSchema.parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const payment = await getPaymentById(data.paymentId);

    if (!payment) {
      throw new Response("Paiement introuvable", { status: 404 });
    }

    if (payment.user_id !== context.userId) {
      throw new Response("Accès non autorisé", { status: 403 });
    }

    return payment;
  });
