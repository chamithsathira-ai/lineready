"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRightLeft, BookOpen, ClipboardList, FileCheck, GraduationCap, MessageCircle, Package, Plane, User } from "lucide-react";
import { getJSON } from "@/lib/client";
import { useAppState, type Role } from "./AppState";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = { href: string; label: string; icon: typeof Plane };

const TONIGHT: NavItem = { href: "/tonight", label: "Tonight", icon: ClipboardList };
const AIRCRAFT: NavItem = { href: "/aircraft", label: "Aircraft", icon: Plane };
const ASK: NavItem = { href: "/ask", label: "Ask", icon: MessageCircle };
const MANUALS: NavItem = { href: "/manuals", label: "Manuals", icon: BookOpen };
const READINESS: NavItem = { href: "/readiness", label: "Readiness", icon: Package };
const COACH: NavItem = { href: "/coach", label: "Coach", icon: GraduationCap };
const LOGBOOK: NavItem = { href: "/logbook", label: "Logbook", icon: FileCheck };
const HANDOVER: NavItem = { href: "/handover", label: "Handover", icon: ArrowRightLeft };

/** Each role sees only the destinations it needs. */
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  engineer: [TONIGHT, AIRCRAFT, ASK, MANUALS, LOGBOOK, HANDOVER],
  lead: [TONIGHT, READINESS, AIRCRAFT, ASK, HANDOVER],
  trainee: [COACH, MANUALS, ASK],
};

const ROLE_LABEL: Record<Role, string> = { engineer: "Certifying engineer", lead: "Shift lead", trainee: "Trainee" };

function NavLinks() {
  const path = usePathname();
  const { role } = useAppState();
  const isActive = (href: string) =>
    path === href || path.startsWith(href + "/") || (href === "/tonight" && path.startsWith("/dossier")) || (href === "/aircraft" && path.startsWith("/pack"));
  return (
    <>
      {NAV_BY_ROLE[role].map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="nav-item" aria-current={isActive(href) ? "page" : undefined}>
          <Icon size={24} strokeWidth={2} aria-hidden />
          {label}
        </Link>
      ))}
    </>
  );
}

interface Engineer { engineer_id: string; name: string; role: string; licence: string; aircraft: number }

function readCookie(name: string): string | undefined {
  return document.cookie.split("; ").find((c) => c.startsWith(name + "="))?.split("=")[1];
}

function MeMenu() {
  const { role, setRole } = useAppState();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [current, setCurrent] = useState("E1");

  useEffect(() => {
    setCurrent(readCookie("lr-engineer") ?? "E1");
    getJSON<Engineer[]>("/engineers").then(setEngineers).catch(() => setEngineers([])); // empty in demo mode
  }, []);

  const pick = (id: string) => {
    document.cookie = `lr-engineer=${id}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    setCurrent(id);
    router.refresh(); // server pages re-read the cookie and load this engineer's brief
  };
  const me = engineers.find((e) => e.engineer_id === current);
  return (
    <div className="me">
      <button type="button" className="nav-item" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <User size={24} aria-hidden />
        Me
      </button>
      {open && (
        <div className="me-menu card" role="menu">
          <p className="t-label">{me ? `${me.name} · ${me.licence}` : "Engineer"}</p>
          {engineers.length > 0 && (
            <>
              <p className="t-caption">Brief for</p>
              <div className="seg" role="group" aria-label="Engineer">
                {engineers.map((e) => (
                  <button key={e.engineer_id} type="button" aria-pressed={current === e.engineer_id} onClick={() => pick(e.engineer_id)}>
                    {e.name} · {e.aircraft} a/c
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="t-caption">View as</p>
          <div className="seg" role="group" aria-label="Role">
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <ThemeToggle />
        </div>
      )}
    </div>
  );
}

/** Rail on tablet and desktop; the same links become a bottom bar on phones (see globals.css). */
export function NavRail() {
  return (
    <>
      <nav className="rail" aria-label="Main">
        <Link href="/tonight" className="rail-logo" aria-label="LineReady home">
          LR
        </Link>
        <NavLinks />
        <span className="grow" />
        <MeMenu />
      </nav>
      <nav className="bottombar" aria-label="Main">
        <NavLinks />
        <MeMenu />
      </nav>
    </>
  );
}
