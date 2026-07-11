# Changelog

## 0.4.10 - 2026-07-11

- Zahlungsstand bei neuen Rechnungen und Entwürfen ausgeblendet
- Rechnungseditor nutzt im Entwurfsstatus die gesamte verfügbare Breite
- Zahlungsstand bei finalisierten Rechnungen unter die Rechnungsdaten verschoben
- Zahlungsschaltfläche eindeutig als `Teilzahlung / Zahlung erfassen` bezeichnet
- beliebige positive Teilbeträge bis zum offenen Rechnungsbetrag können direkt verbucht werden
- Zahlungsdatum und Zahlungsart werden bei jeder Zahlung erfasst
- Status wechselt bei Teilbeträgen auf `Teilbezahlt` und bei vollständigem Ausgleich auf `Bezahlt`
- vorhandene Zahlungen bleiben mit Datum, Betrag und Zahlungsart sichtbar

## 0.4.9 - 2026-07-11

- separates Feld für Beschreibungsvorlagen und Beschreibung zu einem editierbaren Kombinationsfeld zusammengeführt
- Beschreibungsvorlagen sind über einen klaren Pfeil auswählbar; Freitext bleibt direkt im selben Feld möglich
- neue Beschreibungstexte können beim Verlassen des Feldes auf Nachfrage als Vorlage gespeichert werden
- Einheitenfeld als zuverlässiges Kombinationsfeld mit `Keine Einheit`, `Pauschale`, `Bilder` und Freitext umgesetzt
- bestehende Einheit kann vollständig geleert werden
- Einzelpreis sowie prozentuale und feste Rabattbeträge markieren den vorhandenen Wert beim Fokus auf allen Geräten
- Positionsrabatt und Gesamtrabatt verwenden dieselbe Hintergrundfarbe und Rahmenbehandlung

## 0.4.8 - 2026-07-11

- Einheitenfeld um schnelle Vorschläge für `Pauschale` und `Bilder` erweitert
- Vorschlagsliste ist direkt über den Pfeil beziehungsweise die native Auswahlanzeige des Textfelds erreichbar
- freie Eingabe eigener Einheiten bleibt uneingeschränkt möglich
- bestehende und importierte individuelle Einheitentexte bleiben unverändert

## 0.4.7 - 2026-07-11

- Desktop-Grid des Positionseditors an die tatsächliche Anzahl von Feldern einschließlich Beschreibungsvorlage angepasst
- Einzelpreisfeld liegt nicht mehr außerhalb der Positionskarte oder unter dem benachbarten Seitenbereich
- alle Eingaben werden auf die Breite ihrer Grid-Zelle begrenzt und bleiben anklickbar
- separate robuste Anordnung für breite Desktopfenster und mittlere Desktop-/Tabletbreiten ergänzt
- Summe sowie Duplizieren- und Löschen-Aktionen bleiben innerhalb der jeweiligen Position

## 0.4.6 - 2026-07-11

- Einzelpreiseingabe auf Desktop repariert: keine automatische Centumrechnung und keine verzögerte Textauswahl mehr während des Tippens
- Preisnormalisierung erfolgt wieder beim Verlassen des Feldes, Speichern oder Finalisieren
- Positions- und Gesamtrabatte als klar abgegrenzte, responsive Bereiche neu angeordnet
- fehlerbehaftete transparente Logo-Datei mit horizontalen Pixelartefakten im PDF-Pfad ersetzt
- Rechnungs- und Gewinn-/Verlust-PDF verwenden das saubere JPEG-Logo mit proportionaler Skalierung

## 0.4.5 - 2026-07-11

- Desktopdruck von Rechnungen und Gewinn-/Verlustermittlung ebenfalls auf die textbasierte A4-PDF umgestellt
- browserabhängige Drucklinien und HTML-Kopf-/Fußartefakte aus dem Rechnungsdruck entfernt
- Gewinn-/Verlust-PDF um proportionales Logo, Unternehmenskopf, Ergebnisblöcke und Ausgabenkategorien erweitert
- lange Kategorien werden bei Bedarf sauber auf echte PDF-Folgeseiten verteilt statt abgeschnitten
- PDF-Druckdateien enthalten eine Druckanweisung und öffnen sich auf Desktop im PDF-Viewer
- Mengen-, Einheiten- und Preisfelder verwenden auf Smartphones jeweils die volle verfügbare Breite
- mobile Zahlenfelder verwenden 16-Pixel-Schrift und bleiben auch bei kleinen Displays lesbar

## 0.4.4 - 2026-07-11

- Druckbutton innerhalb der Rechnungsvorschau auf denselben mobilen PDF-Systemdruck wie der direkte Druckbutton umgestellt
- einheitliches Verhalten für direkten Druck und Vorschau-Druck auf Android, iPhone und iPad
- Logoabmessungen werden aus dem Originalseitenverhältnis berechnet und proportional in den vorgesehenen PDF-Rahmen eingepasst
- automatisierter Test gegen horizontale und vertikale Logo-Verzerrung ergänzt

## 0.4.3 - 2026-07-11

- mobiler Rechnungsdruck auf textbasierte A4-PDF und natives Teilen-/Druckmenü von iOS, iPadOS und Android umgestellt
- mobiler Druck der Gewinn-/Verlustermittlung nutzt denselben zuverlässigen PDF-Systemweg
- Safari-anfällige PDF-Erzeugung über `jsPDF.html()`/`html2canvas` nach der Finalisierung durch direkte, textbasierte PDF-Erzeugung ersetzt
- PDF-Schaltfläche nach Finalisierung repariert und sichtbare Fehlerbehandlung ergänzt
- PDF-Download-Link wird browserkompatibel in den DOM eingefügt und erst nach längerer Frist freigegeben
- bereits gespeicherte PDFs aus dem alten HTML-Rasterpfad werden beim Öffnen neu aus den unveränderlichen Rechnungsdaten erzeugt
- Entwurfs-PDFs sind ausdrücklich als `RECHNUNGSENTWURF` gekennzeichnet

## 0.4.2 - 2026-07-11

- mobilen Druckpfad für iPhone, iPad und Android von verstecktem 1-Pixel-`iframe` auf ein eigenständiges Druckfenster umgestellt
- Druckfenster wird unmittelbar durch die Nutzeraktion geöffnet und erst nach vollständig geladenem A4-Dokument gedruckt
- Druckdaten werden in isolierten PWA-/WebView-Kontexten direkt vom öffnenden App-Fenster übernommen; lokaler Speicher dient als Browser-Fallback
- Rechnung und Gewinn-/Verlustermittlung bleiben vollständig vom responsiven App-DOM getrennt
- Rechnungs- und Entwurfsnummern brechen innerhalb ihres Metadatenfelds um und laufen nicht mehr über den linken Seitenrand
- bestehende Druckfenster werden vor erneutem Drucken geschlossen und nach dem Druck automatisch aufgeräumt

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
