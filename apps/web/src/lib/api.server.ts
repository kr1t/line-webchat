import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`API request failed with status ${status}`);
  }
}

/**
 * Server-side GET to the API for SSR, sent with the visitor's cookies.
 * Never cached (chat data is per-request); a 401 sends the visitor to the login page.
 */
export async function apiGet<T>(path: string, { redirectOn401 = true } = {}): Promise<T> {
  const baseUrl = process.env.API_URL;
  if (!baseUrl) throw new Error("API_URL is not set");

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    cache: "no-store",
    headers: { accept: "application/json", cookie: (await cookies()).toString() },
  });
  if (res.status === 401 && redirectOn401) redirect("/login");
  if (!res.ok) throw new ApiError(res.status);
  return res.json() as Promise<T>;
}
