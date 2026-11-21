"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Role = "engineer" | "lead" | "trainee";
export type ReviewChoice = "accepted" | "edited" | "dismissed";

interface AppState {
  role: Role;
  setRole: (r: Role) => void;
  reviews: Record<string, ReviewChoice>;
  review: (itemId: string, choice: ReviewChoice) => void;
}

const Ctx = createContext<AppState | null>(null);
const ROLE_KEY = "lineready-role";
const REVIEW_KEY = "lineready-reviews";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * Client-side role and review state. Reviews are kept in the browser until the review API exists;
 * every choice is meant to be logged to the audit trail on the backend (architecture doc, F7).
 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>("engineer");
  const [reviews, setReviews] = useState<Record<string, ReviewChoice>>({});

  useEffect(() => {
    setRoleState(load<Role>(ROLE_KEY, "engineer"));
    setReviews(load<Record<string, ReviewChoice>>(REVIEW_KEY, {}));
  }, []);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    save(ROLE_KEY, r);
  }, []);

  const review = useCallback((itemId: string, choice: ReviewChoice) => {
    setReviews((prev) => {
      const next = { ...prev, [itemId]: choice };
      save(REVIEW_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ role, setRole, reviews, review }), [role, setRole, reviews, review]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState must be used inside AppStateProvider");
  return v;
}
