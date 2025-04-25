import { NextRequest, NextResponse } from 'next/server';
import { handleError } from '@/utils/error-handler';
import { v4 as uuidv4 } from 'uuid';
import { templateStore } from '../supabase-store';

/**
 * 获取单个模板详情
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await context.params;
    console.log(`获取模板详情，ID: ${templateId}`);
    
    if (!templateId) {
      return NextResponse.json({
        success: false,
        error: '缺少模板ID'
      }, { status: 400 });
    }
    
    console.log(`获取模板: ${templateId}`);
    const template = await templateStore.getTemplate(templateId);
    
    if (!template) {
      console.log(`未找到模板: ${templateId}`);
      return NextResponse.json({
        success: false,
        error: '未找到模板'
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      data: template
    });
  } catch (error: any) {
    console.error('获取模板失败:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '获取模板失败'
    }, { status: 500 });
  }
}

/**
 * 更新模板使用次数
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await context.params;
    console.log(`更新模板，ID: ${templateId}`);
    
    if (!templateId || typeof templateId !== 'string') {
      return NextResponse.json(
        { success: false, error: '无效的模板ID' },
        { status: 400 }
      );
    }
    
    // 使用新的模板存储类增加使用次数
    const success = await templateStore.incrementUseCount(templateId);
    
    if (!success) {
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

/**
 * 更新模板
 */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await context.params;
    console.log(`替换模板，ID: ${templateId}`);
    
    const template = await templateStore.getTemplate(templateId);
    
    if (!template) {
      return NextResponse.json(
        {
          success: false,
          error: "未找到模板"
        },
        { status: 404 }
      );
    }
    
    const updatedTemplate = await templateStore.updateTemplate(templateId, {
      use_count: (template.use_count || 0) + 1,
      updated_at: new Date().toISOString()
    });
    
    return NextResponse.json({
      success: true,
      data: updatedTemplate
    });
  } catch (error) {
    console.error('更新模板使用次数失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: "更新模板使用次数失败"
      },
      { status: 500 }
    );
  }
}

/**
 * 删除模板
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: templateId } = await context.params;
    console.log(`删除模板，ID: ${templateId}`);
    
    if (!templateId) {
      return NextResponse.json({
        success: false,
        error: '缺少模板ID'
      }, { status: 400 });
    }
    
    console.log(`删除模板: ${templateId}`);
    const success = await templateStore.deleteTemplate(templateId);
    
    if (!success) {
      return NextResponse.json({
        success: false,
        error: '未找到模板'
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      message: '模板已删除'
    });
  } catch (error: any) {
    console.error('删除模板失败:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '删除模板失败'
    }, { status: 500 });
  }
} 