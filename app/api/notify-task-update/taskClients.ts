// 定义任务客户端的类型
export type TaskClient = {
  enqueue: (chunk: Uint8Array) => void;
  close: () => void;
};

// 全局存储更新任务信息的客户端
export const taskClients = new Map<string, Set<TaskClient>>();

// 注册一个新的客户端
export function registerClient(taskId: string, controller: TaskClient): void {
  if (!taskClients.has(taskId)) {
    taskClients.set(taskId, new Set());
  }
  taskClients.get(taskId)!.add(controller);
  console.log(`[TaskClients] 注册了新的客户端，任务: ${taskId}, 当前客户端数: ${taskClients.get(taskId)!.size}`);
}

// 移除一个客户端
export function removeClient(taskId: string, controller: TaskClient): void {
  if (taskClients.has(taskId)) {
    taskClients.get(taskId)!.delete(controller);
    console.log(`[TaskClients] 移除了客户端，任务: ${taskId}, 剩余客户端数: ${taskClients.get(taskId)!.size}`);
    
    // 如果没有更多客户端，移除整个任务
    if (taskClients.get(taskId)!.size === 0) {
      taskClients.delete(taskId);
      console.log(`[TaskClients] 移除了任务: ${taskId}`);
    }
  }
}

// 获取任务的客户端数量
export function getClientCount(taskId: string): number {
  if (!taskClients.has(taskId)) {
    return 0;
  }
  return taskClients.get(taskId)!.size;
}

// 向任务的所有客户端发送通知
export function notifyClients(taskId: string, data: any): void {
  if (!taskClients.has(taskId)) {
    console.log(`[TaskClients] 尝试通知任务 ${taskId} 的客户端，但没有找到监听的客户端`);
    return;
  }
  
  const clients = taskClients.get(taskId)!;
  const message = `data: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  const encodedMessage = encoder.encode(message);
  
  console.log(`[TaskClients] 正在向任务 ${taskId} 的 ${clients.size} 个客户端发送通知`);
  
  Array.from(clients).forEach(client => {
    try {
      client.enqueue(encodedMessage);
    } catch (error) {
      console.error(`[TaskClients] 向客户端发送通知失败:`, error);
      removeClient(taskId, client);
    }
  });
} 