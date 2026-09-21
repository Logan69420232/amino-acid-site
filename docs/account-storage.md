# Account storage

Meals and settings are cached in localStorage under `aa_scoped:user:<user ID>:<key>`. Signed-out use has a separate `aa_scoped:guest:<key>` namespace. Supabase's own session storage is unchanged.

On an identity change, the app changes namespaces before rendering, clears account-specific UI, cancels pending uploads and invalidates in-flight reads. Reads explicitly filter `logs.user_id`; uploads capture the owner and verify the current identity before sending. Cloud sync must first read that account successfully. The existing Supabase row-level policies in `supabase/schema.sql` remain required.

Only a given account's local cache is merged with that account's remote log. Guest data is not automatically imported. Existing unscoped keys are retained untouched, but are not imported because their owner cannot be established. Previously synced data still loads from the account's remote log. Entries already copied into the wrong remote log by the old behavior cannot be safely identified or deleted automatically.

Run `npm test` for account separation and delayed-sync regression checks. Browser verification should also exercise signed-in A → signed-out → signed-in B, direct identity changes, account settings, refresh, and delayed responses, using mock accounts rather than customer records.
