/**
 * API client for the L-TEX mobile app.
 * All requests go to the Next.js API routes.
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://ltex.com.ua/api";

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string>;
  /** Override the default token from the module-level state. */
  token?: string | null;
  /** Do not attach the Authorization header (e.g. the login call itself). */
  skipAuth?: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ─── Token management ────────────────────────────────────────────────────────
// The auth provider persists the token to SecureStore and mirrors it here
// so all api() calls can attach it to the Authorization header.

let currentToken: string | null = null;

export function setApiToken(token: string | null): void {
  currentToken = token;
}

export function getApiToken(): string | null {
  return currentToken;
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { method = "GET", body, params, token, skipAuth } = options;

  let url = `${API_URL}${path}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (!skipAuth) {
    const bearer = token ?? currentToken;
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
  }

  const res = await fetch(url, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? "Помилка сервера");
  }

  return data as T;
}

// ─── Typed API methods ───────────────────────────────────────────────────────

// Auth — login returns a token that must be persisted and attached to subsequent calls.
export const authApi = {
  login: (phone: string, name?: string) =>
    api<{
      customerId: string;
      name: string;
      phone: string;
      isNew: boolean;
      token: string;
      tokenExpiresIn: number;
    }>("/mobile/auth", {
      method: "POST",
      body: { phone, name },
      skipAuth: true,
    }),
};

// Profile
export const profileApi = {
  get: () => api("/mobile/profile"),
  update: (data: {
    name?: string;
    email?: string;
    telegram?: string;
    city?: string;
  }) => api("/mobile/profile", { method: "PUT", body: data }),
};

// Catalog (reuses existing store API)
export const catalogApi = {
  products: (params: Record<string, string>) =>
    api("/mobile/catalog" in {} ? "/mobile/catalog" : "/search", { params }),
  search: (q: string) =>
    api<{
      results: Array<{
        id: string;
        name: string;
        slug: string;
        quality: string;
      }>;
    }>("/search", {
      params: { q },
      skipAuth: true,
    }),
};

// Favorites
export const favoritesApi = {
  list: () => api("/mobile/favorites"),
  add: (productId: string) =>
    api("/mobile/favorites", {
      method: "POST",
      body: { productId },
    }),
  remove: (productId: string) =>
    api("/mobile/favorites", {
      method: "DELETE",
      body: { productId },
    }),
};

// Orders
export const ordersApi = {
  list: () => api("/mobile/orders"),
  detail: (orderId: string) => api("/mobile/orders", { params: { orderId } }),
};

// Chat
export const chatApi = {
  messages: (cursor?: string) =>
    api("/mobile/chat", { params: cursor ? { cursor } : {} }),
  send: (text: string, imageUrl?: string) =>
    api("/mobile/chat", {
      method: "POST",
      body: { text, imageUrl },
    }),
  markRead: (upToMessageId?: string) =>
    api("/mobile/chat", {
      method: "PUT",
      body: upToMessageId ? { upToMessageId } : {},
    }),
  /**
   * Returns the full SSE stream URL for EventSource connection.
   * Since EventSource cannot set custom headers, the token is passed via query param.
   */
  streamUrl: () => {
    const token = currentToken ?? "";
    return `${API_URL}/mobile/chat/stream?token=${encodeURIComponent(token)}`;
  },
};

// Shipments
export const shipmentsApi = {
  list: () => api("/mobile/shipments"),
  track: (trackingNumber: string) =>
    api("/mobile/shipments", { params: { trackingNumber } }),
};

// Payments
export const paymentsApi = {
  list: () => api("/mobile/payments"),
  forOrder: (orderId: string) =>
    api("/mobile/payments", { params: { orderId } }),
};

// Notifications
export const notificationsApi = {
  registerToken: (token: string, platform: string) =>
    api("/mobile/notifications", {
      method: "POST",
      body: { action: "register_token", token, platform },
    }),
  subscribeVideo: (productId: string) =>
    api("/mobile/notifications", {
      method: "POST",
      body: { action: "subscribe_video", productId },
    }),
  unsubscribeVideo: (productId: string) =>
    api("/mobile/notifications", {
      method: "DELETE",
      body: { action: "unsubscribe_video", productId },
    }),
  list: () => api("/mobile/notifications"),
};
