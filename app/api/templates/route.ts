import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { templateStore } from './supabase-store';
import type { Template } from '@/app/api/templates/types';

/**
 * 获取模板列表
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const getTags = url.searchParams.get('tags') === 'true';
    
    // 如果是获取标签列表的请求
    if (getTags) {
      const templates = await templateStore.getTemplates();
      // 从所有模板中提取标签并去重
      const tags = Array.from(new Set(
        templates.flatMap(template => template.tags || [])
      )).filter(Boolean);
      
      return NextResponse.json({
        success: true,
        data: tags
      });
    }
    
    const searchParams = request.nextUrl.searchParams;
    
    // 解析查询参数
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '12');
    const sort = searchParams.get('sort') || 'created_at';
    const order = (searchParams.get('order') || 'desc') as 'asc' | 'desc';
    const status = searchParams.get('status') || 'published';
    const tag = searchParams.get('tag') || undefined;
    const search = searchParams.get('search') || undefined;
    
    // 防止异常参数
    const validPage = Math.max(1, page);
    const validLimit = Math.min(24, Math.max(4, limit));
    const offset = (validPage - 1) * validLimit;
    
    console.log('API: 查询模板，参数:', { 
      page: validPage, 
      limit: validLimit,
      offset,
      sort, 
      order, 
      status, 
      tag, 
      search
    });
    
    // 使用Supabase存储查询
    const result = await templateStore.queryTemplates({
      status: status !== 'all' ? status : undefined,
      tag,
      search,
      sort,
      order,
      limit: validLimit,
      offset
    });
    
    console.log(`API: 查询返回 ${result.templates.length} 条数据, 总数: ${result.total}`);
    
    return NextResponse.json({
      success: true,
      data: result.templates,
      pagination: {
        total: result.total,
        page: validPage,
        limit: validLimit,
        pages: Math.ceil(result.total / validLimit)
      }
    });
  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '操作失败'
    }, { status: 500 });
  }
}

/**
 * 创建新模板
 */
export async function POST(request: NextRequest) {
  try {
    const templateData = await request.json();
    
    // 验证必填字段
    if (!templateData.name?.trim()) {
      return NextResponse.json({
        success: false,
        error: '模板名称不能为空'
      }, { status: 400 });
    }
    
    if (!templateData.description?.trim()) {
      return NextResponse.json({
        success: false,
        error: '模板描述不能为空'
      }, { status: 400 });
    }
    
    // 生成标准UUID作为模板ID，以适应Supabase的UUID类型要求
    const templateId = uuidv4();
    
    console.log('生成新的UUID模板ID:', templateId);
    
    const newTemplate: Template = {
      ...templateData,
      id: templateId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      use_count: 0,
      preview_image: templateData.preview_image || '',
      status: templateData.status || 'published',
      tags: templateData.tags || [],
      prompt_guide: templateData.prompt_guide || null,
      prompt_placeholder: templateData.prompt_placeholder || null,
      style_id: templateData.style_id || null
    };
    
    console.log('准备创建新模板:', {
      id: newTemplate.id,
      name: newTemplate.name,
      status: newTemplate.status
    });
    
    // 添加到Supabase
    const savedTemplate = await templateStore.addTemplate(newTemplate);
    
    return NextResponse.json({
      success: true,
      data: savedTemplate
    });
  } catch (error: any) {
    console.error('创建模板失败:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '创建模板失败'
    }, { status: 500 });
  }
} 