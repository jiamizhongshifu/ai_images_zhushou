#!/usr/bin/env node
/**
 * 初始化Supabase存储桶的脚本
 * 用于创建和配置项目所需的存储桶
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 创建Supabase管理员客户端
function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('缺少必要的Supabase配置环境变量');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// 需要创建的存储桶
const REQUIRED_BUCKETS = [
  {
    name: 'images',
    isPublic: true,
    description: '用于存储生成的图片'
  },
  {
    name: 'temp',
    isPublic: true,
    description: '用于存储临时图片'
  },
  {
    name: 'uploads',
    isPublic: false,
    description: '用于存储用户上传的原始图片'
  }
];

// 主函数
async function main() {
  try {
    console.log('开始初始化Supabase存储桶...');
    
    const supabase = createAdminClient();
    
    // 获取现有存储桶列表
    const { data: existingBuckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      throw new Error(`获取存储桶列表失败: ${bucketsError.message}`);
    }
    
    console.log(`现有存储桶: ${existingBuckets.map(b => b.name).join(', ') || '无'}`);
    
    // 创建所需的存储桶
    for (const bucket of REQUIRED_BUCKETS) {
      const bucketExists = existingBuckets.some(b => b.name === bucket.name);
      
      if (bucketExists) {
        console.log(`存储桶 ${bucket.name} 已存在`);
        
        // 更新存储桶权限
        const { error: updateError } = await supabase.storage.updateBucket(
          bucket.name,
          { public: bucket.isPublic }
        );
        
        if (updateError) {
          console.warn(`更新存储桶 ${bucket.name} 权限失败: ${updateError.message}`);
        } else {
          console.log(`已更新存储桶 ${bucket.name} 的公共访问权限为: ${bucket.isPublic ? '公开' : '私有'}`);
        }
      } else {
        // 创建新存储桶
        const { error: createError } = await supabase.storage.createBucket(
          bucket.name,
          {
            public: bucket.isPublic,
            fileSizeLimit: 10485760, // 10MB 限制
          }
        );
        
        if (createError) {
          console.error(`创建存储桶 ${bucket.name} 失败: ${createError.message}`);
        } else {
          console.log(`成功创建存储桶 ${bucket.name} (${bucket.isPublic ? '公开' : '私有'})`);
        }
      }
    }
    
    console.log('存储桶初始化完成');
  } catch (error) {
    console.error('初始化存储桶失败:', error.message);
    process.exit(1);
  }
}

// 执行主函数
main(); 