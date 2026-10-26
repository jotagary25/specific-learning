import { useEffect, useState } from "react";
import {
  type BeforeInstallPromptEvent,
  isIos,
  isStandalone,
  rememberDismissed,
  wasDismissed,
} from "./install.ts";
import styles from "./Pwa.module.css";

/**
 * Suggests installing the app: the browser's own prompt where `beforeinstallprompt` exists
 * (Android/Chromium), manual "Add to Home Screen" steps on iOS. Hidden once installed or dismissed.
 */
export function InstallHint() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(() => isStandalone() || wasDismissed());
  const [ios] = useState(isIos);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden || (!prompt && !ios)) return null;

  const dismiss = () => {
    rememberDismissed();
    setHidden(true);
  };

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    if (choice.outcome === "accepted") setHidden(true);
  };

  return (
    <aside aria-label="Install the app" className={styles.install}>
      {prompt ? (
        <p>Install English Course on this device for a full-screen app and a home-screen icon.</p>
      ) : (
        <p>
          Install on iPhone or iPad: tap <strong>Share</strong>, then{" "}
          <strong>Add to Home Screen</strong>.
        </p>
      )}
      <div className={styles.actions}>
        {prompt && (
          <button type="button" className={styles.primary} onClick={() => void install()}>
            Install
          </button>
        )}
        <button type="button" className={styles.secondary} onClick={dismiss}>
          Not now
        </button>
      </div>
    </aside>
  );
}
