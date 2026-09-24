# DSH 企业认证插件安装使用说明

## 使用条件

- 已安装 DSH Desktop。
- 电脑能够访问公司内网。
- 能够访问登录服务 `http://10.56.0.190:7263`。
- 能够访问 DSH 管理服务 `http://10.56.0.242:8080`。
- 管理员已为当前域账号分配可用模型。

## 安装

1. 完全退出 DSH Desktop，包括 Windows 托盘中的 DSH Desktop。
2. 将 `dsh-enterprise-auth-0.0.2.tgz` 保存到本机，例如 `C:\Temp`。
3. 打开 PowerShell，执行：

```powershell
$env:DSH_HOME = "$env:APPDATA\dsh-desktop\harness"
dsh plugin --profile web add "C:\Temp\dsh-enterprise-auth-0.0.2.tgz"
```

4. 命令执行成功后重新启动 DSH Desktop。

如果 PowerShell 提示找不到 `dsh` 命令，请联系 DSH Desktop 管理员协助安装，不要手动修改 Profile 的 `package.json`。

## 登录和使用模型

1. 在 DSH Desktop 左下角点击“登录”。
2. 输入公司账号和密码，例如账号格式 `Xiang.Xu`，不需要添加域名前缀或邮箱后缀。
3. 登录成功后，左下角显示当前用户姓名。
4. 新建会话，在模型选择器中选择管理员分配的企业模型。

插件不会向用户展示模型 API Key 或模型服务地址。模型调用由 DSH 管理服务代理完成。

## 其他插件读取登录身份

同一个 DSH Desktop 中的受信任插件可以调用：

```http
GET /dsh-enterprise-auth/token
```

未登录或 token 已失效时返回 HTTP 401。插件开发者不需要、也不应获得 JWT 签名密钥。

## 当前限制

- 登录 token 有效期为 8 小时。
- token 当前只保存在 DSH 插件进程内存中。
- 完全退出或重启 DSH Desktop 后需要重新登录。
- 当前服务使用公司内网 HTTP 地址，不应暴露到公网。

## 常见问题

- 登录失败：确认公司账号密码正确，并检查是否能访问 `10.56.0.190:7263`。
- 登录成功但没有企业模型：联系管理员检查该账号的模型授权。
- 模型请求失败：检查 `10.56.0.242:8080/api/health` 是否可访问，并将报错信息提供给管理员。

## 卸载

完全退出 DSH Desktop 后，在 PowerShell 执行：

```powershell
$env:DSH_HOME = "$env:APPDATA\dsh-desktop\harness"
dsh plugin --profile web remove dsh-enterprise-auth
```

然后重新启动 DSH Desktop。
