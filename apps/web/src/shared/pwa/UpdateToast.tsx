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
      <div role="alert" className={styles.toast}>
        <span>New version available</span>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            onClick={() => void updateServiceWorker(true)}
          >
            Reload
          </button>
          <button type="button" className={styles.secondary} onClick={() => setNeedRefresh(false)}>
            Later
          </button>
        </div>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div role="status" className={styles.toast}>
        <span>Ready to open offline</span>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={() => setOfflineReady(false)}>
            OK
          </button>
        </div>
      </div>
    );
  }

  return null;
}
