# Supabase RLS for public.reports

Run this SQL in your Supabase project (SQL Editor or migration):

```sql
-- Enable RLS
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Read own reports
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reports'
      AND policyname = 'Users can view their own reports'
  ) THEN
    CREATE POLICY "Users can view their own reports"
    ON public.reports FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Insert own reports
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reports'
      AND policyname = 'Users can create their own reports'
  ) THEN
    CREATE POLICY "Users can create their own reports"
    ON public.reports FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
```

Notes:
- Ensure `public.reports.user_id` is a UUID referencing `auth.users.id` or compatible type.
- If RLS was already enabled or policies exist, the DO blocks prevent errors by checking first.
- Add UPDATE/DELETE policies as needed (e.g., restrict updates/deletes to own rows).
