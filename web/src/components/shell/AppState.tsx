"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { GapState } from "@/lib/types";

export type Role = "engineer" | "lead" | "trainee";
export type ReviewChoice = "accepted" | "edited" | "dismissed";
export interface Review {
  choice: ReviewChoice;
  note?: string;
  at: string; // "HH:MM"
}
export interface GapUpdate {
  state: GapState;
  owner?: string;
}

interface AppState {
  role: Role;
  setRole: (r: Role) => void;
  reviews: Record<string, Review>;
  review: (itemId: string, choice: ReviewChoice, note?: string) => void;
  gaps: Record<string, GapUpdate>;
  updateGap: (gapId: string, update: GapUpdate) => void;
}

const Ctx = createContext<AppState | null>(null);
const ROLE_KEY = "lineready-role";
const REVIEW_KEY = "lineready-reviews-v2";
const GAP_KEY = "lineready-gaps";

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

const clock = () => new Date().toTimeString().slice(0, 5);

/**
 * Client-side role, review and readiness-gap state. Kept in the browser until the review and
 * readiness APIs exist; on the backend every choice is logged to the audit trail (architecture doc, F7).
 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>("engineer");
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [gaps, setGaps] = useState<Record<string, GapUpdate>>({});

  useEffect(() => {
    setRoleState(load<Role>(ROLE_KEY, "engineer"));
    setReviews(load<Record<string, Review>>(REVIEW_KEY, {}));
    setGaps(load<Record<string, GapUpdate>>(GAP_KEY, {}));
  }, []);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    save(ROLE_KEY, r);
  }, []);

  const review = useCallback((itemId: string, choice: ReviewChoice, note?: string) => {
    setReviews((prev) => {
      const next = { ...prev, [itemId]: { choice, note, at: clock() } };
      save(REVIEW_KEY, next);
      return next;
    });
  }, []);

  const updateGap = useCallback((gapId: string, update: GapUpdate) => {
    setGaps((prev) => {
      const next = { ...prev, [gapId]: update };
      save(GAP_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ role, setRole, reviews, review, gaps, updateGap }), [role, setRole, reviews, review, gaps, updateGap]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState must be used inside AppStateProvider");
  return v;
}
