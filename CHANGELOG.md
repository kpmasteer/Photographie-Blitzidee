# Changelog

## 0.4.1 - 2026-07-11

- Rechnungsdruck vollständig vom responsiven App-DOM getrennt
- temporäres, eigenständiges A4-Druckdokument mit kontrolliertem Laden von Logo und Schriftarten
- geräteunabhängige Seitengeometrie ohne Viewport-Skalierung
- zusätzliche leere Druckseiten durch App-Container und CSS-Wechselwirkungen verhindert
- Gewinn-/Verlustermittlung als eigenes druckfähiges A4-Dokument statt Ausdruck der Eingabeseite
- Druckinhalt wird vor dem Öffnen des Druckdialogs auf Pflichtinhalte und messbare Höhe geprüft

## 0.4.0 - 2026-07-11

- Absturz bei festem Gesamtrabatt behoben und Rabattberechnung zentralisiert
- feste Positionsrabatte als stabile Stringeingabe mit später Centnormalisierung
- Entwurfsdruck auf das Rechnungsdokument isoliert
- festes geräteunabhängiges DIN-A4-Rechnungslayout
- gemeinsame `InvoiceDocument`-Komponente für Vorschau und Druck; PDF nutzt dieselben normalisierten Daten
- Rechnungsnummer beziehungsweise Entwurfsnummer sichtbar
- Juli-Einnahmen mit Zahlungseingang und Importquelle diagnostizierbar
- mobile Einstellungen direkt in der unteren Navigation erreichbar
- Freitextbeschreibung bleibt dauerhaft neben optionaler Vorlage verfügbar
- kompakte Sortier- und Filterdialoge für Rechnungen
- geschützte Testdaten-, Importquellen- und Gesamtrücksetzung
- Website-Link ergänzt
- Repository- und Auth-Schnittstellen sowie Multi-Geräte-/Datenschutzarchitektur vorbereitet

## 0.3.0 - 2026-07-10

- Rechnungsentwürfe können im Editor sicher gelöscht werden
- erweiterter Kosten- und Fahrtkostenimport mit Quellen-Fingerprints
- DIN-A4-optimierte einseitige Gewinn-/Verlustübersicht
- centgenaue Positions- und Gesamtrabatt-Datenstruktur samt Darstellung
- Betragsfelder markieren bestehende Werte beim Bearbeitungsbeginn
- echte Druckfunktion ohne automatischen PDF-Download
- gemeinsames HTML-Rechnungstemplate für Vorschau und Druck
- Beschreibungsvorlagen regelkonform lösch- oder archivierbar
- wiederkehrende monatliche, vierteljährliche, halbjährliche und jährliche Ausgaben mit lokaler Nachhol-Logik

## 0.2.0 - 2026-07-10

- Jahresimport 2016–2025 mit getrennten Strukturadaptern und erweiterter Vorschau
- Ausgabenimport mit stabilen Fingerprints und neutraler Kategorie für unklare Zuordnungen
- automatische, konfigurierbare und eindeutige Kundennummern
- importierbare, durchsuchbare und editierbare Beschreibungsvorlagen
- Einzelpreiseingabe mit Punkt oder Komma ohne störende Sofortformatierung
- stabiles Löschen und Duplizieren von Rechnungspositionen
- positionsgenaue Rechnungsvalidierung mit verständlichen Fehlermeldungen
- vollständige Entwurfs- und Rechnungsvorschau
- kombinierbare Kunden- und Rechnungssuche, Filterung und Sortierung

## 0.1.1 - 2026-07-10

- lokale Zahlungserinnerung für unbezahlte Rechnungen erstmals 14 Tage nach Rechnungsdatum
- offener Restbetrag und Kundenzuordnung direkt im Erinnerungsdialog
- vollständigen offenen Betrag direkt als Zahlung verbuchen
- Erinnerung wahlweise auf morgen, in eine Woche oder in einen Monat verschieben
- mehrere fällige Erinnerungen werden chronologisch nacheinander angezeigt
- Zahlungs- und Verlängerungsaktionen werden im Auditprotokoll dokumentiert

## 0.1.0 - 2026-07-10

- Local-first PWA mit React, TypeScript, Vite und IndexedDB/Dexie
- kontrollpflichtiges Unternehmensprofil mit aus Excel übernommenen Stammdaten
- idempotenter historischer Erstimport für sechs Rechnungen aus 2016
- Kundenverwaltung mit Archivierung statt Löschung
- mobiler Rechnungseditor, Pflichtfeldprüfung und transaktionssichere Nummernvergabe
- unveränderliche Snapshots finalisierter Rechnungen sowie Auditprotokoll
- textbasierte DIN-A4-PDFs, Druckansicht, Web Share API und E-Mail-Fallback
- Teilzahlungen, offene Forderungen und automatische Überfällig-Markierung
- Ausgaben mit Beleganhängen, betrieblichem Anteil und CSV-Export
- zahlungsbasierte jährliche Gewinn-/Verlustübersicht mit PDF und Druck
- vollständige JSON-Backups mit SHA-256-Prüfung und optional AES-GCM/PBKDF2-Verschlüsselung
- wiederholbarer Excel-Import mit Vorschau, Dateihash und Konfliktprüfung
- PWA-Manifest, Offline-App-Shell und bewusst ausgelöste Service-Worker-Updates
- Hell-/Dunkelmodus und responsive Navigation für iPhone, Tablet und Desktop
