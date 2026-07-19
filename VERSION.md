# Version

Aktuelle Version: **0.5.1**
Datenbankschema: **6**
Backupformat: **1**

Die App-Version wird zusätzlich in den Einstellungen angezeigt. App-Updates ersetzen nur den versionierten App-Cache; IndexedDB-Nutzerdaten werden über Schema-Migrationen erhalten.

Version 0.5.1 verwendet Supabase als verbindlichen gemeinsamen Datenbestand. IndexedDB bleibt Offline-Cache und Warteschlange. Anmeldung, Organisationsfreigabe, Realtime-Token, Benutzerwechsel und Cache-Trennung wurden produktiv geprüft. Eine Übernahme vorhandener lokaler Daten erfolgt ausschließlich nach Analyse, Backup und ausdrücklicher Bestätigung im Migrationsassistenten.
