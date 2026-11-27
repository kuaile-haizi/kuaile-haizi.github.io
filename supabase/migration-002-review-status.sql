-- ============================================================
--  老板留言功能 · 增量迁移 002
--  给需求表增加「接受 / 驳回 / 完成」流程字段
--
--  只有在你已经运行过旧版 schema.sql（status 只有
--  pending / processing / done）时才需要运行本文件。
--  全新项目直接运行最新 schema.sql 即可，不用跑这个。
-- ============================================================

-- 1) 新增字段
alter table public.requests
  add column if not exists owner_note text not null default '',
  add column if not exists decided_at timestamptz,
  add column if not exists completed_at timestamptz;

-- 2) 旧状态映射到新状态
update public.requests set status = 'accepted' where status = 'processing';
update public.requests set status = 'completed' where status = 'done';

-- 3) 更新状态约束
alter table public.requests drop constraint if exists requests_status_check;
alter table public.requests
  add constraint requests_status_check
  check (status in ('pending', 'accepted', 'rejected', 'completed'));

-- 4) 检查
select id, status, owner_note, created_at, updated_at
from public.requests
order by created_at desc
limit 20;
