// 定义模板数据类型
export interface Template {
  id: string;
  name: string;
  description: string;
  preview_image: string;
  base_prompt: string;
  style_id: string | null;
  requires_image: boolean;
  prompt_required: boolean;
  prompt_guide: string | null;
  prompt_placeholder: string | null;
  tags: string[];
  status: string;
  created_at: string;
  updated_at: string;
  use_count: number;
}

import fs from 'fs';
import path from 'path';

// 初始模板数据
const initialTemplates: Template[] = [
  {
    id: "template-anime-portrait",
    name: "人像动漫化",
    description: "将真实人像照片转换为动漫风格",
    preview_image: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABQODxIPDRQSEBIXFRQdHx4eHRoaHSQtJSEkLzYvLy0vLi44QzxAOEE4Ny42RUhMS0pNUjlFRVtdW0BJSVr/2wBDAR...",  // 这里是base64图片数据，为了简洁省略了部分内容
    style_id: "style-anime",
    requires_image: true,
    prompt_required: true,
    prompt_guide: "上传一张清晰的人像照片，并描述想要的动漫风格效果",
    prompt_placeholder: "描述你想要的动漫风格效果...",
    base_prompt: "anime portrait, high quality, detailed",
    tags: ["人像", "动漫", "转换"],
    status: "published",
    created_at: "2024-01-15T08:00:00Z",
    updated_at: "2024-01-15T08:00:00Z",
    use_count: 2100
  },
  {
    id: "template-1",
    name: "动漫人物",
    description: "创建精美的动漫风格角色",
    preview_image: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABQODxIPDRQSEBIXFRQdHx4eHRoaHSQtJSEkLzYvLy0vLi44QzxAOEE4Ny42RUhMS0pNUjlFRVtdW0BJSVr/2wBDAR...",  // 这里是base64图片数据，为了简洁省略了部分内容
    style_id: "style-1",
    requires_image: false,
    prompt_required: true,
    prompt_guide: "描述角色的外观、服装、表情和姿势",
    prompt_placeholder: "描述你想要的动漫角色...",
    base_prompt: "anime character, high quality, detailed",
    tags: ["动漫", "角色", "人物"],
    status: "published",
    created_at: "2023-10-01T10:00:00Z",
    updated_at: "2023-10-01T10:00:00Z",
    use_count: 1250
  }
];

const DATA_FILE = path.join(process.cwd(), 'data', 'templates.json');

// 确保数据目录存在
if (!fs.existsSync(path.dirname(DATA_FILE))) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

// 如果数据文件不存在，使用初始数据创建
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(initialTemplates, null, 2));
}

// 创建模板存储类
class TemplateStore {
  private readTemplates(): Template[] {
    try {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('读取模板数据失败:', error);
      return [];
    }
  }

  private writeTemplates(templates: Template[]): void {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(templates, null, 2));
    } catch (error) {
      console.error('写入模板数据失败:', error);
    }
  }

  // 获取所有模板
  public getTemplates(): Template[] {
    return this.readTemplates();
  }

  // 获取单个模板
  public getTemplate(id: string): Template | undefined {
    const templates = this.readTemplates();
    console.log('查找模板:', id, '当前模板数量:', templates.length);
    const template = templates.find(t => t.id === id);
    if (!template) {
      console.log('未找到模板，可用模板:', templates.map(t => t.id));
    }
    return template;
  }

  // 添加新模板
  public addTemplate(template: Template): Template {
    console.log('添加新模板:', template.id);
    const templates = this.readTemplates();
    templates.push(template);
    this.writeTemplates(templates);
    console.log('添加成功，当前模板数量:', templates.length);
    return template;
  }

  // 更新模板
  public updateTemplate(id: string, updates: Partial<Template>): Template | undefined {
    const templates = this.readTemplates();
    const index = templates.findIndex(t => t.id === id);
    if (index === -1) {
      console.log('更新失败：未找到模板', id);
      return undefined;
    }

    const updatedTemplate = {
      ...templates[index],
      ...updates,
      updated_at: new Date().toISOString()
    };

    templates[index] = updatedTemplate;
    this.writeTemplates(templates);
    console.log('更新成功：', id);
    return updatedTemplate;
  }

  // 删除模板
  public deleteTemplate(id: string): boolean {
    const templates = this.readTemplates();
    const initialLength = templates.length;
    const filteredTemplates = templates.filter(t => t.id !== id);
    const deleted = filteredTemplates.length < initialLength;
    
    if (deleted) {
      this.writeTemplates(filteredTemplates);
      console.log('删除模板:', id, '成功');
    } else {
      console.log('删除模板:', id, '失败');
    }
    
    return deleted;
  }
}

// 导出单例实例
export const templateStore = new TemplateStore(); 