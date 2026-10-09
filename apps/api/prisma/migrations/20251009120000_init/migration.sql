-- Empty-safe baseline. Application models (LevelCache, SessionResult)
-- are added in B-06. `CREATE SCHEMA` is a no-op on a fresh public schema.
CREATE SCHEMA IF NOT EXISTS public;
