# HR NEXT 技能广场

服务于 HR NEXT 跨公司 HR 社群的技能共享与需求共创平台。成员来自不同公司、不同飞书租户，没有共同雇主。

线上地址：**https://viy1204.me**

站点做两件事：把群友已经做出来的**技能包**摆出来供人**取得**，把还没人做的痛点收成**许愿**等人**认领**。

## 三份说明

| 你是谁 | 看哪份 |
|---|---|
| 社群成员（来找技能、提许愿） | [使用说明](docs/使用说明-社群成员.md) |
| 运营（上架技能、审内容、调配置） | [运营手册](docs/操作手册-运营.md) |
| 开发 | 本文件往下 |

## 先读这些再动代码

- [CONTEXT.md](CONTEXT.md) —— 领域术语表。界面文案和代码标识**必须**用它的词。「下载量 / 使用量 / 点赞 / 开放认领 / 适用人群」是明令禁用的
- [docs/adr/](docs/adr/) —— 九条已定架构决策。提架构建议前先读，不重复讨论已定的事；要推翻某条就写新 ADR，别改旧的

最容易踩的四条：不做飞书登录（[0001](docs/adr/0001-no-feishu-login-cross-tenant.md)，跨租户不成立）、认领是软意向不加锁（[0003](docs/adr/0003-claim-is-soft-intent-not-a-lock.md)）、技能包/技能条目两级且取得数只挂包上（[0006](docs/adr/0006-two-level-package-and-entry.md)）、群通道只出站不监听（[0007](docs/adr/0007-webhook-only-no-group-message-listening.md)）。

## 架构

```
浏览器 ──> Next.js (App Router, SSR)
              │
              ├── BitablePort ──> 飞书多维表格   ← 唯一数据存储
              ├── StoragePort ──> 飞书云空间     ← 自助上传的 zip，不公开
              └── NotifierPort ─> 飞书群机器人   ← 只出站
```

数据存在多维表格而不是数据库，是为了把运营权交回社群：运营能直接在表里改数据、加字段、建视图，不必每次找开发（[ADR-0002](docs/adr/0002-bitable-as-datastore-vercel-as-frontend.md)）。

飞书那几个出站边界是系统**唯一的测试 seam**：

- `src/ports/index.ts` —— 三个端口的接口
- `src/adapters/feishu-bitable.ts` / `feishu-drive.ts` —— 真实适配器，所有飞书形状（token、线上字段名、单元格结构）只出现在这里
- `src/adapters/in-memory.ts` —— 内存实现，测试和本地演示用
- `src/app/use-cases.ts` —— 全部业务规则，不认识飞书
- `app/` —— 页面与路由，三行包装，把真实端口传进去

**没配 `FEISHU_APP_ID` 时自动降级为内存模式**：站点照常能跑，带 12 条演示数据，许愿→附议→认领全程可试，重启即清空。第一次上手不需要任何飞书凭证。

## 本地跑

```bash
npm ci
npm run dev
```

打开 http://localhost:3000 。内存模式，不碰任何线上数据。

要连真实多维表格，把 `.env.example` 抄成 `.env.local` 填上值（见下表），再 `npm run dev`。

## 测试

```bash
npx vitest run
```

测试只验证对外行为，不碰存储结构与调用次数；环境统一走 `tests/support/harness.ts` 那个工厂，**不要另起第二种搭法**。提交前必须跑，失败先修再提交。

## 环境变量

| 变量 | 说明 |
|---|---|
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` | 自建应用凭证。**不设 APP_ID 就是内存模式** |
| `BITABLE_BASE_TOKEN` | 多维表格 Base token |
| `BITABLE_TABLE_*` | 六张表的 table id：`PACKAGES` `ENTRIES` `WISHES` `ENDORSEMENTS` `CLAIMS` `CONFIG` |
| `FEISHU_DRIVE_FOLDER_TOKEN` | 自助上传的 zip 存哪个文件夹，留空即应用自己的根目录 |
| `FEISHU_REVIEWER_OPEN_ID` | 运营的 open_id，上传后把文件共享给他审核，不配他就打不开要审的 zip |
| `FEISHU_GROUP_WEBHOOK_URL` | 群自定义机器人 webhook。**不配只打日志，不阻塞许愿** |
| `DELIVERY_SYNC_SECRET` | 交付同步接口的共享密钥 |
| `PUBLIC_BASE_URL` | 群推送文案里的链接前缀，线上是 `https://viy1204.me` |

## 从零建一套飞书侧

```bash
LARK_PROFILE=<profile> bash scripts/setup-bitable.sh          # 建 Base 与六张表，输出环境变量
BASE=<token> LARK_PROFILE=<profile> bash scripts/seed-catalogue.sh   # 录 6 技能包 / 12 技能条目
```

`LARK_PROFILE` 必须显式指定。lark-cli 的默认 profile 是这台机器上最后登录的那个身份，通常是某人的公司账号 —— [ADR-0005](docs/adr/0005-community-owns-the-tenant-and-deployment.md) 明令禁止把 Base 建在任何人的雇主租户里，这个坑已经踩过一次。

## 部署

```bash
HOST=viy bash scripts/deploy.sh
```

本地构建 → 打包 standalone 产物 → scp → 旁边解包再原子替换 → 重启 → 自检。旧版本留在 `/opt/hr-plaza/previous`，回滚就是换回来重启。

**绝不在服务器上构建**：那台只有 1.9G 内存且跑着别的服务，`next build` 峰值超过 1G，必 OOM。详见 [ADR-0008](docs/adr/0008-deploy-on-the-community-server-not-vercel.md)。

线上形态：Caddy 占 80/443 自动签发续期证书 → 反代 → 应用只听 `127.0.0.1:3000`。配置文件都在 [deploy/](deploy/)，和服务器上的保持一致。

| 文件 | 装到哪 |
|---|---|
| `deploy/hr-plaza.service` | `/etc/systemd/system/` |
| `deploy/Caddyfile` | `/etc/caddy/` |
| `deploy/hr-plaza-sync.{service,timer}` | `/etc/systemd/system/`，每 10 分钟同步一次交付关联 |

## 服务器备忘

- 应用日志：`journalctl -u hr-plaza -f`
- 重启：`systemctl restart hr-plaza`
- 证书由 Caddy 自动续期，**80 端口必须保持放行**，ACME 校验走它，关掉当时无感、60 天后炸
- journald 已限容 200M；openclaw 有内存上限和每周重启定时器（它会慢慢涨到 800M）
