import { useContext, useEffect } from "react";
import { CloudContext } from "../context";
import { reportCloudRuntimeStatus } from "../operations";
import { startCloudSync, stopCloudSync } from "./service";
import { seedDatabase } from "../../lib/seed";

interface CloudSyncRuntimeProps {
  onReady: () => void;
  onError: (message: string) => void;
}

/** Mount once inside CloudContext.Provider; it renders no UI. */
export function CloudSyncRuntime({ onReady, onError }: CloudSyncRuntimeProps) {
  const { configured, session, membership } = useContext(CloudContext);
  const organizationId = membership?.organization_id;

  useEffect(() => {
    if (!configured || !session || !organizationId) {
      stopCloudSync();
      onReady();
      return;
    }
    let cancelled = false;
    void (async () => {
      await seedDatabase();
      return startCloudSync(organizationId);
    })()
      .then((service) => {
        if (cancelled && service) service.stop();
        else if (!cancelled) onReady();
      })
      .catch((cause) => {
        const message = cause instanceof Error ? cause.message : "Cloud-Abgleich konnte nicht gestartet werden.";
        reportCloudRuntimeStatus({ phase: "error", lastError: message });
        if (!cancelled) onError(message);
      });
    return () => { cancelled = true; stopCloudSync(); };
  }, [configured, session, organizationId, onReady, onError]);

  return null;
}
