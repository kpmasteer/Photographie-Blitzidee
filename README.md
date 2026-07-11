# Photographie Blitzidee Rechnungs-PWA

Version 0.5.0 ist eine installierbare, local-first Rechnungs- und Ausgabenverwaltung für Photographie Blitzidee. Mit konfiguriertem Supabase-Projekt synchronisiert sie verschlüsselt über HTTPS zwischen Geräten; IndexedDB bleibt Offline-Cache. Mobile Backups verwenden das native Speichern-/Teilen-Menü. Vorhandene lokale Kundendaten werden niemals ungefragt übertragen.

## Cloud- und lokale Betriebsart

Für den Cloud-Modus `.env.example` nach `.env.local` kopieren und ausschließlich `VITE_SUPABASE_URL` sowie den öffentlichen Publishable-/Anon-Key setzen. Niemals einen Secret- oder Service-Role-Key verwenden. Ohne diese Variablen bleibt die App vollständig lokal nutzbar. Einrichtung, Migration, Datenschutz und Konfliktverhalten stehen in `supabase/README.md`, `docs/MULTI_DEVICE_ARCHITECTURE.md` und `docs/MIGRATION_LOCAL_TO_CLOUD.md`.

Nach der Anmeldung per Magic Link wird eine Organisation gewählt oder einmalig erstellt. Ein frisches Gerät lädt den vorhandenen Cloud-Bestand. Erkennt die App bereits lokale Geschäftsdaten, sperrt sie die automatische Übertragung: Erst die Analyse im Bereich `Einstellungen → Cloud & Synchronisation`, ein erzeugtes Backup und die Bestätigung `DATEN ÜBERNEHMEN` starten die wiederaufnehmbare Migration.

## Installation und Start

Voraussetzung: Node.js 20 oder neuer.

```bash
cd rechnungsapp
npm install
npm run dev
```

Vite zeigt die lokale Adresse an, üblicherweise `http://localhost:5173`.

Produktionsprüfung und Vorschau:

```bash
npm run lint
npm test
npm run build
npm run preview
```

## Erster Start

Vor der ersten neuen Finalisierung verlangt die App die sichtbare Kontrolle von Anschrift, Steuernummer, Bankverbindung und Kleinunternehmerhinweis. Nicht in Excel vorhandene Daten werden leer angezeigt und nicht erfunden. Die sechs erkannten historischen Rechnungen aus 2016 werden einmalig und per Fingerprint gegen Doppelerfassung geschützt übernommen.

## Datenhaltung und Unveränderbarkeit

Dexie verwaltet das versionierte IndexedDB-Schema für Unternehmen, Kunden, Rechnungen, Zahlungen, Ausgaben, Belege, Audit- und Importprotokolle, Einstellungen sowie Synchronisationswarteschlange und Konflikte. LocalStorage wird ausschließlich für das Farbschema verwendet.

Entwürfe sind bearbeitbar. Im Cloud-Modus vergibt PostgreSQL Rechnungs- und Kundennummern atomar; eine Offline-Finalisierung ist bewusst gesperrt. Beim Finalisieren werden eine eindeutige Nummer, Kunden- und Unternehmenssnapshot, Inhalts-Hash und PDF-Snapshot gespeichert. Finalisierte Rechnungen werden zusätzlich durch Datenbank-Trigger gegen stille Änderungen oder Löschung geschützt. Korrekturen erfolgen über eine verknüpfte Stornorechnung. Kunden mit Historie werden archiviert.

## Rechnungen, PDF, Druck und Teilen

Der Editor rechnet Geld intern als Integer-Cent und Mengen in Tausendsteln. Pflichtangaben werden vor dem Finalisieren geprüft. Bei aktiver Kleinunternehmerregelung gibt es keinen Umsatzsteuersatz und keinen Umsatzsteuerbetrag.

PDFs werden im Browser als durchsuchbare DIN-A4-Dokumente erzeugt; lange Positionstabellen erhalten Folgeseiten und wiederholte Tabellenköpfe. `Teilen` nutzt auf unterstützten Geräten `navigator.canShare()` mit PDF-Datei. Als Fallback wird die PDF gespeichert und ein E-Mail-Entwurf geöffnet; der Anhang muss dann ausdrücklich manuell hinzugefügt werden.

## Zahlungserinnerungen

Beim Öffnen der App werden finalisierte, versendete, teilweise bezahlte und überfällige Rechnungen auf offene Restbeträge geprüft. Die erste lokale Erinnerung erscheint 14 Tage nach dem Rechnungsdatum. Im Dialog kann der offene Restbetrag mit dem aktuellen Datum als bezahlt verbucht oder die nächste Erinnerung auf morgen, in eine Woche oder in einen Kalendermonat verschoben werden. Ohne ausdrücklich gewählte Verlängerung wird keine zusätzliche Erinnerungsserie erzeugt. Die Funktion arbeitet lokal beim Öffnen der PWA; iOS beendet Web-Apps im Hintergrund, daher werden keine zuverlässigen Systemmeldungen bei vollständig geschlossener App versprochen.

## Excel-Import

Unter `Einstellungen → Excel-Jahresimport` können mehrere XLSX/XLSM-Dateien gemeinsam und ausschließlich lesend geprüft werden. Getrennte Adapter erkennen die Strukturvarianten 2016–2017, 2018–2022 und 2023–2025; die Vorschau umfasst Rechnungen, Zahlungen, Ausgaben, Vorlagen, Pflichtfeldprobleme und Konflikte. Dateihash und Datensatzfingerprints verhindern Wiederholungsimporte. Die ausführliche Quellenanalyse steht in [MIGRATION_REPORT.md](./MIGRATION_REPORT.md).

## Backup und Wiederherstellung

Ein vollständiges Backup enthält sämtliche Tabellen und Blob-Anhänge. Das JSON-Format besitzt Format-, Schema- und App-Version, Erstellungszeit sowie SHA-256-Integritätswert. Optional wird der gesamte Inhalt per AES-256-GCM verschlüsselt; der Schlüssel wird mit PBKDF2-SHA-256 und 250.000 Iterationen aus dem Passwort abgeleitet. Das Passwort wird nicht gespeichert und kann nicht wiederhergestellt werden.

Vor einer Wiederherstellung werden Format und Integrität geprüft. Danach ersetzt das Backup bewusst die lokale Datenbank. Regelmäßige externe Backups bleiben notwendig, weil Browserdaten durch Geräteverlust, Profilbereinigung oder Deinstallation verloren gehen können.

## PWA-Installation auf iPhone/iPad

1. Produktionsversion über HTTPS in Safari öffnen.
2. Teilen-Symbol antippen.
3. `Zum Home-Bildschirm` wählen.
4. Die installierte App starten.

Die App-Shell funktioniert offline. Safe Areas, große Touch-Flächen und Hoch-/Querformat werden berücksichtigt. Entwürfe, Kunden, Ausgaben, Auswertungen und PDF-Erzeugung arbeiten aus dem lokalen Cache. Änderungen werden nach Wiederherstellung der Verbindung synchronisiert; Finalisierung und endgültige Nummernvergabe benötigen im Cloud-Modus eine Verbindung.

## Updates

Ein neuer Service Worker wird im Hintergrund erkannt, aber nicht automatisch während der Arbeit aktiviert. Unter `Einstellungen → App-Version & Updates` kann das Update bewusst installiert werden. Nur alte App-Caches werden entfernt; IndexedDB-Nutzerdaten bleiben bestehen. Entwürfe sollten vorher gespeichert und ein Backup sollte regelmäßig erstellt werden.

## Bekannte Einschränkungen

- Die App erzeugt normale PDF-Rechnungen, noch keine validierten ZUGFeRD- oder XRechnung-Dateien.
- Ein E-Mail-Postfach zum Empfang von E-Rechnungen wird nicht innerhalb der App bereitgestellt.
- Eine optionale lokale PIN-Sperre ist noch nicht implementiert.
- Das historische Excel-Format enthält keine E-Mail-/Telefonangaben und kein separates Leistungs- oder Zahlungsdatum.
- Browserdruck und systemweite Teilen-Ziele unterscheiden sich je nach Gerät; der Download-Fallback bleibt verfügbar.
- Die App ist keine GoBD-, Finanzamts- oder Steuerberater-Zertifizierung.

## Rechtliche und steuerliche Abgrenzung

Die Kleinunternehmerrechnung unterstützt die Mindestangaben und den Hinweis auf die Steuerbefreiung nach [§ 34a UStDV](https://www.gesetze-im-internet.de/ustdv_1980/__34a.html). Rechnungen werden ohne automatische Löschung aufbewahrt; [§ 14b UStG](https://www.gesetze-im-internet.de/ustg_1980/__14b.html) nennt grundsätzlich acht Jahre. Laut [BMF-FAQ zur E-Rechnung, Stand März 2026](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html) sind Kleinunternehmer von der Ausstellung einer E-Rechnung ausgenommen, müssen E-Rechnungen aber empfangen können. Die App ersetzt keine individuelle rechtliche oder steuerliche Beratung und garantiert allein keine organisatorische GoBD-Konformität.

## Datenschutz und Sicherheit

Es gibt kein Tracking, keine Werbung und keine ungefragte Übertragung vorhandener Kundendaten. Im Cloud-Modus schützt Supabase Row Level Security jeden Datensatz über die Organisationsmitgliedschaft; Belege und PDFs liegen in privaten Storage-Buckets. Im Frontend wird nur der öffentliche Publishable-Key verwendet. Eine restriktive Content Security Policy blockiert nicht erlaubte Skripte, Objekte und Verbindungen. Belegtypen und -größen werden geprüft. Abhängigkeiten sind lokal gebündelt; `npm audit` muss bei Updates erneut ausgeführt werden.
