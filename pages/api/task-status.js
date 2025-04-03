import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  // 获取任务ID
  const { taskId } = req.query;
  
  if (!taskId) {
    return res.status(400).json({
      success: false,
      error: '缺少任务ID'
    });
  }

  // 创建Supabase客户端
  const supabase = createServerSupabaseClient({ req, res });
  
  // 获取当前用户
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    return res.status(401).json({
      success: false,
      error: '未授权访问'
    });
  }
  
  try {
    // 获取任务状态，包含详细进度信息
    const { data: task, error } = await supabase
      .from('ai_images_creator_tasks')
      .select(`
        task_id,
        user_id,
        status,
        prompt,
        style,
        result_url,
        error_message,
        created_at,
        updated_at,
        completed_at,
        progress_percentage,
        current_stage,
        stage_details,
        processing_started_at,
        processing_ended_at,
        processing_duration_ms,
        api_request_sent_at,
        api_response_received_at
      `)
      .eq('task_id', taskId)
      .single();
    
    if (error) {
      return res.status(500).json({
        success: false,
        error: `获取任务状态失败: ${error.message}`
      });
    }
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: '任务不存在'
      });
    }
    
    // 验证任务所有权（仅允许查看自己的任务）
    if (task.user_id !== session.user.id) {
      return res.status(403).json({
        success: false,
        error: '无权访问此任务'
      });
    }
    
    // 计算额外字段
    const additionalInfo = {};
    
    // 如果任务处于进行中状态，计算已进行时间
    if (task.status === 'processing' && task.processing_started_at) {
      const startTime = new Date(task.processing_started_at);
      const now = new Date();
      const elapsedSeconds = Math.floor((now - startTime) / 1000);
      additionalInfo.elapsed_seconds = elapsedSeconds;
      additionalInfo.elapsed_formatted = formatElapsedTime(elapsedSeconds);
    }
    
    // 如果任务已完成，计算总处理时间
    if ((task.status === 'completed' || task.status === 'failed') && 
        task.processing_started_at && task.processing_ended_at) {
      const startTime = new Date(task.processing_started_at);
      const endTime = new Date(task.processing_ended_at);
      const totalSeconds = Math.floor((endTime - startTime) / 1000);
      additionalInfo.total_seconds = totalSeconds;
      additionalInfo.total_time_formatted = formatElapsedTime(totalSeconds);
    }
    
    // 返回任务状态和额外信息
    return res.status(200).json({
      success: true,
      task: {
        ...task,
        ...additionalInfo
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `获取任务状态时出错: ${err.message}`
    });
  }
}

// 格式化时间
function formatElapsedTime(seconds) {
  if (seconds < 60) {
    return `${seconds}秒`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const remainingMinutes = Math.floor((seconds % 3600) / 60);
    return `${hours}小时${remainingMinutes}分钟`;
  }
} 