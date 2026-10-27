import { Button, StatusDot } from "../ui/index.ts";
import styles from "./Pwa.module.css";
import { useRegisterSW } from "./sw-register.ts";

const UPDATE_CHECK_MS = 60 * 60 * 1000;

/** Asks before switching to a newly deployed version (service worker `registerType: prompt`). */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    // An installed app can stay open for days: look for new deployments every hour.
    onRegisteredSW: (_url, registration) => {
      if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_MS);
    },
  });

  if (needRefresh) {
    return (
      <div role="alert" data-tone="cream" className={styles.toast}>
        <span className={styles.toastText}>
          <StatusDot pulse />
          New version available
        </span>
        <div className={styles.actions}>
          <Button onClick={() => void updateServiceWorker(true)}>Reload</Button>
          <Button variant="ghost" onClick={() => setNeedRefresh(false)}>
            Later
          </Button>
        </div>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div role="status" data-tone="cream" className={styles.toast}>
        <span className={styles.toastText}>
          <StatusDot tone="correct" />
          Ready to open offline
        </span>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setOfflineReady(false)}>
            OK
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
