# Version

Aktuelle Version: **0.5.0**  
Datenbankschema: **6**  
Backupformat: **1**

Die App-Version wird zusätzlich in den Einstellungen angezeigt. App-Updates ersetzen nur den versionierten App-Cache; IndexedDB-Nutzerdaten werden über Schema-Migrationen erhalten.

Version 0.5.0 aktiviert die konfigurierte Supabase-Mehrgerätearchitektur. Ohne Cloud-Konfiguration bleibt die App vollständig lokal nutzbar. Eine Übernahme vorhandener lokaler Daten erfolgt ausschließlich nach Analyse, Backup und ausdrücklicher Bestätigung im Migrationsassistenten.
