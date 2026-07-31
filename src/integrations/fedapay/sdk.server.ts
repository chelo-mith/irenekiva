import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type FedaPayClient = {
  setApiKey: (key: string) => void;
  setEnvironment: (env: "sandbox" | "live") => void;
};

type FedaPayModule = {
  FedaPay: FedaPayClient;
  Transaction: {
    create: (...args: unknown[]) => Promise<unknown>;
    retrieve: (...args: unknown[]) => Promise<unknown>;
  };
  Customer: {
    create: (...args: unknown[]) => Promise<unknown>;
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
  create: (...args: unknown[]) => getFedapayModule().Transaction.create(...args),
  retrieve: (...args: unknown[]) => getFedapayModule().Transaction.retrieve(...args),
};

export const Customer = {
  create: (...args: unknown[]) => getFedapayModule().Customer.create(...args),
};

export const Webhook = {
  constructEvent: (...args: unknown[]) => getFedapayModule().Webhook.constructEvent(...args),
};
