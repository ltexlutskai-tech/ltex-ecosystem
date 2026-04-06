/**
 * API client for the L-TEX mobile app.
 * All requests go to the Next.js API routes.
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://ltex.com.ua/api";

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, params } = options;

  let url = `${API_URL}${path}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? "Помилка сервера");
  }

  return data as T;
}

// ─── Typed API methods ───────────────────────────────────────────────────────

// Auth
export const authApi = {
  login: (phone: string, name?: string) =>
    api<{ customerId: string; name: string; phone: string; isNew: boolean }>("/mobile/auth", {
      method: "POST",
      body: { phone, name },
    }),
};

// Profile
export const profileApi = {
  get: (customerId: string) =>
    api("/mobile/profile", { params: { customerId } }),
  update: (data: { customerId: string; name?: string; email?: string; telegram?: string; city?: string }) =>
    api("/mobile/profile", { method: "PUT", body: data }),
};

// Catalog (reuses existing store API)
export const catalogApi = {
  products: (params: Record<string, string>) =>
    api("/mobile/catalog" in {} ? "/mobile/catalog" : "/search", { params }),
  search: (q: string) =>
    api<{ results: Array<{ id: string; name: string; slug: string; quality: string }> }>("/search", {
      params: { q },
    }),
};

// Favorites
export const favoritesApi = {
  list: (customerId: string) =>
    api("/mobile/favorites", { params: { customerId } }),
  add: (customerId: string, productId: string) =>
    api("/mobile/favorites", { method: "POST", body: { customerId, productId } }),
  remove: (customerId: string, productId: string) =>
    api("/mobile/favorites", { method: "DELETE", body: { customerId, productId } }),
};

// Orders
export const ordersApi = {
  list: (customerId: string) =>
    api("/mobile/orders", { params: { customerId } }),
  detail: (customerId: string, orderId: string) =>
    api("/mobile/orders", { params: { customerId, orderId } }),
};

// Chat
export const chatApi = {
  messages: (customerId: string, cursor?: string) =>
    api("/mobile/chat", { params: { customerId, ...(cursor && { cursor }) } }),
  send: (customerId: string, text: string, imageUrl?: string) =>
    api("/mobile/chat", { method: "POST", body: { customerId, text, imageUrl } }),
  markRead: (customerId: string, upToMessageId?: string) =>
    api("/mobile/chat", { method: "PUT", body: { customerId, upToMessageId } }),
};

// Shipments
export const shipmentsApi = {
  list: (customerId: string) =>
    api("/mobile/shipments", { params: { customerId } }),
  track: (trackingNumber: string) =>
    api("/mobile/shipments", { params: { trackingNumber } }),
};

// Payments
export const paymentsApi = {
  list: (customerId: string) =>
    api("/mobile/payments", { params: { customerId } }),
  forOrder: (orderId: string) =>
    api("/mobile/payments", { params: { orderId } }),
};

// Notifications
export const notificationsApi = {
  registerToken: (customerId: string, token: string, platform: string) =>
    api("/mobile/notifications", {
      method: "POST",
      body: { action: "register_token", customerId, token, platform },
    }),
  subscribeVideo: (customerId: string, productId: string) =>
    api("/mobile/notifications", {
      method: "POST",
      body: { action: "subscribe_video", customerId, productId },
    }),
  unsubscribeVideo: (customerId: string, productId: string) =>
    api("/mobile/notifications", {
      method: "DELETE",
      body: { action: "unsubscribe_video", customerId, productId },
    }),
  list: (customerId: string) =>
    api("/mobile/notifications", { params: { customerId } }),
};
