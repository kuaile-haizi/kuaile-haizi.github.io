-- ============================================================
--  代肝催工事务所 · 老板留言功能
--  Supabase 数据库初始化脚本
--
--  使用方法：
--  1. 在 https://supabase.com 创建项目
--  2. 打开左侧 SQL Editor
--  3. 把本文件全部内容粘贴进去，点 Run
--  4. 如果报错，把报错信息发给我
-- ============================================================

-- 1) 老板资料表（注册时自动创建）
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  email text not null default '',
  role text not null default 'boss' check (role in ('boss', 'owner')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2) 店主判断函数（security definer，避免 RLS 递归）
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'owner'
  );
$$;

grant execute on function public.is_owner() to authenticated;

-- 3) profiles 权限：老板只能看自己，店主能看全部
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles: owner read all" on public.profiles;
create policy "profiles: owner read all"
  on public.profiles for select
  to authenticated
  using (public.is_owner());

-- 4) 注册后自动建 profile（昵称从注册参数里取）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(coalesce(new.email, '老板'), '@', 1)
    ),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 已有的 auth 用户补一条 profile（重复运行也安全）
insert into public.profiles (id, display_name, email)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    split_part(coalesce(u.email, '老板'), '@', 1)
  ),
  coalesce(u.email, '')
from auth.users u
on conflict (id) do nothing;

-- 5) 老板需求表
create table if not exists public.requests (
  id bigint generated always as identity primary key,
  boss_id uuid not null references public.profiles (id) on delete cascade,

  game_name text not null,
  game_account text not null,
  game_nickname text not null,

  demand text not null default '',
  contact text not null default '',
  deadline date,
  note text not null default '',

  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'completed')),

  -- 店主给老板的回复：接受说明 / 驳回原因 / 完成说明
  owner_note text not null default '',

  -- 店主操作时间
  decided_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.requests enable row level security;

-- 老板只能插入自己的需求，且初始状态必须是待处理
drop policy if exists "requests: boss insert own" on public.requests;
create policy "requests: boss insert own"
  on public.requests for insert
  to authenticated
  with check (boss_id = auth.uid() and status = 'pending');

-- 老板只能看自己的需求
drop policy if exists "requests: boss read own" on public.requests;
create policy "requests: boss read own"
  on public.requests for select
  to authenticated
  using (boss_id = auth.uid());

-- 店主能看全部需求
drop policy if exists "requests: owner read all" on public.requests;
create policy "requests: owner read all"
  on public.requests for select
  to authenticated
  using (public.is_owner());

-- 店主能改状态
drop policy if exists "requests: owner update" on public.requests;
create policy "requests: owner update"
  on public.requests for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- 6) 更新时间
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists requests_touch_updated_at on public.requests;
create trigger requests_touch_updated_at
  before update on public.requests
  for each row execute function public.touch_updated_at();

-- 7) 索引
create index if not exists requests_boss_id_idx on public.requests (boss_id);
create index if not exists requests_status_idx on public.requests (status);
create index if not exists requests_created_at_idx on public.requests (created_at desc);

-- 8) 把店主账号升级为 owner
--    把 OWNER_EMAIL_HERE 换成你注册店主账号时用的邮箱，然后单独运行下面这一行：
--
--    update public.profiles set role = 'owner' where lower(email) = lower('OWNER_EMAIL_HERE');
--
--    检查结果：
--    select id, display_name, email, role from public.profiles;
