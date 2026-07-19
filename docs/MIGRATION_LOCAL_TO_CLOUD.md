# Migration lokaler Daten in die Cloud

1. Unter `Einstellungen → Cloud & Synchronisation` die lokale Analyse starten.
2. Das dort erzeugte vollständige Backup über das native Speichern-/Teilen-Menü extern sichern.
3. Datensatzanzahlen und erkannte lokale Inhalte prüfen.
4. Die Bestätigung `DATEN ÜBERNEHMEN` eingeben.
5. Wiederholbare Upserts unter einer `import_batch`-ID ausführen lassen.
6. Anhänge in organisationsgebundene private Storage-Pfade übertragen lassen.
7. Anzahlen, historische Nummern, Endbeträge und Hashes vergleichen.
8. Offene Konflikte in derselben Einstellungsansicht entscheiden.

Lokale String-IDs müssen deterministisch auf UUIDs abgebildet und in einer Migrationszuordnung gespeichert werden. Historische Rechnungen werden mit Nummern, Snapshots und Endbeträgen übernommen und nicht neu berechnet.

Die Migration schreibt Fortschritt und Zuordnungen lokal mit und kann nach einem Verbindungsabbruch fortgesetzt werden. Ein erneuter Lauf verwendet stabile IDs und Fingerprints und erzeugt keine stillen Dubletten. Ein frisches Gerät ohne lokale Geschäftsdaten überspringt den Upload-Assistenten und lädt nur den bestehenden Cloud-Bestand.
