-- 添加支付处理日志表，用于跟踪支付处理流程
CREATE TABLE IF NOT EXISTS ai_images_creator_payment_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_no TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  process_type TEXT NOT NULL, -- 'webhook', 'manual_check', 等
  amount DECIMAL(10, 2) NOT NULL,
  credits INTEGER NOT NULL,
  status TEXT NOT NULL, -- 'processing', 'success', 'failed'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 添加点数变更日志表，用于跟踪用户点数的每次变更
CREATE TABLE IF NOT EXISTS ai_images_creator_credit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_no TEXT, -- 可以为空，因为不是所有点数变更都与订单相关
  operation_type TEXT NOT NULL, -- 'recharge', 'consume', 'refund', 等
  old_value INTEGER NOT NULL,
  change_value INTEGER NOT NULL,
  new_value INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  note TEXT
);

-- 添加索引以加速查询
CREATE INDEX IF NOT EXISTS idx_payment_logs_order_no ON ai_images_creator_payment_logs(order_no);
CREATE INDEX IF NOT EXISTS idx_payment_logs_user_id ON ai_images_creator_payment_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_logs_user_id ON ai_images_creator_credit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_logs_order_no ON ai_images_creator_credit_logs(order_no);

-- 修改支付表，添加处理ID字段
ALTER TABLE ai_images_creator_payments 
ADD COLUMN IF NOT EXISTS process_id TEXT,
ADD COLUMN IF NOT EXISTS manual_processed BOOLEAN DEFAULT false;

-- 修改点数表，添加最后处理订单号字段
ALTER TABLE ai_images_creator_credits
ADD COLUMN IF NOT EXISTS last_order_no TEXT; 