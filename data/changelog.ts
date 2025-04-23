// 更新日志条目类型
export type ChangelogEntry = {
  id: string;           // 唯一标识
  version: string;      // 版本号，如 "v1.2.0"
  date: string;         // 发布日期，如 "2023-12-15"
  title: string;        // 标题
  description: string;  // 描述
  changes: {
    type: "new" | "improved" | "fixed" | "upcoming"; // 变更类型
    content: string;    // 变更内容
  }[];
  isPublished: boolean; // 是否已发布
}

// 更新日志数据
export const changelogData: ChangelogEntry[] = [
  {
    id: "1",
    version: "v1.0.0",
    date: "2025-04-20",
    title: "首次正式发布",
    description: "我们很高兴推出网站的第一个正式版本！",
    changes: [
      { type: "new", content: "图像生成功能上线" },
      { type: "new", content: "用户注册和认证系统" },
      { type: "new", content: "历史记录查询功能" },
      { type: "new", content: "多种风格模板选择" }
    ],
    isPublished: true
  },
  {
    id: "2",
    version: "v1.1.0",
    date: "2025-04-22",
    title: "功能优化与新增",
    description: "此版本增加了多项用户体验优化和新功能",
    changes: [
      { type: "new", content: "增加谷歌邮箱登录" },
      { type: "improved", content: "提升图像生成速度" },
      { type: "improved", content: "优化移动端布局" },
      { type: "fixed", content: "修复历史记录加载问题" }
    ],
    isPublished: true
  },
  {
    id: "3",
    version: "即将推出",
    date: "",
    title: "功能规划",
    description: "我们正在开发的新功能",
    changes: [
      { type: "upcoming", content: "更多实用图像处理工具" },
      { type: "upcoming", content: "批量生成功能" },
      { type: "upcoming", content: "创意广场" },
      { type: "upcoming", content: "多语言支持" }
    ],
    isPublished: true
  }
] 