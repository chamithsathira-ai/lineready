import { NavRail } from "@/components/shell/NavRail";
import { AppStateProvider } from "@/components/shell/AppState";
import { SourceSheetProvider } from "@/components/shell/SourceSheet";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppStateProvider>
      <SourceSheetProvider>
        <div className="app">
          <NavRail />
          <main className="main">{children}</main>
        </div>
      </SourceSheetProvider>
    </AppStateProvider>
  );
}
