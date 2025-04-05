-- 添加事务辅助函数
CREATE OR REPLACE FUNCTION begin_transaction()
RETURNS void AS $$
BEGIN
  -- 开始事务
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION commit_transaction()
RETURNS void AS $$
BEGIN
  -- 提交事务
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rollback_transaction()
RETURNS void AS $$
BEGIN
  -- 回滚事务
END;
$$ LANGUAGE plpgsql;

-- 授予函数权限
GRANT EXECUTE ON FUNCTION begin_transaction TO service_role;
GRANT EXECUTE ON FUNCTION commit_transaction TO service_role;
GRANT EXECUTE ON FUNCTION rollback_transaction TO service_role;

-- 创建新的更新用户点数函数，确保原子性和正确记录
CREATE OR REPLACE FUNCTION update_user_credits(
  user_id_param UUID, 
  credits_to_add INT, 
  order_no_param TEXT, 
  operation_type_param TEXT,
  note_param TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  current_credits INT;
  new_credits INT;
BEGIN
  -- 获取用户当前点数
  SELECT credits INTO current_credits
  FROM ai_images_creator_credits
  WHERE user_id = user_id_param
  FOR UPDATE; -- 添加行锁以避免并发更新
  
  -- 如果没有记录，创建一个新记录
  IF current_credits IS NULL THEN
    INSERT INTO ai_images_creator_credits (
      user_id,
      credits,
      created_at,
      updated_at,
      last_order_no
    ) VALUES (
      user_id_param,
      credits_to_add,
      NOW(),
      NOW(),
      order_no_param
    );
    
    current_credits := 0;
    new_credits := credits_to_add;
  ELSE
    -- 计算新的点数
    new_credits := current_credits + credits_to_add;
    
    -- 更新用户点数
    UPDATE ai_images_creator_credits
    SET 
      credits = new_credits,
      updated_at = NOW(),
      last_order_no = order_no_param
    WHERE user_id = user_id_param;
  END IF;
  
  -- 记录点数变更日志
  INSERT INTO ai_images_creator_credit_logs (
    user_id,
    order_no,
    operation_type,
    old_value,
    change_value,
    new_value,
    created_at,
    note
  ) VALUES (
    user_id_param,
    order_no_param,
    operation_type_param,
    current_credits,
    credits_to_add,
    new_credits,
    NOW(),
    note_param
  );
  
  RETURN TRUE;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error in update_user_credits: %', SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- 授予函数权限
REVOKE ALL ON FUNCTION update_user_credits FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_user_credits TO service_role; 