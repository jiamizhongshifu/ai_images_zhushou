import { NextRequest, NextResponse } from 'next/server';
import { supabaseClient } from '@/utils/supabase-client';
import { handleError } from '@/utils/error-handler';

/**
 * 获取模板列表
 * 支持筛选、分页和排序
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // 解析查询参数
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '12');
    const sort = searchParams.get('sort') || 'created_at';
    const order = searchParams.get('order') || 'desc';
    const status = searchParams.get('status') || 'published';
    const tag = searchParams.get('tag') || null;
    const search = searchParams.get('search') || null;
    
    // 防止异常参数
    const validPage = Math.max(1, page);
    const validLimit = Math.min(24, Math.max(4, limit));
    const offset = (validPage - 1) * validLimit;
    
    // 验证排序参数
    const validSortColumns = ['created_at', 'name', 'use_count'];
    const validSort = validSortColumns.includes(sort) ? sort : 'created_at';
    
    // 验证排序方向
    const validOrder = ['asc', 'desc'].includes(order.toLowerCase()) ? order.toLowerCase() : 'desc';
    
    // 构建查询
    let query = supabaseClient
      .from('templates')
      .select('*')
      .eq('status', status)
      .order(validSort, { ascending: validOrder === 'asc' })
      .range(offset, offset + validLimit - 1);
    
    // 添加标签筛选
    if (tag) {
      query = query.contains('tags', [tag]);
    }
    
    // 添加搜索
    if (search) {
      const searchTerm = `%${search}%`;
      query = query.or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`);
    }
    
    // 执行查询
    const { data: templates, error, count } = await query;
    
    if (error) {
      console.error('获取模板列表失败:', error.message);
      handleError(error, 'templates-api:list');
      return NextResponse.json(
        { success: false, error: '获取模板列表失败' },
        { status: 500 }
      );
    }
    
    // 获取总记录数
    const { count: totalCount, error: countError } = await supabaseClient
      .from('templates')
      .select('*', { count: 'exact', head: true })
      .eq('status', status);
      
    if (countError) {
      console.error('获取模板总数失败:', countError.message);
      handleError(countError, 'templates-api:count');
    }
    
    return NextResponse.json({
      success: true,
      data: templates,
      pagination: {
        total: totalCount || 0,
        page: validPage,
        limit: validLimit,
        pages: Math.ceil((totalCount || 0) / validLimit)
      }
    });
  } catch (error) {
    console.error('获取模板列表时发生异常:', error);
    handleError(error, 'templates-api:unexpected');
    return NextResponse.json(
      { success: false, error: '获取模板列表失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const templateData = await request.json();
    
    // 这里应该有数据验证逻辑
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
    
    // 模拟创建新模板
    const newTemplate = {
      ...templateData,
      id: `template-${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      use_count: 0
    };
    
    // 在实际应用中，这里会将新模板保存到数据库
    
    return NextResponse.json({
      success: true,
      data: newTemplate
    }, { status: 201 });
  } catch (error) {
    console.error('创建模板出错:', error);
    return NextResponse.json({
      success: false,
      error: '创建模板失败'
    }, { status: 500 });
  }
} 