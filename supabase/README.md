# Supabase-Einrichtung

1. Supabase-Projekt in einer passenden EU-Region anlegen.
2. `VITE_SUPABASE_URL` und öffentlichen Publishable-/Anon-Key in `.env.local` setzen. Niemals einen Secret- oder `service_role`-Key im Frontend verwenden.
3. Die Migrationen aus `supabase/migrations` in Zeitstempelreihenfolge anwenden.
4. Unter `Authentication → URL Configuration` die Render-Adresse als Site URL und die lokalen Entwicklungsadressen als Redirect-URLs eintragen; Anmeldung erfolgt per E-Mail und Passwort.
5. Mit einem berechtigten Konto, einem Konto ohne Mitgliedschaft und einem anonymen Client RLS, Kontowechsel, Realtime und konkurrierende Nummernvergabe prüfen.

Die Migration erstellt Tabellen, Indizes, Rollen, RLS-Policies, private Storage-Buckets, Realtime-Publikationen sowie die atomaren RPCs `create_organization`, `allocate_customer_number`, `finalize_invoice`, `import_historical_invoice` und `cancel_invoice`.

## Erster Auth-Benutzer

Die öffentliche Selbstregistrierung und die Selbstzuordnung als Owner sind deaktiviert. Den ersten Benutzer im Supabase-Dashboard anlegen, E-Mail bestätigen und die angezeigte Auth-UUID im SQL Editor verwenden:

```sql
select private.provision_first_owner(
  '<AUTH-USER-UUID>'::uuid,
  'Lidia Lang'
);
```

`private.provision_first_owner` ist ausschließlich für den Datenbankbetrieb beziehungsweise `service_role` freigegeben und verweigert eine zweite aktive Owner-Erstzuordnung. Ein Service-Role-Schlüssel darf niemals im Frontend oder in Render-Variablen liegen.

Die v0.5.1-Migrationen erhalten Audit- und Geschäftsdaten bei einer beabsichtigten Kontolöschung; nur optionale Benutzerverweise werden dabei auf `NULL` gesetzt. Direkte Löschungen des letzten aktiven Owners bleiben geschützt.

Seit April 2026 legt Supabase neue Tabellen nicht zwingend automatisch für die Data API frei. Deshalb enthält die Migration explizite Grants für `authenticated`; RLS bleibt aktiv.

## Render

- Build: `npm ci && npm run build`
- Publish: `dist`
- Variablen: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Keine Secret-/Service-Role-Schlüssel hinterlegen.

Vor Produktion beziehungsweise nach Schemaänderungen: Migration anwenden, Security Advisor prüfen, RLS mit zwei Organisationen testen und Realtime/Offline-Queue mit zwei Browserprofilen prüfen. Der öffentliche Render-Origin muss zusätzlich in Supabase Auth als Site URL beziehungsweise erlaubte Redirect-URL eingetragen sein.
