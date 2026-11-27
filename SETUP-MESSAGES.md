# 老板留言功能 · Supabase 配置步骤

> 目标：老板用邮箱+密码注册/登录，提交「游戏名 / 游戏账号 / 游戏昵称 / 代肝需求 / 联系方式 / 截止时间 / 备注」；你在店主后台看到所有老板的需求，可以**接受**或**驳回**，接受后可以标记**已完成**，老板在自己的页面能看到状态和你的回复。
>
> 当前网站是 GitHub Pages 纯静态，所以账号和留言存在 Supabase（免费）。老板的账号密码由 Supabase Auth 托管，数据库有行级权限：**老板只能看到自己的留言，只有店主能看全部。**

## 状态流程

```
老板提交
   └─ 待审核 pending
        ├─ 店主「接受」 → 已接受 accepted
        │        └─ 店主「标记完成」 → 已完成 completed
        └─ 店主「驳回」 → 已驳回 rejected（附原因）
```

店主每次操作都可以写一段回复，老板在「我的需求」里能看到状态和这段回复。

## 你要做的（约 5 分钟）

### 1. 创建 Supabase 项目

1. 打开 <https://supabase.com>，点 **Start your project** / **Sign in**。
2. 选 **Continue with GitHub**，用你的 `kuaile-haizi` 账号登录。
3. 新建项目：
   - Organization：默认即可
   - Project name：`heimaojingzhang`（随意）
   - Database Password：设一个强密码并记下来（以后恢复数据库用）
   - Region：选 **Southeast Asia (Singapore)** 或 **Northeast Asia (Tokyo)**，国内访问相对近
4. 点 Create，等 1~2 分钟初始化完成。

### 2. 建表（跑一次 SQL）

1. 左侧菜单打开 **SQL Editor**。
2. 新建 Query，把 [supabase/schema.sql](supabase/schema.sql) 的全部内容粘贴进去。
3. 点 **Run**。
4. 没报错的话，左侧 **Table Editor** 里会出现 `profiles` 和 `requests` 两张表。

> 如果你之前已经运行过旧版 `schema.sql`（状态只有 pending / processing / done），这次请改跑 [supabase/migration-002-review-status.sql](supabase/migration-002-review-status.sql)，它会把表升级成「接受 / 驳回 / 完成」流程。全新项目直接跑最新 `schema.sql` 即可。

### 3. 关闭邮箱确认（重要）

Supabase 默认注册后要收邮件点确认，国内邮箱可能延迟。

左侧 **Authentication** → **Providers** → **Email**，把 **Confirm email** 关掉（关闭后注册即可登录）。

> 以后想更严格可以再打开，并配置自己的 SMTP。

### 4. 创建店主账号

左侧 **Authentication** → **Users** → **Add user** → **Create new user**：

- Email：你的店主登录邮箱（例如你的 QQ 邮箱）
- Password：设一个密码
- 勾选 **Auto Confirm User**（如果界面有）

创建后，回 **SQL Editor** 运行（把邮箱换成你刚才填的）：

```sql
update public.profiles
set role = 'owner'
where lower(email) = lower('你的店主邮箱');
```

再运行检查：

```sql
select id, display_name, email, role from public.profiles;
```

看到你的账号 `role = owner` 就成功了。

### 5. 把两个值发给我

左侧 **Project Settings**（齿轮）→ **API**：

- **Project URL**，例如 `https://abcdefgh.supabase.co`
- **anon public** key，一长串 `eyJ...`

把这两个值发我即可。**anon key 是设计为公开的**，配合上面的 RLS 权限使用是安全的；**不要发 service_role / secret key**（那个权限太大）。

---

## 之后我会做什么

收到 URL 和 anon key 后，我会：

1. 写 `messages.html` 留言页：
   - 老板注册 / 登录
   - 提交需求表单
   - 「我的需求」列表和状态
2. 写店主后台：
   - 查看所有老板的留言（显示老板昵称 + 邮箱）
   - 按「待审核 / 已接受 / 已驳回 / 已完成」筛选
   - 接受、驳回（可填理由）、标记完成（可填完成说明）
   - 老板页面同步显示状态和你的回复
3. 在首页加「老板留言」入口。
4. 用真实 Supabase 项目做端到端测试：注册、登录、提交、接受/驳回/完成、权限隔离、店主看全部。
5. 给你更新后的网站文件，按之前 GitHub Pages 的方式上传覆盖即可。

## 安全说明

- 数据库启用了 RLS：老板只能读写自己的数据；店主通过 `profiles.role = 'owner'` 识别。
- 游戏账号、联系方式属于敏感信息，建议只在店主后台展示，不公开。
- 不要在前端代码里放 `service_role` key；只使用 `anon public`。
- 如果以后要做截图上传，可以再开 Supabase Storage 私有桶，需要额外配置，届时再说。
