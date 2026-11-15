export class RequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(`Request failed: ${status}`);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new RequestError(res.status, typeof body?.code === "string" ? body.code : undefined);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Client-side reads go through the same-origin /api proxy; an expired session goes back to login. */
export async function fetcher<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { accept: "application/json" } });
  if (res.status === 401 && typeof window !== "undefined") {
    // Not in a component (no router here); a full reload also clears cached chat data
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
  return parse<T>(res);
}

export async function post<T = void>(path: string, body?: unknown, method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST"): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

export const patch = <T = void>(path: string, body: unknown) => post<T>(path, body, "PATCH");
export const put = <T = void>(path: string, body: unknown) => post<T>(path, body, "PUT");
export const del = <T = void>(path: string) => post<T>(path, undefined, "DELETE");
