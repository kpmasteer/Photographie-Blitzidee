# Synchronisation und Konflikte

Lokale Änderungen erhalten Queue-ID, Entität, Datensatz-ID, Aktion, lokale Version, Status, Versuche und letzte Fehlermeldung. Zustände: `pending`, `syncing`, `synced`, `conflict`, `failed`.

Serverdatensätze besitzen eine steigende `version`. Bei Versionsabweichung wird nicht überschrieben, sondern ein Konflikt angezeigt. Für Entwürfe stehen Serverversion, lokale Version und Kopie als neuer Entwurf zur Auswahl. Finalisierte Rechnungen bleiben unveränderlich.

Realtime-Ereignisse werden als `remote_change` markiert und dürfen keinen erneuten Upload auslösen. Soft Deletes verwenden `deleted_at`; ältere Offline-Geräte dürfen Tombstones nicht wieder hochladen.

Finalisieren ist offline gesperrt. Die endgültige Nummer wird ausschließlich atomar durch `finalize_invoice` vergeben.
