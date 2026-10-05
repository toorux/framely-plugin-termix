# Termix for Framely

## 构建教程

在 ARM64 Linux 上构建，需要 Node.js ≥ 22.12、npm、Python 3、make 和 C++ 编译器。

```sh
git clone git@github.com:toorux/framely-plugin-termix.git
cd framely-plugin-termix
npm ci
python3 scripts/upstream.py
npm run typecheck
npm test
npm run build
python3 scripts/pack.py
```

安装包生成在 `dist/`，包含完整离线运行环境。可用新版 Framely 校验：

```sh
framely verify dist/tooru.termix-0.1.9-preview.5.framely
```

## 上游与许可证

本插件基于 [Termix](https://github.com/Termix-SSH/Termix)，使用 Termix 2.9.0（提交 `3643e7af97c6a597ad09db51d12676faa1dfc87c`）及官方图标。Termix 使用 Apache-2.0 许可证。

插件代码使用 [MIT 许可证](LICENSE)。[guacd](https://guacamole.apache.org/) 使用 Apache-2.0；[Node.js](https://github.com/nodejs/node)、[OPKSSH](https://github.com/openpubkey/opkssh) 和其他依赖遵循各自的上游许可证。

## Action 发布

推送与 `manifest.json` 版本一致的标签，自动构建并发布 GitHub Release：

```sh
git tag v0.1.9-preview.5
git push origin v0.1.9-preview.5
```

也可在对应标签上手动运行 **Release plugin**。

自动注册插件数据库需要配置 Actions 变量 `DATABASE_REPOSITORY`（`owner/repository`）和 Secret `DATABASE_TOKEN`（数据库仓库写入权限）。正式版本注册到 `main`，预发行版本注册到 `testing`；可手动运行 **Register plugin in database** 重试。
