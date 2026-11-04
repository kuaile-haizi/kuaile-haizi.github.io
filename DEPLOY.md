# heimaojingzhang.xin 上线指南（GitHub Pages + 阿里云解析）

> 已确认信息：
> - 域名：`heimaojingzhang.xin`，DNS 在**阿里云**（`dns27/dns28.hichina.com`），目前**没有 A 记录**。
> - GitHub 用户名：`kuaile-haizi`，名下目前 **0 个公开仓库**，没有现成 Pages 站点，不会冲突。
> - 网站文件已经按 GitHub Pages 要求准备好（根目录含 `index.html`、`CNAME`、`robots.txt`、`sitemap.xml`）。

推荐做法：**建一个名为 `kuaile-haizi.github.io` 的用户主页仓库**。这样默认地址就是 `https://kuaile-haizi.github.io/`，绑定自定义域名最省事。

---

## 第 1 步：建仓库并上传文件

1. 打开 [github.com/new](https://github.com/new)。
2. Repository name 填：

   ```
   kuaile-haizi.github.io
   ```

   - 可见性选 **Public**
   - **不要**勾选 “Add a README file”
   - 点 **Create repository**

3. 进入新仓库，打开 [github.com/kuaile-haizi/kuaile-haizi.github.io/upload/main](https://github.com/kuaile-haizi/kuaile-haizi.github.io/upload/main)。
4. 把 `whip-site` 文件夹里的**内容**拖进去（不是拖外层文件夹）：

   - `index.html`
   - `styles.css`
   - `app.js`
   - `assets/` 文件夹（`avatar.jpg` + `placeholder.svg`）
   - `CNAME`（内容已经是 `heimaojingzhang.xin`）
   - `robots.txt`
   - `sitemap.xml`
   - `preview.png`（可选）
   - `README.md`、`DEPLOY.md`（可选）

5. 确认仓库根目录能直接看到 `index.html`，**不能**是 `whip-site/index.html`。然后 Commit。

> 网页上传不方便拖文件夹的话，用本机 git：
>
> ```powershell
> cd "I:\deepseek harness工作区\whip-site"
> git init
> git add .
> git commit -m "deploy whip site"
> git branch -M main
> git remote add origin https://github.com/kuaile-haizi/kuaile-haizi.github.io.git
> git push -u origin main
> ```
>
> 第一次 push 会弹出 GitHub 登录/授权。

---

## 第 2 步：开启 Pages + 填自定义域名

1. 打开仓库设置：<https://github.com/kuaile-haizi/kuaile-haizi.github.io/settings/pages>。
2. **Build and deployment**：
   - Source：**Deploy from a branch**
   - Branch：**main**，目录 **/ (root)**
   - Save
3. 等 1~3 分钟。此时如果访问 `https://kuaile-haizi.github.io/` 被跳转到 `heimaojingzhang.xin` 或打不开，属于正常现象：仓库里的 `CNAME` 已经把自定义域名绑上了，只差 DNS 解析。继续下一步。
4. 回到 Pages 设置，在 **Custom domain** 确认是：

   ```
   heimaojingzhang.xin
   ```

   点 **Save**。仓库里已经有 `CNAME` 文件，GitHub 通常会自动填好；如果显示别的值，改成上面的。

此时 GitHub 会提示 DNS 检查失败，正常，继续下一步。

---

## 第 3 步：阿里云添加解析记录

打开阿里云 **云解析 DNS** → 找到 `heimaojingzhang.xin` → **解析设置** → **添加记录**。

按下面添加（主机记录不要带域名，记录值不要带 `<>`）：

| 记录类型 | 主机记录 | 解析线路 | TTL | 记录值 |
|---|---|---|---|---|
| A | `@` | 默认 | 600 | `185.199.108.153` |
| A | `@` | 默认 | 600 | `185.199.109.153` |
| A | `@` | 默认 | 600 | `185.199.110.153` |
| A | `@` | 默认 | 600 | `185.199.111.153` |
| CNAME | `www` | 默认 | 600 | `kuaile-haizi.github.io` |

说明：

- `@` 表示根域名 `heimaojingzhang.xin`。
- 4 条 A 记录必须全加，这是 GitHub Pages 官方 IP。
- `www` 的 CNAME 指向 `kuaile-haizi.github.io`，**不要**带仓库名。
- 如果阿里云提示与已有 `www` 记录冲突，先删掉旧的 `www` 记录。
- 不要加 `*` 泛解析。
- 可选 IPv6：在 `@` 再加 4 条 AAAA：`2606:50c0:8000::153`、`2606:50c0:8001::153`、`2606:50c0:8002::153`、`2606:50c0:8003::153`。不加也能用。

### 域名验证（推荐，防劫持）

1. 打开 GitHub 个人设置：<https://github.com/settings/pages>。
2. **Add a domain** → 输入 `heimaojingzhang.xin`。
3. GitHub 会给你一条 TXT 记录，在阿里云添加：
   - 主机记录：`_github-pages-challenge-kuaile-haizi`
   - 记录值：GitHub 页面上显示的那串字符
4. 回 GitHub 点 **Verify**，成功后保留这条 TXT。

---

## 第 4 步：等生效 + 开 HTTPS

解析添加后，等几分钟到 24 小时。用 PowerShell 检查：

```powershell
Resolve-DnsName heimaojingzhang.xin -Type A
Resolve-DnsName www.heimaojingzhang.xin -Type CNAME
```

- 第一条应返回 4 个 `185.199.10x.153`。
- 第二条应返回 `kuaile-haizi.github.io`。

然后回到 Pages 设置：

- 等 **DNS check successful**；
- GitHub 自动申请 HTTPS 证书（通常几十分钟内，最长 24 小时）；
- 证书就绪后勾选 **Enforce HTTPS**。

完成后访问：

- `https://heimaojingzhang.xin/`
- `https://www.heimaojingzhang.xin/`

---

## 常见问题

**打开是 404**
- 仓库根目录必须有 `index.html`（不能套一层文件夹）。
- Pages 的 Branch 要选 `main` + `/ (root)`。
- 刚开启 Pages 等 1~3 分钟。

**DNS check 失败**
- 解析没生效或 IP 填错；用 `Resolve-DnsName` 检查。
- 等 10 分钟后回 Pages 页面再点一次 Save。

**HTTPS 一直没证书**
- 确认 A/CNAME 已生效；
- 在 Pages 里移除 Custom domain 再重新填一次；
- 最长等 24 小时。

**国内访问慢**
- GitHub Pages 在部分网络下会不稳定；如果朋友主要在境内，可以换 Cloudflare Pages，或备案后用国内服务器。需要的话我再给方案。

**www 和根域名**
- 自定义域名填根域名 `heimaojingzhang.xin`；`www` 通过 CNAME 指向 GitHub Pages，GitHub 会自动跳转。
- 不要给 `www` 再单独设一个不同的 custom domain。

---

## 搜索引擎收录

上线并绑定域名后，别人输入网址就能访问；被搜索引擎搜到需要主动提交：

1. [Google Search Console](https://search.google.com/search-console/) 添加 `https://heimaojingzhang.xin/`，提交 `sitemap.xml`。
2. [Bing Webmaster Tools](https://www.bing.com/webmasters) 同样提交。
3. 需要的话再提交百度搜索资源平台。

本站已带 `robots.txt`、`sitemap.xml` 和分享卡片（OG 标签）；提交后通常几天到几周逐步收录。

---

## 需要我代做 GitHub 上传？

我这边没有你的 GitHub 登录凭据，所以不能直接操作。两个选择：

1. **你按上面步骤点一下**（大约 5 分钟），完成后把结果告诉我，我可以帮你检查 Pages 和 DNS 是否配置正确。
2. 如果你愿意授权，我可以引导你完成 GitHub 设备登录（你在浏览器输入一个一次性代码即可），然后我直接帮你建仓库、上传文件、开启 Pages；阿里云解析仍建议你自己加那 5 条记录。
