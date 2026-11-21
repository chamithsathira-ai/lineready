import { NavRail } from "@/components/shell/NavRail";
import { AppStateProvider } from "@/components/shell/AppState";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppStateProvider>
      <div className="app">
        <NavRail />
        <main className="main">{children}</main>
      </div>
    </AppStateProvider>
  );
}
