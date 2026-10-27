import { Outlet } from "react-router";
import { HealthIndicator } from "../features/home/HealthIndicator.tsx";
import { TimeZoneBanner } from "../features/settings/TimeZoneBanner.tsx";
import { SessionBar } from "../features/today/SessionBar.tsx";
import { SessionComplete } from "../features/today/SessionComplete.tsx";
import { SessionProvider } from "../features/today/SessionContext.tsx";
import { TutorButton, TutorDrawer } from "../features/tutor/TutorDrawer.tsx";
import { TutorProvider } from "../features/tutor/TutorProvider.tsx";
import { InstallHint } from "../shared/pwa/InstallHint.tsx";
import { OfflineBanner } from "../shared/pwa/OfflineBanner.tsx";
import { UpdateToast } from "../shared/pwa/UpdateToast.tsx";
import styles from "./Layout.module.css";
import { MainNav } from "./MainNav.tsx";

export function Layout() {
  return (
    <SessionProvider>
      <TutorProvider>
        <div className={styles.shell}>
          <header className={styles.header}>
            <div className={styles.headerInner}>
              <span className={styles.brand}>English Course</span>
              <MainNav />
            </div>
          </header>
          <OfflineBanner />
          <InstallHint />
          <TimeZoneBanner />
          <main className={styles.main}>
            <Outlet />
          </main>
          <SessionBar />
          <footer className={styles.footer}>
            <div className={styles.footerInner}>
              <p className={`eyebrow ${styles.tagline}`}>
                An English course · Learn by reading the world
              </p>
              <HealthIndicator />
            </div>
          </footer>
          <SessionComplete />
          <TutorButton />
          <TutorDrawer />
          <UpdateToast />
        </div>
      </TutorProvider>
    </SessionProvider>
  );
}
