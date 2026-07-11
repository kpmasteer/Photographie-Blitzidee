import { useContext, useEffect } from "react";
import { CloudContext } from "../context";
import { reportCloudRuntimeStatus } from "../operations";
import { startCloudSync, stopCloudSync } from "./service";

/** Mount once inside CloudContext.Provider; it renders no UI. */
export function CloudSyncRuntime() {
  const { configured, session, membership, runtime } = useContext(CloudContext);
  const organizationId = membership?.organization_id;

  useEffect(() => {
    if (!configured || !session || !organizationId) { stopCloudSync(); return; }
    let cancelled = false;
    void startCloudSync(organizationId)
      .then((service) => { if (cancelled && service) service.stop(); })
      .catch((cause) => reportCloudRuntimeStatus({
        phase: "error",
        lastError: cause instanceof Error ? cause.message : "Cloud-Abgleich konnte nicht gestartet werden."
      }));
    return () => { cancelled = true; stopCloudSync(); };
  }, [configured, session, organizationId, runtime.online]);

  return null;
}
