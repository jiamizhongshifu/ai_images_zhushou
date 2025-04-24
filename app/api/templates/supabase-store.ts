// Supabase版模板存储类
import { supabaseClient } from '@/utils/supabase-client';
import { Template } from './store';

// 模板存储类 - Supabase版本
export class SupabaseTemplateStore {
  // 获取所有模板
  public async getTemplates(): Promise<Template[]> {
    try {
      const { data, error } = await supabaseClient
        .from('templates')
        .select('*');
        
      if (error) {
        console.error('获取所有模板失败:', error);
        throw error;
      }
      
      return (data || []) as unknown as Template[];
    } catch (error) {
      console.error('获取所有模板失败:', error);
      return [];
    }
  }

  // 获取单个模板
  public async getTemplate(id: string): Promise<Template | undefined> {
    try {
      const { data, error } = await supabaseClient
        .from('templates')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) {
        if (error.code === 'PGRST116') {
          console.log(`未找到模板: ${id}`);
          return undefined;
        }
        console.error(`获取模板 ${id} 失败:`, error);
        throw error;
      }
      
      return data as unknown as Template;
    } catch (error) {
      console.error(`获取模板 ${id} 失败:`, error);
      return undefined;
    }
  }

  // 添加新模板
  public async addTemplate(template: Template): Promise<Template> {
    try {
      const { data, error } = await supabaseClient
        .from('templates')
        .insert([template])
        .select()
        .single();
        
      if (error) {
        console.error('添加模板失败:', error);
        throw error;
      }
      
      console.log(`添加新模板成功: ${template.id}`);
      return data as unknown as Template;
    } catch (error: any) {
      console.error('添加模板失败:', error);
      throw new Error(`添加模板失败: ${error.message}`);
    }
  }

  // 更新模板
  public async updateTemplate(id: string, updates: Partial<Template>): Promise<Template | undefined> {
    try {
      const { data, error } = await supabaseClient
        .from('templates')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
        
      if (error) {
        console.error(`更新模板 ${id} 失败:`, error);
        throw error;
      }
      
      if (!data) {
        console.log(`更新失败: 未找到模板 ${id}`);
        return undefined;
      }
      
      console.log(`更新模板成功: ${id}`);
      return data as unknown as Template;
    } catch (error: any) {
      console.error(`更新模板 ${id} 失败:`, error);
      throw new Error(`更新模板失败: ${error.message}`);
    }
  }

  // 删除模板
  public async deleteTemplate(id: string): Promise<boolean> {
    try {
      const { error } = await supabaseClient
        .from('templates')
        .delete()
        .eq('id', id);
        
      if (error) {
        console.error(`删除模板 ${id} 失败:`, error);
        throw error;
      }
      
      console.log(`删除模板成功: ${id}`);
      return true;
    } catch (error: any) {
      console.error(`删除模板 ${id} 失败:`, error);
      throw new Error(`删除模板失败: ${error.message}`);
    }
  }
  
  // 按条件查询模板
  public async queryTemplates(options: {
    status?: string,
    search?: string,
    tag?: string,
    sort?: string,
    order?: 'asc' | 'desc',
    limit?: number,
    offset?: number
  }): Promise<{ templates: Template[], total: number }> {
    try {
      // 创建查询对象
      let query = supabaseClient.from('templates').select('*', { count: 'exact' });
      
      // 应用状态过滤
      if (options.status && options.status !== 'all') {
        query = query.eq('status', options.status);
      }
      
      // 应用标签过滤
      if (options.tag) {
        query = query.contains('tags', [options.tag]);
      }
      
      // 应用搜索过滤
      if (options.search) {
        query = query.or(`name.ilike.%${options.search}%,description.ilike.%${options.search}%`);
      }
      
      // 应用排序
      if (options.sort) {
        const direction = options.order || 'desc';
        query = query.order(options.sort, { ascending: direction === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }
      
      // 应用分页
      if (options.limit) {
        query = query.limit(options.limit);
        
        if (options.offset) {
          query = query.range(options.offset, options.offset + options.limit - 1);
        }
      }
      
      // 执行查询
      const { data, error, count } = await query;
      
      if (error) {
        console.error('查询模板失败:', error);
        throw error;
      }
      
      return { 
        templates: (data || []) as unknown as Template[], 
        total: count || 0 
      };
    } catch (error) {
      console.error('查询模板失败:', error);
      return { templates: [], total: 0 };
    }
  }

  // 增加模板使用次数
  public async incrementUseCount(id: string): Promise<boolean> {
    try {
      // 获取当前模板信息
      const { data: template, error: getError } = await supabaseClient
        .from('templates')
        .select('use_count')
        .eq('id', id)
        .single();
      
      if (getError) {
        console.error(`获取模板 ${id} 使用次数失败:`, getError);
        throw getError;
      }
      
      // 更新使用次数
      const currentCount = template ? (template as unknown as { use_count?: number }).use_count || 0 : 0;
      const { error: updateError } = await supabaseClient
        .from('templates')
        .update({ use_count: currentCount + 1, updated_at: new Date().toISOString() })
        .eq('id', id);
      
      if (updateError) {
        console.error(`更新模板 ${id} 使用次数失败:`, updateError);
        throw updateError;
      }
      
      return true;
    } catch (error) {
      console.error(`增加模板 ${id} 使用次数失败:`, error);
      return false;
    }
  }
}

// 导出单例实例
export const templateStore = new SupabaseTemplateStore(); 