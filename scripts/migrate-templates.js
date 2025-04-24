// 模板数据迁移脚本：从JSON文件到PostgreSQL数据库
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const dbConfig = require('../config/database');

// 创建数据库连接池
const pool = new Pool(dbConfig);

// 将大型JSON文件分块读取
async function readJsonChunks(filePath, chunkSize = 5) {
  return new Promise((resolve, reject) => {
    try {
      const jsonData = fs.readFileSync(filePath, 'utf8');
      const templates = JSON.parse(jsonData);
      
      // 将数组分成多个小块
      const chunks = [];
      for (let i = 0; i < templates.length; i += chunkSize) {
        chunks.push(templates.slice(i, i + chunkSize));
      }
      
      resolve({ templates, chunks });
    } catch (error) {
      reject(error);
    }
  });
}

async function migrateTemplates() {
  console.log('开始迁移模板数据...');
  
  try {
    // 读取JSON文件
    const jsonFilePath = path.join(process.cwd(), 'data', 'templates.json');
    console.log(`读取JSON文件: ${jsonFilePath}`);
    
    if (!fs.existsSync(jsonFilePath)) {
      console.error('错误: 模板JSON文件不存在!');
      return;
    }
    
    // 分块读取大型JSON文件
    const { templates, chunks } = await readJsonChunks(jsonFilePath);
    console.log(`成功读取JSON文件，共找到 ${templates.length} 个模板，分为 ${chunks.length} 个批次处理`);
    
    // 连接到数据库
    const client = await pool.connect();
    console.log('数据库连接成功');
    
    try {
      // 创建表 (如果不存在)
      await client.query(`
        CREATE TABLE IF NOT EXISTS templates (
          id VARCHAR(100) PRIMARY KEY,
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
      `);
      console.log('确保模板表已创建');
      
      // 创建索引 (如果不存在)
      await client.query(`
        CREATE INDEX IF NOT EXISTS templates_status_idx ON templates(status);
        CREATE INDEX IF NOT EXISTS templates_created_at_idx ON templates(created_at);
        CREATE INDEX IF NOT EXISTS templates_use_count_idx ON templates(use_count);
      `);
      console.log('确保索引已创建');
      
      let successCount = 0;
      let errorCount = 0;
      
      // 分批处理模板
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        console.log(`处理批次 ${chunkIndex + 1}/${chunks.length}, 包含 ${chunk.length} 个模板`);
        
        // 开始事务
        await client.query('BEGIN');
        
        // 迁移当前批次的模板
        for (const template of chunk) {
          try {
            // 插入模板数据
            await client.query(`
              INSERT INTO templates(
                id, name, description, preview_image, base_prompt, 
                style_id, requires_image, prompt_required, prompt_guide, 
                prompt_placeholder, tags, status, created_at, updated_at, use_count
              ) 
              VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                preview_image = EXCLUDED.preview_image,
                base_prompt = EXCLUDED.base_prompt,
                style_id = EXCLUDED.style_id,
                requires_image = EXCLUDED.requires_image,
                prompt_required = EXCLUDED.prompt_required,
                prompt_guide = EXCLUDED.prompt_guide,
                prompt_placeholder = EXCLUDED.prompt_placeholder,
                tags = EXCLUDED.tags,
                status = EXCLUDED.status,
                updated_at = EXCLUDED.updated_at,
                use_count = EXCLUDED.use_count
            `, [
              template.id,
              template.name,
              template.description,
              template.preview_image,
              template.base_prompt,
              template.style_id,
              template.requires_image,
              template.prompt_required,
              template.prompt_guide,
              template.prompt_placeholder,
              template.tags,
              template.status,
              template.created_at,
              template.updated_at,
              template.use_count
            ]);
            
            successCount++;
          } catch (error) {
            console.error(`导入模板 ${template.id} 失败:`, error.message);
            errorCount++;
          }
        }
        
        // 提交事务
        await client.query('COMMIT');
        console.log(`批次 ${chunkIndex + 1} 处理完成，已提交事务`);
        
        // 报告进度
        console.log(`当前进度: ${successCount}/${templates.length} 成功, ${errorCount} 失败`);
      }
      
      // 结果报告
      console.log(`
      =========== 数据迁移完成 ===========
      总共尝试: ${templates.length} 个模板
      成功导入: ${successCount} 个模板
      导入失败: ${errorCount} 个模板
      ===================================
      `);
      
    } catch (error) {
      // 发生错误时回滚事务
      await client.query('ROLLBACK');
      console.error('迁移失败，事务已回滚:', error);
    } finally {
      // 释放客户端
      client.release();
      console.log('数据库连接已释放');
    }
  } catch (error) {
    console.error('迁移过程发生错误:', error);
  } finally {
    // 关闭连接池
    await pool.end();
    console.log('数据库连接池已关闭');
  }
}

// 执行迁移
migrateTemplates().catch(err => {
  console.error('迁移脚本执行失败:', err);
  process.exit(1);
}); 