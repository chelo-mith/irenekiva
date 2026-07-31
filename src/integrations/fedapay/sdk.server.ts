import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type FedaPayClient = {
  setApiKey: (key: string) => void;
  setEnvironment: (env: "sandbox" | "live") => void;
};

type FedaPayCustomer = {
  id: number;
  firstname?: string;
  lastname?: string;
  email?: string;
  phone_number?: unknown;
};

type FedaPayTokenResult = {
  url?: string | null;
};

type FedaPayTransaction = {
  id: number;
  status?: string;
  amount?: number;
  reference?: string | null;
  generateToken: () => Promise<FedaPayTokenResult>;
};

type FedaPayModule = {
  FedaPay: FedaPayClient;
  Transaction: {
    create: (data: Record<string, unknown>) => Promise<FedaPayTransaction>;
    retrieve: (id: string | number) => Promise<FedaPayTransaction>;
  };
  Customer: {
    create: (data: Record<string, unknown>) => Promise<FedaPayCustomer>;
  };
  Webhook: {
    constructEvent: (...args: unknown[]) => unknown;
  };
};

let _fedapayModule: FedaPayModule | undefined;

function getFedapayModule(): FedaPayModule {
  if (!_fedapayModule) {
    _fedapayModule = require("fedapay") as FedaPayModule;
  }
  return _fedapayModule;
}

export const FedaPay: FedaPayClient = {
  setApiKey: (key: string) => getFedapayModule().FedaPay.setApiKey(key),
  setEnvironment: (env: "sandbox" | "live") => getFedapayModule().FedaPay.setEnvironment(env),
};

export const Transaction = {
  create: (data: Record<string, unknown>) => getFedapayModule().Transaction.create(data),
  retrieve: (id: string | number) => getFedapayModule().Transaction.retrieve(id),
};

export const Customer = {
  create: (data: Record<string, unknown>) => getFedapayModule().Customer.create(data),
};

export const Webhook = {
  constructEvent: (...args: unknown[]) => getFedapayModule().Webhook.constructEvent(...args),
};
