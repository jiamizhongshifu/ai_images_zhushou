import { NextResponse } from 'next/server';
import { withApiAuth } from '@/app/api/auth-middleware';

// 为临时用户提供的默认任务数据
const getDefaultTaskData = (taskId: string) => {
  // 基于任务ID生成确定性的状态 - 示例目的
  const hash = taskId.split('').reduce((a, b) => {
    return a + b.charCodeAt(0);
  }, 0);
  
  const states = ['pending', 'processing', 'completed'];
  const stateIndex = hash % 3;
  const state = states[stateIndex];
  
  const resultUrls = [
    'https://images.unsplash.com/photo-1579546929518-9e396f3cc809',
    'https://images.unsplash.com/photo-1557682250-33bd709cbe85',
    'https://images.unsplash.com/photo-1584824486509-112e4181ff6b'
  ];
  
  return {
    taskId: taskId,
    status: state,
    created_at: new Date().toISOString(),
    result_url: state === 'completed' ? resultUrls[hash % resultUrls.length] : undefined,
    error: state === 'error' ? '处理图像时出错' : undefined
  };
};

export const GET = async (req: Request) => {
  return withApiAuth(req, async (user, supabase) => {
    try {
      // 获取任务ID
      const url = new URL(req.url);
      const taskId = url.searchParams.get('taskId');
      
      if (!taskId) {
        return NextResponse.json({
          success: false,
          error: '缺少任务ID'
        }, { status: 400 });
      }
      
      // 检查是否为临时授权用户
      const isTemporaryUser = user.id.startsWith('temp-user-') || 
                            user.app_metadata?.temp_auth === true ||
                            user.user_metadata?.temp_auth === true;
      
      // 对于临时用户，返回模拟的任务数据
      if (isTemporaryUser) {
        console.log('[任务API] 检测到临时用户，返回模拟任务数据:', taskId);
        return NextResponse.json({
          success: true,
          task: getDefaultTaskData(taskId)
        });
      }
      
      // 正常流程：从数据库查询任务状态
      const { data, error } = await supabase
        .from('user_image_tasks')
        .select('*')
        .eq('task_id', taskId)
        .single();
      
      if (error) {
        console.error('[任务API] 查询任务状态错误:', error);
        return NextResponse.json({ 
          success: false, 
          error: '获取任务状态失败' 
        }, { status: 500 });
      }
      
      // 返回任务状态
      return NextResponse.json({
        success: true,
        task: {
          taskId: data.task_id,
          status: data.status,
          created_at: data.created_at,
          result_url: data.result_url,
          error: data.error
        }
      });
    } catch (error: any) {
      console.error('[任务API] 处理任务状态请求出错:', error);
      return NextResponse.json({ 
        success: false, 
        error: error.message || '服务器内部错误' 
      }, { status: 500 });
    }
  });
}; 