# 仿人使用文档 · Novel AI 助手

使用说明按真实操作步序写成，便于普通用户快速上手。

## 1. 主界面总览

打开浏览器访问 `http://localhost:5174/novel-ai.html`，即可看到小说 AI 助手工作台的主界面。左侧是项目与章节导航，中间是写作区域，右侧是 AI 助手面板。

![使用视图一览 01](image:///Users/simpleli/workspace/blog-design/doc/novel-ai/use-cases/01-overview.png)

## 2. 编辑器

点击章节列表中的章节进入编辑器，可以直接编写内容。编辑器支持实时字数统计，方便跟踪写作进度。

![使用视图一览 02](image:///Users/simpleli/workspace/blog-design/doc/novel-ai/use-cases/02-editor.png)

## 3. AI 协同

在编辑过程中，点击"同步辅助"按钮，AI 助手会根据当前章节内容提供写作建议，包括情节发展、人物对话优化等。

![使用视图一览 03](image:///Users/simpleli/workspace/blog-design/doc/novel-ai/use-cases/03-ai-assist.png)

## 4. 知识库

知识库面板用于管理故事中的角色、地点、物品等元素。可以为每个元素添加详细描述和关联关系，帮助保持故事一致性。

![使用视图一览 04](image:///Users/simpleli/workspace/blog-design/doc/novel-ai/use-cases/04-knowledge.png)

## 5. 发布计划

发布计划功能允许用户安排章节的发布时间。用户可以设置具体的发布日期和时间，系统会自动将内容推送到指定平台。

![使用视图一览 05](image:///Users/simpleli/workspace/blog-design/doc/novel-ai/use-cases/05-publish.png)

## 6. AI 历史

AI 历史面板记录所有 AI 交互记录，方便用户回溯之前的建议和修改。可以查看每次 AI 助手的响应内容和时间戳。

![使用视图一览 06](image:///Users/simpleli/workspace/blog-design/doc/novel-ai/use-cases/06-history.png)

## 7. 审计日志

审计日志追踪所有系统操作和变更，确保创作过程可追溯。包含用户操作记录、AI 生成内容版本、修改历史等信息。

![使用视图一览 07](image:///Users/simpleli/workspace/blog-design/doc/novel-ai/use-cases/07-audit.png)

## 8. 设置

设置面板允许用户配置 AI 服务参数、主题偏好、数据管理等。可以调整 API 密钥、选择模型、管理本地存储数据。

![使用视图一览 08](image:///Users/simpleli/workspace/blog-design/doc/novel-ai/use-cases/08-settings.png)

## 9. 定时任务验证

系统已安装定时心跳检查任务，每 5 分钟自动验证开发服务器运行状态，并将结果写入日志文件。

- **脚本位置**: `scripts/heartbeat-check.sh`
- **日志文件**: `logs/heartbeat.log`
- **Plist 配置**: `scripts/com.toastblog.heartbeat.plist`

![心跳检查日志](image:///Users/simpleli/workspace/blog-design/logs/heartbeat.log)

## 10. 完整工作流示例

1. 启动开发服务器: `npm run dev`
2. 访问小说 AI 助手: `http://localhost:5174/novel-ai.html`
3. 创建新项目或选择现有项目
4. 在编辑器中编写章节内容
5. 使用 AI 辅助功能获取写作建议
6. 通过知识库管理故事元素
7. 设置发布计划安排章节上线
8. 查看历史记录和审计日志跟踪进展

## 11. 注意事项

- 确保开发服务器正在运行
- AI 功能需要配置正确的 API 密钥
- 本地存储数据会随浏览器清理而丢失
- 建议定期备份重要创作内容
- 定时任务会自动检查服务器状态并记录日志
