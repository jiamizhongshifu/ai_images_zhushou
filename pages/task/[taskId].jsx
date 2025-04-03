import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Container, Heading, Text, Spinner, Image, Button, VStack, HStack, Badge, Divider, useToast } from '@chakra-ui/react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import TaskProgressBar from '../../components/TaskProgressBar';

export default function TaskDetails() {
  const router = useRouter();
  const { taskId } = router.query;
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const supabase = createClientComponentClient();
  const toast = useToast();

  useEffect(() => {
    // 当taskId可用时，获取任务详情
    if (taskId) {
      fetchTaskDetails();
    }
  }, [taskId]);

  // 获取任务详情
  const fetchTaskDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 从API获取详细信息
      const response = await fetch(`/api/task-status?taskId=${taskId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '获取任务详情失败');
      }
      
      if (data.success && data.task) {
        setTask(data.task);
      } else {
        throw new Error('获取任务详情失败');
      }
    } catch (err) {
      console.error('获取任务失败:', err);
      setError(err.message);
      toast({
        title: '获取任务失败',
        description: err.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // 取消任务
  const cancelTask = async () => {
    if (!taskId) return;
    
    try {
      const response = await fetch('/api/cancel-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: '任务已取消',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
        
        // 刷新任务详情
        fetchTaskDetails();
      } else {
        throw new Error(data.error || '取消任务失败');
      }
    } catch (err) {
      toast({
        title: '取消任务失败',
        description: err.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  // 获取任务状态标签样式
  const getStatusBadgeProps = (status) => {
    const statusMap = {
      'pending': { colorScheme: 'blue', label: '等待处理' },
      'processing': { colorScheme: 'yellow', label: '处理中' },
      'completed': { colorScheme: 'green', label: '已完成' },
      'failed': { colorScheme: 'red', label: '失败' },
      'cancelled': { colorScheme: 'gray', label: '已取消' },
    };
    
    return statusMap[status] || { colorScheme: 'gray', label: '未知状态' };
  };

  // 页面加载中
  if (loading && !task) {
    return (
      <Container maxW="container.md" py={10}>
        <VStack spacing={4} align="center">
          <Spinner size="xl" color="blue.500" thickness="4px" />
          <Text>加载任务信息...</Text>
        </VStack>
      </Container>
    );
  }

  // 发生错误
  if (error && !task) {
    return (
      <Container maxW="container.md" py={10}>
        <VStack spacing={4} align="center">
          <Heading color="red.500" size="md">加载任务失败</Heading>
          <Text>{error}</Text>
          <Button onClick={fetchTaskDetails} colorScheme="blue">重试</Button>
        </VStack>
      </Container>
    );
  }

  // 任务不存在
  if (!task) {
    return (
      <Container maxW="container.md" py={10}>
        <VStack spacing={4} align="center">
          <Heading size="md">任务不存在或已被删除</Heading>
          <Button onClick={() => router.push('/dashboard')} colorScheme="blue">返回控制台</Button>
        </VStack>
      </Container>
    );
  }

  // 任务详情页面
  const { status, prompt, style, result_url, error_message, created_at, completed_at } = task;
  const statusBadge = getStatusBadgeProps(status);

  return (
    <Container maxW="container.md" py={8}>
      <VStack spacing={6} align="stretch">
        <HStack justifyContent="space-between" alignItems="center">
          <Heading size="lg">任务详情</Heading>
          <Badge colorScheme={statusBadge.colorScheme} fontSize="md" px={3} py={1} borderRadius="md">
            {statusBadge.label}
          </Badge>
        </HStack>
        
        <Box>
          <Text fontSize="sm" color="gray.500">任务ID</Text>
          <Text fontFamily="mono" fontSize="sm">{taskId}</Text>
        </Box>
        
        <Divider />
        
        {/* 进度条显示 - 对于进行中的任务 */}
        {(status === 'pending' || status === 'processing') && (
          <Box>
            <TaskProgressBar taskId={taskId} />
          </Box>
        )}
        
        {/* 任务内容 */}
        <Box>
          <Text fontSize="sm" color="gray.500">提示词</Text>
          <Text>{prompt}</Text>
        </Box>
        
        {style && (
          <Box>
            <Text fontSize="sm" color="gray.500">风格</Text>
            <Text>{style}</Text>
          </Box>
        )}
        
        <HStack justifyContent="space-between">
          <Box>
            <Text fontSize="sm" color="gray.500">创建时间</Text>
            <Text>{new Date(created_at).toLocaleString()}</Text>
          </Box>
          
          {completed_at && (
            <Box>
              <Text fontSize="sm" color="gray.500">完成时间</Text>
              <Text>{new Date(completed_at).toLocaleString()}</Text>
            </Box>
          )}
        </HStack>
        
        {/* 显示处理时间（如果有） */}
        {task.processing_duration_ms && (
          <Box>
            <Text fontSize="sm" color="gray.500">处理时间</Text>
            <Text>{(task.processing_duration_ms / 1000).toFixed(2)}秒</Text>
          </Box>
        )}
        
        {/* 显示错误信息（如果有） */}
        {error_message && (
          <Box bg="red.50" p={4} borderRadius="md">
            <Text fontSize="sm" color="red.500" fontWeight="bold">错误信息</Text>
            <Text>{error_message}</Text>
          </Box>
        )}
        
        {/* 显示结果图片（如果有） */}
        {result_url && (
          <Box>
            <Text fontSize="sm" color="gray.500" mb={2}>生成结果</Text>
            <Image 
              src={result_url} 
              alt="生成的图像" 
              borderRadius="md" 
              fallback={<Spinner />} 
              maxH="500px"
              objectFit="contain"
            />
          </Box>
        )}
        
        {/* 操作按钮 */}
        <HStack spacing={4} justify="flex-end">
          <Button onClick={() => router.push('/dashboard')} variant="outline">
            返回控制台
          </Button>
          
          {(status === 'pending' || status === 'processing') && (
            <Button onClick={cancelTask} colorScheme="red" variant="outline">
              取消任务
            </Button>
          )}
          
          {status === 'completed' && result_url && (
            <Button as="a" href={result_url} target="_blank" colorScheme="blue">
              查看原始图片
            </Button>
          )}
        </HStack>
      </VStack>
    </Container>
  );
} 