let cachedToken: string | null = null;
let tokenPromise: Promise<string> | null = null;

export async function getAuthToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  if (tokenPromise) return tokenPromise;

  tokenPromise = fetch("/api/auth/session")
    .then((r) => {
      if (!r.ok) throw new Error("Failed to get auth session");
      return r.json();
    })
    .then((data: { token: string }) => {
      cachedToken = data.token;
      return data.token;
    })
    .finally(() => {
      tokenPromise = null;
    });

  return tokenPromise;
}

export function getAuthTokenSync(): string | null {
  return cachedToken;
}

export async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getAuthToken();
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    cachedToken = null;
  }
  return res;
}
