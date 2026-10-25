import { Outlet } from "react-router";
import styles from "./Layout.module.css";

export function Layout() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>English Course</header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
