-- 创建状态枚举类型
CREATE TYPE task_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- 创建图像任务表
CREATE TABLE image_tasks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  style TEXT,
  aspect_ratio TEXT,
  status task_status NOT NULL DEFAULT 'pending',
  image_url TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  provider TEXT NOT NULL,
  model TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  request_id TEXT
);

-- 创建索引
CREATE INDEX idx_image_tasks_user_id ON image_tasks(user_id);
CREATE INDEX idx_image_tasks_status ON image_tasks(status);
CREATE INDEX idx_image_tasks_created_at ON image_tasks(created_at);

-- 创建RLS策略
ALTER TABLE image_tasks ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的任务
CREATE POLICY "用户可查看自己的任务" 
  ON image_tasks FOR SELECT 
  USING (auth.uid() = user_id);

-- 用户只能创建自己的任务
CREATE POLICY "用户可创建自己的任务" 
  ON image_tasks FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- 用户只能更新自己的任务
CREATE POLICY "用户可更新自己的任务" 
  ON image_tasks FOR UPDATE
  USING (auth.uid() = user_id);