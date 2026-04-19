-- Promote the seeded auth user to CME Admin.
-- Prerequisite: sign in once at /login with ccole@cole-mgtandeng.com so
-- handle_new_auth_user trigger creates the public.users row.

UPDATE public.users
SET role = 'cme_admin',
    full_name = COALESCE(full_name, 'Chris Cole'),
    firm = COALESCE(firm, 'Cole Management & Engineering')
WHERE lower(email) = lower('ccole@cole-mgtandeng.com');
