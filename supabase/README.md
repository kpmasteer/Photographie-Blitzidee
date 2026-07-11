# Supabase-Einrichtung

1. Supabase-Projekt in einer passenden EU-Region anlegen.
2. `VITE_SUPABASE_URL` und öffentlichen Publishable-/Anon-Key in `.env.local` setzen. Niemals einen Secret- oder `service_role`-Key im Frontend verwenden.
3. Die Migrationen aus `supabase/migrations` in Zeitstempelreihenfolge anwenden.
4. Erlaubte Auth-Redirect-URLs für lokale Entwicklung und Render eintragen und Magic Link aktivieren.
5. Mit zwei Testkonten und zwei Organisationen die RLS- und Nummernvergabe-Tests ausführen.

Die Migration erstellt Tabellen, Indizes, Rollen, RLS-Policies, private Storage-Buckets, Realtime-Publikationen sowie die atomaren RPCs `create_organization`, `allocate_customer_number`, `finalize_invoice`, `import_historical_invoice` und `cancel_invoice`.

Seit April 2026 legt Supabase neue Tabellen nicht zwingend automatisch für die Data API frei. Deshalb enthält die Migration explizite Grants für `authenticated`; RLS bleibt aktiv.

## Render

- Build: `npm ci && npm run build`
- Publish: `dist`
- Variablen: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Keine Secret-/Service-Role-Schlüssel hinterlegen.

Vor Produktion beziehungsweise nach Schemaänderungen: Migration anwenden, Security Advisor prüfen, RLS mit zwei Organisationen testen und Realtime/Offline-Queue mit zwei Browserprofilen prüfen. Der öffentliche Render-Origin muss zusätzlich in Supabase Auth als Site URL beziehungsweise erlaubte Redirect-URL eingetragen sein.
