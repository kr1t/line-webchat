"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { RequestError } from "@/lib/fetcher";

export interface LiffMe {
  userId: string;
  displayName: string | null;
  pictureUrl: string | null;
  role: "CUSTOMER" | null;
  pendingApproval: boolean;
}

type LiffSdk = typeof import("@line/liff").default;

interface LiffState {
  me: LiffMe | null;
  liff: LiffSdk | null;
  error: string | null;
  refresh: () => Promise<void>;
}

const LiffContext = createContext<LiffState | null>(null);
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

/** LIFF calls go straight to /api/liff/* with the customer cookie (never the admin one). */
export async function liffFetch<T>(path: string, init?: { method?: "POST"; body?: unknown }): Promise<T> {
  const res = await fetch(`/api/liff${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new RequestError(res.status, typeof body?.code === "string" ? body.code : undefined);
  }
  return res.json() as Promise<T>;
}

/**
 * 1. Reuse a valid LIFF cookie if there is one (it lasts an hour).
 * 2. Otherwise start LIFF, log in with LINE, and trade the ID token for a cookie.
 *    The server checks the ID token with LINE; the user id on this page is never trusted.
 */
export function LiffProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<LiffMe | null>(null);
  const [sdk, setSdk] = useState<LiffSdk | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setMe(await liffFetch<LiffMe>("/me"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let liff: LiffSdk | null = null;
      if (LIFF_ID) {
        liff = (await import("@line/liff")).default;
        await liff.init({ liffId: LIFF_ID });
        if (!cancelled) setSdk(liff);
      }
      try {
        const current = await liffFetch<LiffMe>("/me");
        if (!cancelled) setMe(current);
        return;
      } catch (err) {
        if (!(err instanceof RequestError && err.status === 401)) throw err;
      }
      if (!liff) throw new Error("not_configured");
      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return;
      }
      const idToken = liff.getIDToken();
      if (!idToken) throw new Error("no_id_token");
      const signedIn = await liffFetch<LiffMe>("/session", { method: "POST", body: { idToken } });
      if (!cancelled) setMe(signedIn);
    })().catch((err: unknown) => {
      if (cancelled) return;
      setError(
        err instanceof Error && err.message === "not_configured"
          ? "เปิดหน้านี้จากแอป LINE นะครับ"
          : "เชื่อมต่อ LINE ไม่สำเร็จ ลองปิดแล้วเปิดใหม่อีกครั้ง",
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <LiffContext.Provider value={{ me, liff: sdk, error, refresh }}>{children}</LiffContext.Provider>;
}

export function useLiff(): LiffState {
  const ctx = useContext(LiffContext);
  if (!ctx) throw new Error("useLiff must be used inside LiffProvider");
  return ctx;
}
