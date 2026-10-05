# ResponSys

ResponSys coordinates civilian reports, volunteers, and dispatchers through Supabase and Next.js.

## Setup

1. Copy `.env.example` to `.env.local` and fill in the values from the Supabase project.
2. Apply `0001_roles_and_core.sql` in the Supabase SQL editor. The migration creates `public.profiles`, the signup trigger, roles, RLS policies, and RPCs.
3. Confirm the migration succeeded with:

	```sql
	select to_regclass('public.profiles');
	```

	The result must be `public.profiles` before sign-in can complete.
4. Create the first admin manually after signing up:

	```sql
	update public.profiles
	set role = 'admin'
	where id = (select id from auth.users where email = 'you@example.com');
	```

5. Start the app:

	```bash
	npm install
	npm run dev
	```

`db-setup.mjs` belongs to the old schema and should not be used against a shared or production Supabase project. Use versioned migrations instead.

## Roles

- Every signup creates a `civilian` profile through the database trigger.
- A civilian opts into volunteering through `volunteer_profiles`; volunteer is not an account role.
- An `admin` creates and disables `dispatcher` accounts.
- Database RLS and RPCs enforce permissions; the browser role checks are only for navigation.

## Checks

```bash
npx tsc --noEmit
npm run build
```

## Getting Started
