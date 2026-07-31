// src/server/payments.server.ts
// Logique métier pour les paiements FedaPay
// Ce fichier ne s'exécute QUE côté serveur

import { Transaction, Customer } from "@/integrations/fedapay/sdk.server";
import { getFedaPay, getAppUrl } from "@/integrations/fedapay/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];
type PaymentUpdate = Database["public"]["Tables"]["payments"]["Update"];
type PaymentEventInsert = Database["public"]["Tables"]["payment_events"]["Insert"];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreatePaymentInput {
  requestId: string;
  userId: string;
  amount: number;
  description: string;
  customerEmail: string;
  customerFirstName: string;
  customerLastName: string;
  customerPhone?: string;
  paymentType?: "upfront" | "monthly" | "full";
}

export interface CreatePaymentResult {
  success: boolean;
  paymentId?: string;
  paymentUrl?: string;
  error?: string;
}

// ─── Créer un client FedaPay (ou le récupérer) ──────────────────────────────

async function getOrCreateFedaPayCustomer(
  input: CreatePaymentInput,
  paymentId: string,
): Promise<number | null> {
  try {
    getFedaPay();

    const uniqueCustomerEmail =
      input.customerEmail.startsWith("phone_") && input.customerEmail.endsWith("@kiva.app")
        ? `feda-${paymentId}@kiva.app`
        : input.customerEmail;

    const customer = await Customer.create({
      firstname: input.customerFirstName,
      lastname: input.customerLastName,
      email: uniqueCustomerEmail,
      phone_number: input.customerPhone
        ? { number: input.customerPhone, country: "BJ" }
        : undefined,
    });

    return customer.id as number;
  } catch (err) {
    console.error("[FedaPay] Erreur création client:", err);
    return null;
  }
}

// ─── Créer une transaction FedaPay ──────────────────────────────────────────

async function createFedaPayTransaction(
  input: CreatePaymentInput,
  customerId: number | null,
  paymentId: string,
): Promise<{ transactionId: number; paymentUrl: string }> {
  getFedaPay();

  const appUrl = getAppUrl();

  const transactionData: Record<string, unknown> = {
    description: input.description,
    amount: input.amount,
    currency: { iso: "XOF" },
    callback_url: `${appUrl}/api/payment-callback?payment_id=${paymentId}`,
    custom_metadata: {
      payment_id: paymentId,
      request_id: input.requestId,
      user_id: input.userId,
    },
  };

  if (customerId !== null) {
    transactionData.customer = { id: customerId };
  }

  const transaction = await Transaction.create(transactionData);
  const tokenResult = await transaction.generateToken();
  const url = tokenResult.url;

  if (!url) {
    throw new Error("FedaPay n'a pas retourné d'URL de paiement");
  }

  return {
    transactionId: transaction.id as number,
    paymentUrl: url,
  };
}

// ─── Créer un paiement complet ──────────────────────────────────────────────

export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  try {
    const { data: existingPayment } = await supabaseAdmin
      .from("payments")
      .select("id, status, fedapay_transaction_id")
      .eq("request_id", input.requestId)
      .eq("user_id", input.userId)
      .in("status", ["pending", "approved"])
      .maybeSingle();

    if (existingPayment?.status === "approved") {
      return { success: false, error: "Cette demande a déjà été payée." };
    }

    // Création du paiement avec typage explicite
    const insertData: PaymentInsert = {
      request_id: input.requestId,
      user_id: input.userId,
      amount: input.amount,
      currency: "XOF",
      description: input.description,
      payment_type: input.paymentType || "upfront",
      status: "pending",
    };

    const { data: payment, error: insertError } = await supabaseAdmin
      .from("payments")
      .insert(insertData)
      .select("id")
      .single();

    if (insertError || !payment) {
      console.error("[Payment] Erreur insertion DB:", insertError);
      return { success: false, error: "Erreur lors de la création du paiement." };
    }

    const customerId = await getOrCreateFedaPayCustomer(input, payment.id);

    const { transactionId, paymentUrl } = await createFedaPayTransaction(
      input,
      customerId,
      payment.id,
    );

    // Mise à jour avec typage explicite
    const updateData: PaymentUpdate = {
      fedapay_transaction_id: String(transactionId),
    };

    await supabaseAdmin.from("payments").update(updateData).eq("id", payment.id);

    // Log de l'événement avec typage explicite
    const eventInsert: PaymentEventInsert = {
      payment_id: payment.id,
      status: "pending",
      comment: "Transaction FedaPay créée. En attente de paiement.",
      metadata: {
        fedapay_transaction_id: transactionId,
        amount: input.amount,
      },
    };

    await supabaseAdmin.from("payment_events").insert(eventInsert);

    await supabaseAdmin.from("requests").update({ status: "reviewing" }).eq("id", input.requestId);

    return {
      success: true,
      paymentId: payment.id,
      paymentUrl,
    };
  } catch (err) {
    const realErrorMessage = err instanceof Error ? err.message : JSON.stringify(err, null, 2);
    console.error("🚨🚨🚨 VRAIE ERREUR SERVEUR NETLIFY 🚨🚨🚨");
    console.error(err);
    return {
      success: false,
      error: `ERREUR RÉELLE: ${realErrorMessage}`,
    };
  }
}

// ─── Vérifier le statut d'une transaction FedaPay ───────────────────────────

export async function verifyFedaPayTransaction(transactionId: string): Promise<{
  status: string;
  amount: number;
  reference: string;
} | null> {
  try {
    getFedaPay();

    const transaction = await Transaction.retrieve(transactionId);
    return {
      status: transaction.status,
      amount: transaction.amount,
      reference: transaction.reference || "",
    };
  } catch (err) {
    console.error("[FedaPay] Erreur vérification transaction:", err);
    return null;
  }
}

// ─── Mettre à jour le statut d'un paiement ──────────────────────────────────

export async function updatePaymentStatus(
  paymentId: string,
  newStatus: "pending" | "approved" | "canceled" | "declined",
  comment?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  // Typage explicite pour l'update
  const updateData: PaymentUpdate = { status: newStatus };

  if (newStatus === "approved") {
    updateData.paid_at = new Date().toISOString();
  }

  await supabaseAdmin.from("payments").update(updateData).eq("id", paymentId);

  // Log de l'événement avec typage explicite
  const eventInsert: PaymentEventInsert = {
    payment_id: paymentId,
    status: newStatus,
    comment: comment || `Statut mis à jour: ${newStatus}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata: (metadata as any) || {},
  };
  await supabaseAdmin.from("payment_events").insert(eventInsert);

  if (newStatus === "approved") {
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("request_id")
      .eq("id", paymentId)
      .single();

    if (payment) {
      await supabaseAdmin
        .from("requests")
        .update({ status: "in_progress" })
        .eq("id", payment.request_id);

      await supabaseAdmin.from("request_events").insert({
        request_id: payment.request_id,
        status: "in_progress",
        comment: "Paiement reçu et validé.",
      });
    }
  }
}

// ─── Récupérer les paiements d'un utilisateur ───────────────────────────────

export async function getUserPayments(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("*, request_events(*), products:requests(*, products(*))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Payment] Erreur récupération paiements:", error);
    return [];
  }

  return data || [];
}

// ─── Récupérer un paiement par ID ───────────────────────────────────────────

export async function getPaymentById(paymentId: string) {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("*, requests(*, products(*))")
    .eq("id", paymentId)
    .single();

  if (error) {
    console.error("[Payment] Erreur récupération paiement:", error);
    return null;
  }

  return data;
}
