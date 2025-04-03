import { Server } from 'socket.io';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

// 创建Supabase客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 创建PostgreSQL连接池，用于监听数据库通知
let pool;
try {
  const connectionString = `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@${process.env.SUPABASE_DB_HOST}:5432/postgres`;
  pool = new Pool({ connectionString });
} catch (error) {
  console.error('创建PostgreSQL连接池失败:', error);
}

// 保存socket实例
let ioInstance;

// 客户端-任务订阅映射
const clientTaskMap = new Map();

const ioHandler = async (req, res) => {
  // 检查是否已创建socket.io实例
  if (!res.socket.server.io) {
    console.log('初始化Socket.IO服务器...');
    const io = new Server(res.socket.server);
    
    // 处理客户端连接
    io.on('connection', socket => {
      console.log('客户端连接:', socket.id);
      
      // 客户端订阅任务进度
      socket.on('subscribe', async taskId => {
        console.log(`客户端 ${socket.id} 订阅任务 ${taskId} 的进度更新`);
        
        // 记录客户端订阅的任务
        clientTaskMap.set(socket.id, taskId);
        
        // 获取当前任务状态并发送
        try {
          const { data: task } = await supabase
            .from('ai_images_creator_tasks')
            .select('current_stage, progress_percentage, stage_details')
            .eq('task_id', taskId)
            .single();
            
          if (task) {
            socket.emit('progress', {
              taskId,
              stage: task.current_stage || 'queued',
              percentage: task.progress_percentage || 0,
              details: task.stage_details || {}
            });
          }
        } catch (error) {
          console.error('获取任务状态失败:', error);
        }
        
        // 订阅任务特定房间
        socket.join(`task:${taskId}`);
      });
      
      // 客户端取消订阅
      socket.on('unsubscribe', taskId => {
        console.log(`客户端 ${socket.id} 取消订阅任务 ${taskId}`);
        socket.leave(`task:${taskId}`);
        clientTaskMap.delete(socket.id);
      });
      
      // 断开连接清理
      socket.on('disconnect', () => {
        console.log('客户端断开连接:', socket.id);
        clientTaskMap.delete(socket.id);
      });
    });
    
    // 保存io实例
    res.socket.server.io = io;
    ioInstance = io;
    
    // 如果配置了PostgreSQL连接池，开始监听数据库通知
    if (pool) {
      try {
        console.log('开始监听PostgreSQL任务进度通知...');
        const client = await pool.connect();
        
        // 设置监听任务进度通知
        await client.query('LISTEN task_progress');
        
        // 处理通知
        client.on('notification', msg => {
          try {
            const payload = JSON.parse(msg.payload);
            console.log('收到任务进度通知:', payload.task_id);
            
            // 向订阅该任务的客户端广播进度更新
            ioInstance.to(`task:${payload.task_id}`).emit('progress', {
              taskId: payload.task_id,
              stage: payload.stage,
              percentage: payload.percentage,
              details: payload.details
            });
          } catch (error) {
            console.error('处理通知失败:', error);
          }
        });
        
        // 清理函数
        res.socket.server.pgClient = client;
        res.socket.server.pgCleanup = () => {
          client.query('UNLISTEN task_progress');
          client.release();
        };
        
      } catch (error) {
        console.error('设置PostgreSQL监听失败:', error);
      }
    } else {
      console.log('未配置PostgreSQL连接，将使用轮询方式获取进度');
      
      // 备用方案：定时轮询任务状态
      res.socket.server.progressInterval = setInterval(async () => {
        // 获取所有活动任务
        try {
          const { data: activeTasks } = await supabase
            .from('ai_images_creator_tasks')
            .select('task_id, current_stage, progress_percentage, stage_details')
            .in('status', ['pending', 'processing'])
            .order('updated_at', { ascending: false })
            .limit(10);
          
          if (activeTasks && activeTasks.length > 0) {
            // 为每个活动任务发送进度更新
            activeTasks.forEach(task => {
              ioInstance.to(`task:${task.task_id}`).emit('progress', {
                taskId: task.task_id,
                stage: task.current_stage || 'queued',
                percentage: task.progress_percentage || 0,
                details: task.stage_details || {}
              });
            });
          }
        } catch (error) {
          console.error('轮询任务状态失败:', error);
        }
      }, 2000); // 每2秒轮询一次
    }
  }
  
  res.end();
};

// 清理资源
export const cleanup = () => {
  if (ioInstance) {
    ioInstance.close();
  }
  
  if (pool) {
    pool.end();
  }
};

export default ioHandler; 