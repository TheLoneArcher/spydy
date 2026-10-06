# ResponSys

ResponSys coordinates civilian reports, volunteers, and dispatchers through Supabase and Next.js.

## Setup

1. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `DEMO_SEED_ALLOWED_PROJECT_REF`. Keep the service-role key server-side.
2. Apply migrations `0001_roles_and_core.sql` through `0005_fixes.sql` in filename order in the Supabase SQL editor. Run each file as a complete script.
3. Confirm the migration succeeded with:

	```sql
	select to_regclass('public.profiles');
	```

	The result must be `public.profiles` before sign-in can complete.
4. Start the app and create your first account:

	```bash
	npm install
	npm run dev
	```

5. Create the first admin manually after signing up:

	```sql
	update public.profiles
	set role = 'admin'
	where id = (select id from auth.users where email = 'you@example.com');
	```

6. To load the demo data, set `ALLOW_DEMO_SEED=1` and the project ref in `.env.local`, then run:

	```bash
	npm run seed:demo
	```

	The seed uses `DEMO_PASSWORD` or `ResponSys2026!` by default. It refuses unknown Supabase projects unless `DEMO_SEED_ALLOWED_PROJECT_REF` matches the project hostname.

7. Verify the database path with:

	```sql
	select to_regclass('public.profiles'), to_regclass('public.reports'), to_regclass('public.report_media');
	select * from public.public_stats();
	```

	If migrations `0001` through `0004` were already applied, run only `0005_fixes.sql`; do not re-run the earlier files.

`db-setup.mjs` belongs to the old schema and should not be used against a shared or production Supabase project. Use versioned migrations instead. With the Supabase CLI installed, the equivalent command is `supabase db push` after linking the project.

## Roles

- Every signup creates a `civilian` profile through the database trigger.
- A civilian opts into volunteering through `volunteer_profiles`; volunteer is not an account role.
- An `admin` creates and disables `dispatcher` accounts.
- Database RLS and RPCs enforce permissions; the browser role checks are only for navigation.

## Checks

```bash
npx tsc --noEmit
npm run build
npm test
```
