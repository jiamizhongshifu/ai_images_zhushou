-- 创建模板表
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  preview_image TEXT NOT NULL,
  base_prompt TEXT NOT NULL,
  style_id VARCHAR(50),
  requires_image BOOLEAN DEFAULT false,
  prompt_required BOOLEAN DEFAULT true,
  prompt_guide TEXT,
  prompt_placeholder TEXT,
  tags TEXT[],
  status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  use_count INTEGER DEFAULT 0
);

-- 创建索引
CREATE INDEX IF NOT EXISTS templates_status_idx ON templates(status);
CREATE INDEX IF NOT EXISTS templates_created_at_idx ON templates(created_at);
CREATE INDEX IF NOT EXISTS templates_use_count_idx ON templates(use_count);

-- 添加触发器更新updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_templates_modtime
BEFORE UPDATE ON templates
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

-- 添加初始测试数据
INSERT INTO templates (
  name, 
  description, 
  preview_image, 
  base_prompt, 
  style_id,
  requires_image,
  prompt_required,
  prompt_guide,
  prompt_placeholder,
  tags,
  status
) VALUES 
(
  '人像动漫化', 
  '将真实人像转化为精美的动漫风格，保留人物特征的同时增添艺术感。', 
  '/examples/after-2.webp', 
  'anime style, high quality, detailed facial features, vibrant colors', 
  'ghibli',
  true,
  true,
  '描述您想要的动漫风格和氛围',
  '例如：微笑的女孩，短发，校园场景',
  ARRAY['人像', '动漫', '吉卜力'],
  'published'
),
(
  '宠物卡通化', 
  '将您爱宠的照片转换为可爱的卡通形象，适合制作头像和纪念品。', 
  '/examples/after-3.png', 
  'cartoon pet portrait, cute style, simple background, vibrant colors', 
  'disney',
  true,
  false,
  '描述宠物的特征或您想要的卡通风格',
  '例如：橘猫，蓝色背景，可爱表情',
  ARRAY['宠物', '卡通', '迪士尼'],
  'published'
),
(
  '风景油画', 
  '将风景照片转换为油画风格，富有艺术感的笔触和色彩。', 
  '/examples/after-1.png', 
  'oil painting style, landscape, artistic, textured brushstrokes', 
  'shinkai',
  true,
  true,
  '描述您期望的油画风格或氛围',
  '例如：夕阳下的海滩，明亮色彩，厚重笔触',
  ARRAY['风景', '油画', '艺术'],
  'published'
); 