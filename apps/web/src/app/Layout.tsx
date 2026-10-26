import { NavLink, Outlet } from "react-router";
import styles from "./Layout.module.css";

export function Layout() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>English Course</span>
        <nav aria-label="Main" className={styles.nav}>
          <NavLink to="/" end className={styles.link}>
            Home
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
          <NavLink to="/settings" className={styles.link}>
            Settings
          </NavLink>
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
