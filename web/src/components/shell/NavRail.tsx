"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookOpen, ClipboardList, GraduationCap, MessageCircle, Package, Plane, User } from "lucide-react";
import { useAppState, type Role } from "./AppState";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = { href: string; label: string; icon: typeof Plane };

const TONIGHT: NavItem = { href: "/tonight", label: "Tonight", icon: ClipboardList };
const AIRCRAFT: NavItem = { href: "/aircraft", label: "Aircraft", icon: Plane };
const ASK: NavItem = { href: "/ask", label: "Ask", icon: MessageCircle };
const MANUALS: NavItem = { href: "/manuals", label: "Manuals", icon: BookOpen };
const READINESS: NavItem = { href: "/readiness", label: "Readiness", icon: Package };
const COACH: NavItem = { href: "/coach", label: "Coach", icon: GraduationCap };

/** Each role sees only the destinations it needs. */
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  engineer: [TONIGHT, AIRCRAFT, ASK, MANUALS],
  lead: [TONIGHT, READINESS, AIRCRAFT, ASK],
  trainee: [COACH, MANUALS, ASK],
};

const ROLE_LABEL: Record<Role, string> = { engineer: "Certifying engineer", lead: "Shift lead", trainee: "Trainee" };

function NavLinks() {
  const path = usePathname();
  const { role } = useAppState();
  const isActive = (href: string) =>
    path === href || path.startsWith(href + "/") || (href === "/tonight" && path.startsWith("/dossier"));
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

function MeMenu() {
  const { role, setRole } = useAppState();
  const [open, setOpen] = useState(false);
  return (
    <div className="me">
      <button type="button" className="nav-item" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <User size={24} aria-hidden />
        Me
      </button>
      {open && (
        <div className="me-menu card" role="menu">
          <p className="t-label">Engineer B1</p>
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
