-- 修复卡在processing状态的任务

-- 1. 查询卡在processing状态超过20分钟的任务
SELECT 
  task_id, 
  user_id, 
  created_at, 
  status 
FROM 
  ai_images_creator_tasks
WHERE 
  status = 'processing' 
  AND created_at < NOW() - INTERVAL '20 minutes';

-- 2. 将卡住的任务状态更新为失败
UPDATE ai_images_creator_tasks
SET 
  status = 'failed',
  error_message = '任务处理超时，已自动标记为失败',
  completed_at = NOW()
WHERE 
  status = 'processing' 
  AND created_at < NOW() - INTERVAL '20 minutes';

-- 3. 为每个卡住的任务退还用户的积分
-- 注意：这个部分需要在Supabase仪表板中手动操作，
-- 或者使用带有服务角色密钥的API调用来完成

/*
-- 以下是退还积分的SQL示例（请根据实际情况修改）
WITH stuck_tasks AS (
  SELECT user_id
  FROM ai_images_creator_tasks
  WHERE 
    status = 'failed'
    AND error_message = '任务处理超时，已自动标记为失败'
    AND refunded = false
)
UPDATE ai_images_creator_credits
SET credits = credits + 1
FROM stuck_tasks
WHERE ai_images_creator_credits.user_id = stuck_tasks.user_id;

-- 更新任务的退款状态
UPDATE ai_images_creator_tasks
SET refunded = true
WHERE 
  status = 'failed'
  AND error_message = '任务处理超时，已自动标记为失败'
  AND refunded = false;
*/ 