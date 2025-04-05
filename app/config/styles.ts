// 风格类型定义
export interface StyleConfig {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  // 可以扩展额外字段，比如提示词模板
  promptTemplate?: string;
}

// 风格配置数据
export const STYLE_CONFIGS: StyleConfig[] = [
  {
    id: "自定义",
    name: "自定义",
    description: "使用您的提示词自由定义风格，不应用预设效果",
    imageUrl: "/examples/custom.webp",
    promptTemplate: "{prompt}" // 原始提示词不变
  },
  {
    id: "吉卜力",
    name: "吉卜力",
    description: "细腻精致、充满幻想的日式动画风格",
    imageUrl: "/examples/ghibli.webp",
    promptTemplate: "{prompt}，生成转换成吉普力风格风格的图像"
  },
  {
    id: "乐高",
    name: "乐高",
    description: "积木拼搭风格，充满趣味性",
    imageUrl: "/examples/lego.webp",
    promptTemplate: "{prompt}，风格：乐高"
  },
  {
    id: "皮克斯",
    name: "皮克斯",
    description: "3D卡通风格，生动活泼",
    imageUrl: "/examples/pixar.webp",
    promptTemplate: "{prompt}，风格：皮克斯"
  },
  {
    id: "新海诚",
    name: "新海诚",
    description: "唯美光影、细腻情感表达",
    imageUrl: "/examples/shinkai.webp",
    promptTemplate: "{prompt}，风格：新海诚"
  },
  {
    id: "迪士尼",
    name: "迪士尼",
    description: "经典美式动画风格",
    imageUrl: "/examples/disney.webp",
    promptTemplate: "{prompt}，风格：迪士尼"
  }
];

// 辅助函数：根据ID获取风格配置
export function getStyleById(styleId: string): StyleConfig | undefined {
  return STYLE_CONFIGS.find(style => style.id === styleId);
}

// 辅助函数：根据风格ID和提示词生成完整提示词
export function generatePromptWithStyle(styleId: string, userPrompt: string): string {
  const style = getStyleById(styleId);
  if (!style || !style.promptTemplate) {
    return userPrompt || "生成图像";
  }
  
  // 如果用户没有输入提示词，使用默认提示词
  const basePrompt = userPrompt.trim() || "生成图像";
  
  // 将用户提示词插入模板
  return style.promptTemplate.replace('{prompt}', basePrompt);
} 