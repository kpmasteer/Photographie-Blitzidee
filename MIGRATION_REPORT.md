# Migrationsanalyse

Stand: 10.07.2026

## Schutz der Originalquellen

Alle sechs gefundenen Excel-Dateien wurden vor Konvertierungs- oder Importversuchen unverändert nach `../backups/excel/2026-07-10_20-20-09/` kopiert. Dateigrößen und SHA-256-Hashes von Original und Backup stimmen überein. Alle tieferen Analysen erfolgten lesend beziehungsweise an `../working/excel/Rechnung Makro - Arbeitskopie.xlsm`.

| Datei | Größe | SHA-256 | Einordnung |
|---|---:|---|---|
| Rechnung Makro Probe1.xlsm | 19.205.011 B | `ddaba4a89c6f7c8016b358c4307de6e1a48d715753e257d0f3cb1cce71a8ad2f` | Hauptquelle: zuletzt geändert, vollständigste sechs Rechnungen |
| Rechnung Makro.xlsm | 26.762.757 B | `4d1a868d358c656b26d133f26b9b19a6bb42bf2989bb7f664c7a092458ec3c10` | drei Rechnungen, sehr viele leere Vorlagenformeln |
| Rechnung Makrobackup.xlsm | 26.762.757 B | `4d1a868d358c656b26d133f26b9b19a6bb42bf2989bb7f664c7a092458ec3c10` | bytegleich mit Rechnung Makro.xlsm |
| Rechnung Makro (Automatisch gespeichert).xlsm | 18.706.081 B | `7a59f0f6a6bda13dad3fa2e5677dcb1b2713b47253ef466eafcf327e94fa2524` | zwei frühere Rechnungen |
| Rechnung2016.xlsm | 71.241 B | `bbc75beaa5643b062f196084d4075430161b8408056bdb6a76263eeabd8d84c7` | ältere Vorlage; überwiegend leere vorberechnete Zeilen |
| Rechnung2016.xlsx | 57.755 B | `eda2bb502acb30dc9eaf214d5cb79c8af0c56e3b396949f87ce100da80c6871c` | makrofreie ältere Vorlage |

## Erkannte Struktur

Die Hauptquelle enthält die Blätter `Rechnung`, `Kunden`, `Umsatz`, `Ausgaben`, `Listen` und `Shootingliste`. Die Datenzeilen im Blatt `Kunden` bilden Rechnung, Kundenadresse, Leistungsbausteine, Zahlungsart, Gesamtbetrag und Zahlungsstatus gemeinsam ab. `Umsatz` fasst diese Werte monatsweise zusammen. `Ausgaben` ist leer. `Shootingliste` bestätigt Nummer, Name, Datum, Bildanzahl und Rechnungsbetrag.

In den großen Arbeitsmappen sind bis zu 3.145.727 Zellen als Formeln gespeichert; nur wenige Zeilen besitzen sichtbare Werte. Diese leeren Formelvorlagen wurden nicht als Kunden oder Rechnungen importiert.

## Übernommene Historie

- Jahr: 2016
- Rechnungen: 6
- Kundensätze: 6
- Nummern: `00001` bis `00006`, unverändert
- Schema: fünfstellig fortlaufend ohne Jahrespräfix (`NNNNN`)
- Gesamtvolumen: 805,80 EUR
- Zahlungsstatus: in der Hauptquelle alle sechs `Ja`, Zahlungsart `Bar`
- Ausgaben: keine echten Datensätze
- Leistungspositionen: Fotoshooting, zusätzliche Bilder, Versand und Rabatt wurden aus den Spalten rekonstruiert

Die App übernimmt die Daten idempotent über Fingerprints. Historische Rechnungen sind als importiert/finalisiert markiert und besitzen Kunden- und Unternehmenssnapshots. Das Leistungsdatum wurde mangels separater Angabe dem historischen Rechnungsdatum gleichgesetzt und im Importprotokoll als Annahme dokumentiert.

## Unternehmensdaten aus der Rechnung

- Photographie Blitzidee, Lidia Lang
- Hauptstr. 441, 26683 Saterland
- Steuernummer 56/126/09694
- Landessparkasse zu Oldenburg
- IBAN DE92 2805 0100 0084 1695 64
- BIC SLZODE22XXX
- Kleinunternehmerhinweis nach § 19 UStG

Telefonnummer, Kunden-E-Mail-Adressen, separate Leistungsdaten und Zahlungsdaten waren nicht vorhanden und wurden nicht erfunden. Diese Angaben müssen im Einrichtungsbildschirm kontrolliert beziehungsweise ergänzt werden.

## Logos und Altunterlagen

`Logo Photographie Blitzidee Neu.png` (1500 × 1134) wird proportional im PDF/Rechnungskopf verwendet. `Logo Schrift.png` und `Logo Silhouette.png` dienen der App-Oberfläche und als Basis neuer PWA-Icondateien. Originalbilder blieben unverändert. Die beiden Shootinglisten-DOCX und die VBA/FRM-Dateien wurden nur inventarisiert; sie enthalten keine zusätzliche belastbare Rechnungshistorie.
