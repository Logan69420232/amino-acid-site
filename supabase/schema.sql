-- Amino Atlas: one synced log per user. Run once in the Supabase SQL editor.
create table if not exists public.logs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.logs enable row level security;
create policy "own log select" on public.logs for select using (auth.uid() = user_id);
create policy "own log insert" on public.logs for insert with check (auth.uid() = user_id);
create policy "own log update" on public.logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own log delete" on public.logs for delete using (auth.uid() = user_id);
