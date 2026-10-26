import { NavLink, Outlet } from "react-router";
import { HealthIndicator } from "../features/home/HealthIndicator.tsx";
import { SessionBar } from "../features/today/SessionBar.tsx";
import { SessionComplete } from "../features/today/SessionComplete.tsx";
import { SessionProvider } from "../features/today/SessionContext.tsx";
import styles from "./Layout.module.css";

export function Layout() {
  return (
    <SessionProvider>
      <div className={styles.shell}>
        <header className={styles.header}>
          <span className={styles.brand}>English Course</span>
          <nav aria-label="Main" className={styles.nav}>
            <NavLink to="/" end className={styles.link}>
              Today
            </NavLink>
            <NavLink to="/units" className={styles.link}>
              Units
            </NavLink>
            <NavLink to="/reading" className={styles.link}>
              Reading
            </NavLink>
            <NavLink to="/vocabulary" className={styles.link}>
              Vocabulary
            </NavLink>
            <NavLink to="/writing" className={styles.link}>
              Writing
            </NavLink>
            <NavLink to="/progress" className={styles.link}>
              Progress
            </NavLink>
            <NavLink to="/settings" className={styles.link}>
              Settings
            </NavLink>
          </nav>
        </header>
        <main className={styles.main}>
          <Outlet />
        </main>
        <SessionBar />
        <footer className={styles.footer}>
          <HealthIndicator />
        </footer>
        <SessionComplete />
      </div>
    </SessionProvider>
  );
}
