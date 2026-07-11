# Multi-Geräte- und Datenschutzarchitektur

## Aktueller Zustand

Die App bleibt local-first. IndexedDB ist geräte- und browserprofilspezifisch; es findet keine Cloud-Übertragung statt. Bis eine geprüfte Synchronisation existiert, erfolgt der Gerätewechsel ausschließlich über den vollständigen, integritätsgeprüften Backup-Export und einen bewusst bestätigten vollständigen Restore.

## Vorbereitete Schichten

- React-Oberfläche und zentrale Rechnungsberechnung
- Repository-Interfaces für Kunden, Rechnungen, Zahlungen, Ausgaben und Einstellungen
- aktuelle Dexie-/IndexedDB-Implementierung
- austauschbarer `AuthService`
- zukünftige Synchronisationswarteschlange mit idempotenten Operations-IDs

## Sichere Zielarchitektur

Eine mögliche spätere Implementierung verwendet Supabase Auth, PostgreSQL und Storage. Jede fachliche Tabelle erhält `user_id`, einen eindeutigen Schlüssel, Versions-/Zeitstempel und aktivierte Row Level Security. Policies müssen Eigentum mit `(select auth.uid()) = user_id` prüfen; `TO authenticated` allein reicht nicht. UPDATE-Policies benötigen `USING` und `WITH CHECK`. Der Browser erhält niemals einen Service-Role- oder Secret-Key. Belege und PDFs liegen in benutzergebundenen Storage-Pfaden mit passenden SELECT/INSERT/UPDATE-Regeln.

Vor Umsetzung sind AV-Vertrag, Hostingregion, Aufbewahrung, Löschkonzept, Backups, Verschlüsselung, Geräteverwaltung und Datenschutzinformation zu klären. Bestehende Daten werden niemals ohne ausdrückliche Zustimmung hochgeladen.

Referenzen für die spätere Umsetzung: [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Auth](https://supabase.com/docs/guides/auth) und [Data-API-Sicherheit](https://supabase.com/docs/guides/api/securing-your-api).

## Synchronisation und Konflikte

Lokale Änderungen werden mit UUID, Basisversion, Zeitstempel und Status in eine Outbox geschrieben. Der Server bestätigt angewandte Änderungen. Stammdaten können feld- oder versionsbasiert zusammengeführt werden; finalisierte Rechnungen sind unveränderlich. Konflikte an finalisierten Belegen dürfen nicht automatisch überschrieben werden.

Rechnungsnummern werden zukünftig ausschließlich serverseitig in einer PostgreSQL-Transaktion aus einem Nummernkreis pro Jahr vergeben und durch einen eindeutigen Index geschützt. Offline können Entwürfe erstellt, aber nicht endgültig finalisiert werden. Eine Blockreservierung wäre nur mit dokumentierten Lückenregeln zulässig.

## Sicherheitsstufen

1. Eine optionale lokale App-Sperre schützt nur vor zufälligem Zugriff. Eine PIN darf nur mit Salt und langsamem KDF-Hash gespeichert werden; Fehlversuche benötigen ansteigende Wartezeiten und eine Inaktivitätssperre. Sie ist keine vollständige Datenverschlüsselung.
2. Passkeys/WebAuthn können eine gerätespezifische Freigabe bieten.
3. Cloud-Synchronisation benötigt ein echtes Benutzerkonto, sichere Sitzungen, Abmeldung, Geräteverwaltung und optional 2FA. Bevorzugt werden Magic Link oder Passkey statt selbst gebauter Passwortspeicherung.

## Nächster Umsetzungsschritt

Zuerst Datenschutzentscheidungen und Datenmodell freigeben, dann ein separates Testprojekt mit RLS-Sicherheitstests, atomarer Rechnungsnummernfunktion und Testdaten aufbauen. Erst nach Security-Review und Restore-Test darf eine freiwillige Migration angeboten werden.
