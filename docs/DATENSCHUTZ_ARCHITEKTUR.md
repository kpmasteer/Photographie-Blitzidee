# Datenschutzarchitektur

Ohne Cloud-Konfiguration liegen Unternehmens-, Kunden-, Rechnungs-, Zahlungs- und Ausgabendaten ausschließlich in IndexedDB. Im konfigurierten Cloud-Modus ist Supabase PostgreSQL die gemeinsame Datenquelle; IndexedDB bleibt Offline-Cache.

Jeder Cloud-Datensatz trägt eine `organization_id`. Row Level Security prüft eine aktive Mitgliedschaft. Rollen sind `owner`, `admin`, `member` und `read_only`. Autorisierung verwendet keine benutzeränderbaren `user_metadata`-Claims. Storage-Buckets sind privat und verwenden Organisations-IDs als erstes Pfadsegment.

Im Frontend stehen ausschließlich URL und öffentlicher Publishable-/Anon-Key. Secret- und Service-Role-Schlüssel dürfen nicht in Build, Git, LocalStorage, IndexedDB oder Logs gelangen. Tracking wird nicht eingesetzt.

Vollständige JSON-Backups bleiben unabhängig vom Cloud-Backend möglich. Verschlüsselte Backups verwenden PBKDF2, AES-GCM und Integritätsprüfung. Mobil erfolgt die Übergabe über das native Speichern-/Teilen-Menü.
