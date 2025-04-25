// PostgreSQL数据库版模板存储
import { Pool } from 'pg';
import { Template } from './store'; // 复用原来的Template接口

// 导入数据库配置
const dbConfig = require('../../../config/database');

// 创建数据库连接池
const pool = new Pool(dbConfig);

// 将驼峰命名转换为蛇形命名
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// 将蛇形命名转换为驼峰命名
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, match => match[1].toUpperCase());
}

// 将数据库行转换为Template对象
function rowToTemplate(row: any): Template {
  const template: any = {};
  
  // 处理所有字段
  for (const key in row) {
    const camelKey = snakeToCamel(key);
    template[camelKey] = row[key];
  }
  
  return template as Template;
}

// 模板存储类 - PostgreSQL版本
export class TemplateDbStore {
  // 获取所有模板
  public async getTemplates(): Promise<Template[]> {
    try {
      const result = await pool.query('SELECT * FROM templates');
      return result.rows.map(row => rowToTemplate(row));
    } catch (error) {
      console.error('获取所有模板失败:', error);
      return [];
    }
  }

  // 获取单个模板
  public async getTemplate(id: string): Promise<Template | undefined> {
    try {
      const result = await pool.query('SELECT * FROM templates WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        console.log(`未找到模板: ${id}`);
        return undefined;
      }
      return rowToTemplate(result.rows[0]);
    } catch (error) {
      console.error(`获取模板 ${id} 失败:`, error);
      return undefined;
    }
  }

  // 添加新模板
  public async addTemplate(template: Template): Promise<Template> {
    try {
      const fields = Object.keys(template);
      const snakeFields = fields.map(camelToSnake);
      
      // 构建插入语句
      const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
      const columns = snakeFields.join(', ');
      
      const query = `
        INSERT INTO templates (${columns})
        VALUES (${placeholders})
        RETURNING *
      `;
      
      const values = fields.map(field => template[field as keyof Template]);
      
      const result = await pool.query(query, values);
      console.log(`添加新模板成功: ${template.id}`);
      
      return rowToTemplate(result.rows[0]);
    } catch (error) {
      console.error('添加模板失败:', error);
      let errorMessage = '添加模板失败';
      if (error instanceof Error) {
        errorMessage += `: ${error.message}`;
      }
      throw new Error(errorMessage);
    }
  }

  // 更新模板
  public async updateTemplate(id: string, updates: Partial<Template>): Promise<Template | undefined> {
    try {
      const fields = Object.keys(updates);
      const snakeFields = fields.map(camelToSnake);
      
      // 构建SET子句
      const setClause = snakeFields.map((field, i) => `${field} = $${i + 2}`).join(', ');
      
      const query = `
        UPDATE templates
        SET ${setClause}, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
      
      const values = [id, ...fields.map(field => updates[field as keyof Partial<Template>])];
      
      const result = await pool.query(query, values);
      
      if (result.rows.length === 0) {
        console.log(`更新失败: 未找到模板 ${id}`);
        return undefined;
      }
      
      console.log(`更新模板成功: ${id}`);
      return rowToTemplate(result.rows[0]);
    } catch (error) {
      console.error(`更新模板 ${id} 失败:`, error);
      let errorMessage = `更新模板失败`;
      if (error instanceof Error) {
        errorMessage += `: ${error.message}`;
      }
      throw new Error(errorMessage);
    }
  }

  // 删除模板
  public async deleteTemplate(id: string): Promise<boolean> {
    try {
      const result = await pool.query('DELETE FROM templates WHERE id = $1 RETURNING id', [id]);
      const success = result.rows.length > 0;
      
      if (success) {
        console.log(`删除模板成功: ${id}`);
      } else {
        console.log(`删除失败: 未找到模板 ${id}`);
      }
      
      return success;
    } catch (error) {
      console.error(`删除模板 ${id} 失败:`, error);
      let errorMessage = `删除模板失败`;
      if (error instanceof Error) {
        errorMessage += `: ${error.message}`;
      }
      throw new Error(errorMessage);
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
      let whereClause = '';
      const params: any[] = [];
      let paramIndex = 1;
      
      // 构建WHERE子句
      const conditions = [];
      
      if (options.status && options.status !== 'all') {
        conditions.push(`status = $${paramIndex++}`);
        params.push(options.status);
      }
      
      if (options.tag) {
        conditions.push(`$${paramIndex++} = ANY(tags)`);
        params.push(options.tag);
      }
      
      if (options.search) {
        conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
        params.push(`%${options.search}%`);
        paramIndex++;
      }
      
      if (conditions.length > 0) {
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }
      
      // 构建ORDER BY子句
      let orderClause = '';
      if (options.sort) {
        const snakeSort = camelToSnake(options.sort);
        orderClause = `ORDER BY ${snakeSort} ${options.order || 'desc'}`;
      } else {
        orderClause = 'ORDER BY created_at DESC';
      }
      
      // 构建LIMIT和OFFSET子句
      let limitOffsetClause = '';
      if (options.limit) {
        limitOffsetClause = `LIMIT ${options.limit}`;
        
        if (options.offset) {
          limitOffsetClause += ` OFFSET ${options.offset}`;
        }
      }
      
      // 执行查询
      const countQuery = `SELECT COUNT(*) FROM templates ${whereClause}`;
      const countResult = await pool.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);
      
      const dataQuery = `
        SELECT * FROM templates
        ${whereClause}
        ${orderClause}
        ${limitOffsetClause}
      `;
      
      const dataResult = await pool.query(dataQuery, params);
      const templates = dataResult.rows.map(row => rowToTemplate(row));
      
      return { templates, total };
    } catch (error) {
      console.error('查询模板失败:', error);
      // 查询失败通常不应抛出错误，而是返回空结果
      return { templates: [], total: 0 };
    }
  }
}

// 导出单例实例
export const templateDbStore = new TemplateDbStore(); 