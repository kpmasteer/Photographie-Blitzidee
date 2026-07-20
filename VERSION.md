# Version

Aktuelle Version: **0.5.2**
Datenbankschema: **7**
Backupformat: **1**

Die App-Version wird zusätzlich in den Einstellungen angezeigt. App-Updates ersetzen nur den versionierten App-Cache; IndexedDB-Nutzerdaten werden über additive Schema-Migrationen erhalten.

Version 0.5.2 „Cloud Synchronisation Hardening“ behandelt Supabase dauerhaft als führenden Datenbestand. Nach jedem erfolgreichen Push wird ein vollständiger Cloud-Snapshot atomar in den lokalen IndexedDB-Cache übernommen; entfernte Datensätze und veraltete Rechnungspositionen verschwinden, während noch nicht übertragene Offline-Änderungen geschützt bleiben. Synchronisationsläufe werden lokal und unsichtbar mit Mengen, Konflikten, Fehlern und Dauer protokolliert.
