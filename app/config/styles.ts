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
    promptTemplate: "{prompt}，吉卜力风格"
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
    promptTemplate: "{prompt}，风格：Hyper-detailed realism, photorealistic backgrounds, vibrant saturated colors, soft diffused lighting, dramatic contrasts, dreamlike ethereal atmosphere, expansive skies, dynamic weather effects, cinematic depth, lyrical poetic style"
  },
  {
    id: "迪士尼",
    name: "迪士尼",
    description: "经典美式动画风格",
    imageUrl: "/examples/disney.webp",
    promptTemplate: "{prompt}，风格：disney animation style,soft shading,magical atmosphere"
  },
  {
    id: "拍立得",
    name: "拍立得",
    description: "3d q版风格，拍立得",
    imageUrl: "/examples/pailide.webp",
    promptTemplate: "{prompt}，风格：将场景中的角色转化为3D Q版风格，放在一张拍立得照片上，相纸被一只手拿着，照片中的角色正从拍立得照片中走出，呈现出突破二维相片边框、进入二维现实空间的视觉效果。"
  },
  {
    id: "动物森友会",
    name: "动物森友会",
    description: "动物森友会风格",
    imageUrl: "/examples/senyouhui.webp",
    promptTemplate: "{prompt}，风格：3d动森风格"
  },
  {
    id: "Q版3D",
    name: "Q版3D",
    description: "Q版3D风格",
    imageUrl: "/examples/3d.webp",
    promptTemplate: "{prompt}，风格：将场景中的角色转化为3D Q版风格，同时保持原本的场景布置和服装造型不变。 发丝纹理细节：头发可以加更多渐变层次或发丝线条，让质感更真实。 表情强化：增加小巧的牙齿或舌头，或在眼睛加上更多高光与反光，增强灵动感。 饰品扩展：如小耳钉、小发卡、头带等，这些能提升辨识度。 服饰图案更多层次：加入些许立体质感或印花图案（如涂鸦元素、渐变墨渍）。 配件拟真化：比如包包可以做出缝线、拉链、小徽章等细节，提升精致度。 浮空小元素：比如爱心、星星、音符、泡泡，飘在人物周围，增加动感与氛围。"
  },
  {
    id: "snoopy",
    name: "snoopy",
    description: "与snoopy的旅行",
    imageUrl: "/examples/snoopy.webp",
    promptTemplate: "{prompt}，风格：请帮我把我发的照片生成 snoopy 的卡通风格的图片，并加上 snoopy 和 woodstock 两个卡通人物"
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