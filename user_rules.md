# 开发规范精要

## 核心原则
- **简明直接**：解决核心问题，简洁回答，避免冗余
- **一致性优先**：遵循现有代码风格和结构
- **渐进开发**：先实现核心功能，再优化细节

## 代码组织
- 遵循项目现有结构和命名规范
- 优先修改现有代码，保持接口稳定
- 使用已有依赖，避免引入新库

## 前端开发
- **HTML**：使用语义化标签，控制嵌套层级
- **CSS**：采用BEM命名，统一宽度管理，减少冲突
- **JS**：类型安全，模块化设计，异步处理规范

## 用户体验
- 提供清晰的加载状态和反馈机制
- 设计合理的空状态和错误处理
- 保持视觉和交互一致性

## 响应式与优化
- 使用flex/grid构建灵活布局
- 实现合理的断点策略
- 优化DOM操作和资源加载

## 测试与发布
- 验证功能和边界条件
- 分析修改影响和潜在副作用
- 记录变更并更新相关文档 