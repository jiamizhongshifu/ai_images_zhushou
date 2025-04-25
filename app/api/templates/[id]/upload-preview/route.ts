import { NextRequest, NextResponse } from 'next/server';
import { templateStore } from '../../supabase-store';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: templateId } = params;
    console.log(`尝试上传图片到模板 ID: ${templateId}`);
    
    // 获取所有模板ID列表用于调试
    const templates = await templateStore.getTemplates();
    const allTemplateIds = templates.map(t => t.id);
    console.log('当前所有模板IDs:', allTemplateIds);
    
    // 查找模板
    const template = await templateStore.getTemplate(templateId);
    
    if (!template) {
      console.error(`未找到模板 ID: ${templateId}. 所有可用模板: ${allTemplateIds.join(', ')}`);
      
      // 额外验证：检查ID是否与任何现有模板部分匹配（可能是大小写或格式问题）
      const partialMatches = allTemplateIds.filter(id => 
        id.includes(templateId) || templateId.includes(id)
      );
      
      if (partialMatches.length > 0) {
        console.log(`发现部分匹配的模板IDs: ${partialMatches.join(', ')}`);
      }
      
      return NextResponse.json(
        {
          success: false,
          error: "未找到模板"
        },
        { status: 404 }
      );
    }
    
    console.log(`找到模板: ${template.name} (ID: ${template.id})`);
    
    // 解析FormData
    const formData = await request.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      console.error('没有提供图片文件');
      return NextResponse.json(
        {
          success: false,
          error: "请提供图片文件"
        },
        { status: 400 }
      );
    }
    
    // 检查文件类型
    if (!file.type.startsWith("image/")) {
      console.error(`非法文件类型: ${file.type}`);
      return NextResponse.json(
        {
          success: false,
          error: "请上传图片文件"
        },
        { status: 400 }
      );
    }
    
    try {
      // 读取文件
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // 转为base64
      const base64Image = `data:${file.type};base64,${buffer.toString("base64")}`;
      
      // 更新模板
      const updates = {
        preview_image: base64Image,
        updated_at: new Date().toISOString()
      };
      
      // 使用SupabaseTemplateStore的异步方法更新
      const updatedTemplate = await templateStore.updateTemplate(templateId, updates);
      
      if (!updatedTemplate) {
        throw new Error('更新模板失败');
      }
      
      console.log(`成功更新模板预览图片: ${template.name} (ID: ${template.id})`);
      
      return NextResponse.json({
        success: true,
        data: {
          id: updatedTemplate.id,
          preview_image: updatedTemplate.preview_image
        }
      });
    } catch (fileError) {
      console.error('处理图片文件失败:', fileError);
      return NextResponse.json(
        {
          success: false,
          error: "处理图片失败"
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('上传预览图片失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: "上传预览图片失败"
      },
      { status: 500 }
    );
  }
} 