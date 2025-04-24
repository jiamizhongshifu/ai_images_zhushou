import { NextRequest, NextResponse } from 'next/server';
import { supabaseClient } from '@/utils/supabase-client';
import { handleError } from '@/utils/error-handler';

// 定义模板数据类型
interface Template {
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

// 模拟数据（与template/route.ts中保持一致）
const mockTemplates = [
  {
    id: "template-1",
    name: "动漫人物",
    description: "创建精美的动漫风格角色",
    preview_image: "/images/templates/anime-character.jpg",
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
  },
  {
    id: "template-2",
    name: "风景插画",
    description: "生成精美的风景插画",
    preview_image: "/images/templates/landscape.jpg",
    style_id: "style-2",
    requires_image: false,
    prompt_required: true,
    prompt_guide: "描述风景的类型、时间、天气和主要元素",
    prompt_placeholder: "描述你想要的风景场景...",
    base_prompt: "landscape illustration, high quality, detailed",
    tags: ["风景", "插画", "自然"],
    status: "published",
    created_at: "2023-10-02T14:30:00Z",
    updated_at: "2023-10-02T14:30:00Z",
    use_count: 980
  },
  {
    id: "template-3",
    name: "卡通头像",
    description: "创建可爱的卡通风格头像",
    preview_image: "/images/templates/cartoon-avatar.jpg",
    style_id: "style-3",
    requires_image: true,
    prompt_required: true,
    prompt_guide: "上传一张正面照片，并描述想要的卡通风格",
    prompt_placeholder: "描述你想要的卡通风格...",
    base_prompt: "cartoon avatar, cute style, colorful",
    tags: ["头像", "卡通", "人物"],
    status: "published",
    created_at: "2023-10-03T09:15:00Z",
    updated_at: "2023-10-03T09:15:00Z",
    use_count: 1560
  },
  {
    id: "template-4",
    name: "动物森友会风格",
    description: "使用动物森友会风格创建可爱的场景和角色",
    preview_image: "/images/templates/animal-crossing.jpg",
    style_id: "style-4",
    requires_image: false,
    prompt_required: true,
    prompt_guide: "描述你想要的角色或场景，动物森友会风格将自动应用",
    prompt_placeholder: "描述你想要的动物森友会场景...",
    base_prompt: "animal crossing style, cute, colorful, chibi characters",
    tags: ["游戏", "动物森友会", "可爱"],
    status: "published",
    created_at: "2023-11-05T16:20:00Z",
    updated_at: "2023-11-05T16:20:00Z",
    use_count: 890
  },
  {
    id: "template-5",
    name: "科幻场景",
    description: "创建未来科幻风格的场景",
    preview_image: "/images/templates/sci-fi.jpg",
    style_id: null,
    requires_image: false,
    prompt_required: true,
    prompt_guide: "描述未来世界的场景、技术和氛围",
    prompt_placeholder: "描述你想要的科幻场景...",
    base_prompt: "sci-fi scene, futuristic, high quality, detailed",
    tags: ["科幻", "未来", "场景"],
    status: "draft",
    created_at: "2023-12-10T11:45:00Z",
    updated_at: "2023-12-10T11:45:00Z",
    use_count: 320
  }
];

/**
 * 获取单个模板详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // 查找模板
    const template = mockTemplates.find(template => template.id === id);
    
    if (!template) {
      return NextResponse.json({
        success: false,
        error: '未找到模板'
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('获取模板详情出错:', error);
    return NextResponse.json({
      success: false,
      error: '获取模板详情失败'
    }, { status: 500 });
  }
}

/**
 * 更新模板使用次数
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { success: false, error: '无效的模板ID' },
        { status: 400 }
      );
    }
    
    // 获取模板当前使用次数
    const { data, error: getError } = await supabaseClient
      .from('templates')
      .select('use_count')
      .eq('id', id)
      .single();
    
    if (getError) {
      console.error(`获取模板(ID: ${id})使用次数失败:`, getError.message);
      handleError(getError, `templates-api:update-count:${id}`);
      return NextResponse.json(
        { success: false, error: '更新模板使用次数失败' },
        { status: 500 }
      );
    }
    
    // 安全处理数据
    const template = data as any;
    
    // 更新使用次数
    const currentCount = template && template.use_count ? template.use_count : 0;
    const { error: updateError } = await supabaseClient
      .from('templates')
      .update({ use_count: currentCount + 1 })
      .eq('id', id);
    
    if (updateError) {
      console.error(`更新模板(ID: ${id})使用次数失败:`, updateError.message);
      handleError(updateError, `templates-api:update-count:${id}`);
      return NextResponse.json(
        { success: false, error: '更新模板使用次数失败' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: { message: '模板使用次数已更新' }
    });
  } catch (error) {
    console.error('更新模板使用次数时发生异常:', error);
    handleError(error, 'templates-api:update-count:unexpected');
    return NextResponse.json(
      { success: false, error: '更新模板使用次数失败' },
      { status: 500 }
    );
  }
}

// 更新模板
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const templateData = await request.json();
    
    // 查找模板
    const templateIndex = mockTemplates.findIndex(template => template.id === id);
    
    if (templateIndex === -1) {
      return NextResponse.json({
        success: false,
        error: '未找到模板'
      }, { status: 404 });
    }
    
    // 验证数据
    if (!templateData.name) {
      return NextResponse.json({
        success: false,
        error: '模板名称不能为空'
      }, { status: 400 });
    }
    
    if (!templateData.preview_image) {
      return NextResponse.json({
        success: false,
        error: '请上传预览图片'
      }, { status: 400 });
    }
    
    // 更新模板
    const updatedTemplate = {
      ...mockTemplates[templateIndex],
      ...templateData,
      updated_at: new Date().toISOString()
    };
    
    // 在实际应用中，这里会将更新后的模板保存到数据库
    
    return NextResponse.json({
      success: true,
      data: updatedTemplate
    });
  } catch (error) {
    console.error('更新模板出错:', error);
    return NextResponse.json({
      success: false,
      error: '更新模板失败'
    }, { status: 500 });
  }
}

// 删除模板
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    // 查找模板
    const templateIndex = mockTemplates.findIndex(template => template.id === id);
    
    if (templateIndex === -1) {
      return NextResponse.json({
        success: false,
        error: '未找到模板'
      }, { status: 404 });
    }
    
    // 在实际应用中，这里会从数据库中删除模板
    
    return NextResponse.json({
      success: true,
      message: '模板已成功删除'
    });
  } catch (error) {
    console.error('删除模板出错:', error);
    return NextResponse.json({
      success: false,
      error: '删除模板失败'
    }, { status: 500 });
  }
} 