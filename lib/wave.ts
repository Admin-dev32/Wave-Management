import { randomUUID } from 'node:crypto';
import { ApiError, waveError } from './errors';

const WAVE_ENDPOINT = 'https://gql.waveapps.com/graphql/public';

interface GraphQLError {
  message: string;
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

interface WaveGraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

export interface BusinessSummary {
  id: string;
  name: string;
  isActive: boolean;
}

export interface AccountSummary {
  id: string;
  name: string;
  type: string;
  subtype?: string | null;
}

export async function waveGraphQLFetch<T>(
  query: string,
  variables?: Record<string, unknown>,
  requestId?: string,
): Promise<T> {
  const token = process.env.WAVE_ACCESS_TOKEN;
  if (!token) {
    throw new ApiError(500, 'Missing WAVE_ACCESS_TOKEN', undefined, 'CONFIG_ERROR');
  }

  const res = await fetch(WAVE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Request-ID': requestId ?? randomUUID(),
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(
      502,
      `Wave request failed: ${res.status} ${res.statusText}`,
      { details: text.slice(0, 2000) },
      'WAVE_ERROR',
    );
  }

  const json = (await res.json()) as WaveGraphQLResponse<T>;
  if (json.errors && json.errors.length > 0) {
    throw waveError(502, 'Wave GraphQL error', { errors: json.errors });
  }
  if (!json.data) {
    throw waveError(502, 'Wave response missing data');
  }
  return json.data;
}

export async function fetchBusinesses(requestId?: string): Promise<BusinessSummary[]> {
  const query = `
    query ListBusinesses {
      businesses {
        edges {
          node { id name isActive }
        }
      }
    }
  `;
  const data = await waveGraphQLFetch<{ businesses: { edges: { node: BusinessSummary }[] } }>(query, {}, requestId);
  return data.businesses.edges.map((edge) => edge.node);
}

export async function fetchAccounts(
  businessId: string,
  types?: string[],
  queryText?: string,
  requestId?: string,
): Promise<AccountSummary[]> {
  const query = `
    query Accounts($businessId: ID!, $types: [AccountType!], $query: String) {
      business(id: $businessId) {
        id
        accounts(page: 1, pageSize: 200, types: $types, query: $query) {
          nodes { id name type subtype }
        }
      }
    }
  `;
  const data = await waveGraphQLFetch<{ business: { accounts: { nodes: AccountSummary[] } | null } | null }>(
    query,
    { businessId, types, query: queryText },
    requestId,
  );
  if (!data.business || !data.business.accounts) {
    throw new ApiError(404, 'Business not found or accounts unavailable');
  }
  return data.business.accounts.nodes;
}

export interface CustomerInput {
  businessId: string;
  name: string;
  email?: string;
  phone?: string;
  currency?: string;
}

export async function findCustomers(businessId: string, queryText: string, requestId?: string) {
  const query = `
    query Customers($businessId: ID!, $query: String) {
      business(id: $businessId) {
        id
        customers(page: 1, pageSize: 50, query: $query) {
          nodes { id name email phone }
        }
      }
    }
  `;
  const data = await waveGraphQLFetch<{ business: { customers: { nodes: { id: string; name: string; email?: string }[] } | null } | null }>(
    query,
    { businessId, query: queryText },
    requestId,
  );
  return data.business?.customers?.nodes ?? [];
}

export async function createCustomer(input: CustomerInput, requestId?: string) {
  const mutation = `
    mutation CreateCustomer($input: CustomerCreateInput!) {
      customerCreate(input: $input) {
        didSucceed
        inputErrors { message code path }
        customer { id name email }
      }
    }
  `;
  const data = await waveGraphQLFetch<{ customerCreate: any }>(mutation, { input }, requestId);
  const result = data.customerCreate;
  if (!result.didSucceed) {
    throw new ApiError(400, 'Wave input errors', { inputErrors: result.inputErrors });
  }
  return result.customer;
}

export interface ProductInput {
  businessId: string;
  name: string;
  unitPrice?: number;
  description?: string;
  incomeAccountId?: string;
}

export async function findProducts(businessId: string, name: string, requestId?: string) {
  const query = `
    query Products($businessId: ID!, $query: String) {
      business(id: $businessId) {
        id
        products(page: 1, pageSize: 50, query: $query) {
          nodes { id name unitPrice }
        }
      }
    }
  `;
  const data = await waveGraphQLFetch<{ business: { products: { nodes: { id: string; name: string; unitPrice?: number }[] } | null } | null }>(
    query,
    { businessId, query: name },
    requestId,
  );
  return data.business?.products?.nodes ?? [];
}

export async function createProduct(input: ProductInput, requestId?: string) {
  const mutation = `
    mutation CreateProduct($input: ProductCreateInput!) {
      productCreate(input: $input) {
        didSucceed
        inputErrors { message code path }
        product { id name unitPrice }
      }
    }
  `;
  const data = await waveGraphQLFetch<{ productCreate: any }>(mutation, { input }, requestId);
  const result = data.productCreate;
  if (!result.didSucceed) {
    throw new ApiError(400, 'Wave input errors', { inputErrors: result.inputErrors });
  }
  return result.product;
}

export interface ExpenseInput {
  businessId: string;
  date: string;
  amount: number;
  description: string;
  notes?: string;
  anchorAccountId: string;
  expenseAccountId: string;
  vendor?: string;
  externalId?: string;
}

export async function createExpense(input: ExpenseInput, requestId?: string) {
  const externalId = input.externalId || randomUUID();
  const mutation = `
    mutation MoneyTransactionCreate($input: MoneyTransactionCreateInput!) {
      moneyTransactionCreate(input: $input) {
        didSucceed
        inputErrors { message code path }
        moneyTransaction { id }
      }
    }
  `;
  const payload = {
    businessId: input.businessId,
    externalId,
    date: input.date,
    description: input.description,
    notes: input.notes ?? undefined,
    anchor: {
      accountId: input.anchorAccountId,
      amount: input.amount,
      direction: 'WITHDRAWAL',
    },
    lineItems: [
      {
        accountId: input.expenseAccountId,
        amount: input.amount,
        balance: 'INCREASE',
      },
    ],
    contacts: input.vendor ? [{ type: 'VENDOR', name: input.vendor }] : undefined,
  };

  const data = await waveGraphQLFetch<{ moneyTransactionCreate: any }>(mutation, { input: payload }, requestId);
  const result = data.moneyTransactionCreate;
  if (!result.didSucceed) {
    throw new ApiError(400, 'Wave input errors', { inputErrors: result.inputErrors });
  }
  return { transactionId: result.moneyTransaction.id, externalId };
}
