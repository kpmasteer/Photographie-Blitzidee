# Multi-Geräte- und Datenschutzarchitektur

## Aktueller Zustand

Die App bleibt ohne gesetzte Supabase-Variablen vollständig lokal. Mit Konfiguration stehen Magic-Link-Anmeldung, Organisationseinrichtung, Push/Pull-Synchronisation, Realtime, Konfliktoberfläche und ein abgesicherter Migrationsassistent bereit. Ein frisches Gerät lädt den Organisationsbestand automatisch; ein Gerät mit vorhandenen lokalen Geschäftsdaten überträgt nichts, bevor Analyse, Backup und ausdrückliche Bestätigung abgeschlossen wurden.

## Umgesetzte Schichten

- React-Oberfläche und zentrale Rechnungsberechnung
- Repository-Interfaces für Kunden, Rechnungen, Zahlungen, Ausgaben und Einstellungen
- aktuelle Dexie-/IndexedDB-Implementierung
- Supabase Auth Gate mit wiederherstellbarer Sitzung
- versionierte Dexie-Outbox, Synchronisationsmetadaten und Konfliktspeicher
- deterministische Zuordnung lokaler IDs zu Cloud-UUIDs
- Realtime-Pull ohne erneute Upload-Schleife
- wiederaufnehmbare Daten- und Anhangsmigration mit Import-Batches
- versionierte SQL-Migration mit Organisationen, Rollen, RLS, Realtime, Storage und Audit
- atomare serverseitige Organisationserstellung, Kunden-/Rechnungsnummernvergabe, Finalisierung, historische Übernahme und Stornierung

## Sichere Zielarchitektur

Die Implementierung verwendet Supabase Auth, PostgreSQL, Realtime und Storage. Jede fachliche Tabelle erhält `organization_id`, UUID, Versions-/Zeitstempel und aktivierte Row Level Security. Policies prüfen eine aktive Mitgliedschaft; `TO authenticated` allein reicht nicht. UPDATE-Policies besitzen `USING` und `WITH CHECK`. Der Browser erhält niemals einen Service-Role- oder Secret-Key. Belege und PDFs liegen in organisationsgebundenen privaten Storage-Pfaden.

Vor Umsetzung sind AV-Vertrag, Hostingregion, Aufbewahrung, Löschkonzept, Backups, Verschlüsselung, Geräteverwaltung und Datenschutzinformation zu klären. Bestehende Daten werden niemals ohne ausdrückliche Zustimmung hochgeladen.

Referenzen für die spätere Umsetzung: [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Auth](https://supabase.com/docs/guides/auth) und [Data-API-Sicherheit](https://supabase.com/docs/guides/api/securing-your-api).

## Synchronisation und Konflikte

Lokale Änderungen werden mit UUID, Basisversion, Zeitstempel und Status in eine Outbox geschrieben. Der Server bestätigt angewandte Änderungen. Stammdaten können feld- oder versionsbasiert zusammengeführt werden; finalisierte Rechnungen sind unveränderlich. Konflikte an finalisierten Belegen dürfen nicht automatisch überschrieben werden.

Rechnungsnummern werden ausschließlich serverseitig in einer PostgreSQL-Transaktion aus einem Nummernkreis pro Jahr vergeben und durch einen eindeutigen Index geschützt. Offline können Entwürfe erstellt, aber nicht endgültig finalisiert werden. Historische Rechnungsnummern werden über einen getrennten, geschützten Importpfad unverändert übernommen.

## Sicherheitsstufen

1. Eine optionale lokale App-Sperre schützt nur vor zufälligem Zugriff. Eine PIN darf nur mit Salt und langsamem KDF-Hash gespeichert werden; Fehlversuche benötigen ansteigende Wartezeiten und eine Inaktivitätssperre. Sie ist keine vollständige Datenverschlüsselung.
2. Passkeys/WebAuthn können eine gerätespezifische Freigabe bieten.
3. Cloud-Synchronisation benötigt ein echtes Benutzerkonto, sichere Sitzungen, Abmeldung, Geräteverwaltung und optional 2FA. Bevorzugt werden Magic Link oder Passkey statt selbst gebauter Passwortspeicherung.

## Verifikation

Die produktive Migration wurde auf dem Projekt `Photographie Blitzidee` angewendet. Der Supabase Security Advisor meldet keine Sicherheitswarnungen. Transaktionale Tests mit zwei Benutzern und zwei Organisationen bestätigten die Mandantentrennung; parallele Finalisierungsaufrufe erzeugten unterschiedliche, lückenfrei atomar reservierte Nummern. Testdatensätze wurden anschließend vollständig entfernt.
