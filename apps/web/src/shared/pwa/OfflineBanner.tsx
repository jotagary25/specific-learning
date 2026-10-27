import { useOnline } from "./online.ts";
import styles from "./Pwa.module.css";

/** Shown while the device is offline; explains what still works and that nothing is queued. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className={styles.offline}>
      <p className={styles.stripInner}>
        <strong className={styles.stripLabel}>You're offline.</strong> Units and articles you
        already opened stay readable. Answers, reviews, writing and AI help need a connection —
        nothing is saved or queued while offline.
      </p>
    </div>
  );
}
