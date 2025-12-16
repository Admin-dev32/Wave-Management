import { randomUUID } from 'node:crypto';
import { ApiError, waveError } from './errors';
import { getCache, setCache } from './cache';

const WAVE_ENDPOINT = 'https://gql.waveapps.com/graphql/public';

const SCHEMA_CACHE_KEY = 'wave:schema';
const SCHEMA_TTL = 30 * 60 * 1000;

interface GraphQLLocation {
  line: number;
  column: number;
}

interface GraphQLError {
  message: string;
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
  locations?: GraphQLLocation[];
}

interface WaveGraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

export interface BusinessSummary {
  id: string;
  name: string;
  isPersonal: boolean;
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
    const formatted = json.errors.map((error) => ({
      message: error.message,
      path: error.path,
      locations: error.locations,
    }));
    console.error('Wave GraphQL errors', { requestId, errors: formatted });
    throw waveError(502, 'Wave GraphQL error', { errors: json.errors });
  }
  if (!json.data) {
    throw waveError(502, 'Wave response missing data');
  }
  return json.data;
}

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      types {
        ...FullType
      }
      directives {
        name
        description
        locations
        args {
          ...InputValue
        }
      }
    }
  }

  fragment FullType on __Type {
    kind
    name
    description
    fields(includeDeprecated: true) {
      name
      description
      args { ...InputValue }
      type { ...TypeRef }
      isDeprecated
      deprecationReason
    }
    inputFields { ...InputValue }
    interfaces { ...TypeRef }
    enumValues(includeDeprecated: true) {
      name
      description
      isDeprecated
      deprecationReason
    }
    possibleTypes { ...TypeRef }
  }

  fragment InputValue on __InputValue {
    name
    description
    type { ...TypeRef }
    defaultValue
  }

  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
          }
        }
      }
    }
  }
`;

export async function fetchWaveSchema(requestId?: string) {
  const cached = getCache<unknown>(SCHEMA_CACHE_KEY);
  if (cached) return cached;
  const schema = await waveGraphQLFetch<unknown>(INTROSPECTION_QUERY, {}, requestId);
  setCache(SCHEMA_CACHE_KEY, schema, SCHEMA_TTL);
  return schema;
}

export async function fetchBusinesses(requestId?: string): Promise<BusinessSummary[]> {
  const query = `
    query ListBusinesses {
      businesses(page: 1, pageSize: 10) {
        edges {
          node { id name isPersonal }
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
  requestId?: string,
): Promise<AccountSummary[]> {
  const query = `
    query Accounts($businessId: ID!, $types: [AccountTypeValue!]) {
      business(id: $businessId) {
        id
        accounts(page: 1, pageSize: 200, types: $types) {
          edges {
            node {
              id
              name
              type { name value }
              subtype { name value }
            }
          }
        }
      }
    }
  `;
  const data = await waveGraphQLFetch<{
    business: {
      accounts:
        | {
            edges: {
              node: {
                id: string;
                name: string;
                type: { name: string; value: string };
                subtype?: { name: string; value: string } | null;
              };
            }[];
          }
        | null;
    } | null;
  }>(
    query,
    { businessId, types },
    requestId,
  );
  if (!data.business || !data.business.accounts) {
    throw new ApiError(404, 'Business not found or accounts unavailable');
  }
  return data.business.accounts.edges.map((edge) => ({
    id: edge.node.id,
    name: edge.node.name,
    type: edge.node.type.value,
    subtype: edge.node.subtype?.value ?? null,
  }));
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
    query Customers($businessId: ID!) {
      business(id: $businessId) {
        id
        customers(page: 1, pageSize: 50, sort: [NAME_ASC]) {
          edges { node { id name email phone } }
        }
      }
    }
  `;
  const data = await waveGraphQLFetch<{
    business: { customers: { edges: { node: { id: string; name: string; email?: string; phone?: string } }[] } | null } | null;
  }>(query, { businessId }, requestId);
  const customers = data.business?.customers?.edges.map((edge) => edge.node) ?? [];
  if (!queryText) return customers;
  const q = queryText.toLowerCase();
  return customers.filter((c) => c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
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
    query Products($businessId: ID!) {
      business(id: $businessId) {
        id
        products(page: 1, pageSize: 50) {
          edges { node { id name unitPrice description } }
        }
      }
    }
  `;
  const data = await waveGraphQLFetch<{
    business: { products: { edges: { node: { id: string; name: string; unitPrice?: number; description?: string } }[] } | null } | null;
  }>(query, { businessId }, requestId);
  const products = data.business?.products?.edges.map((edge) => edge.node) ?? [];
  const q = name.toLowerCase();
  return products.filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
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
        transaction { id }
      }
    }
  `;
  const payload = {
    businessId: input.businessId,
    externalId,
    date: input.date,
    description: input.description,
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
  };

  const data = await waveGraphQLFetch<{ moneyTransactionCreate: any }>(mutation, { input: payload }, requestId);
  const result = data.moneyTransactionCreate;
  if (!result.didSucceed) {
    throw new ApiError(400, 'Wave input errors', { inputErrors: result.inputErrors });
  }
  return { transactionId: result.transaction.id, externalId };
}
