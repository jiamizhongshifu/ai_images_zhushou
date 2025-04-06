import { renderHook, act } from '@testing-library/react-hooks';
import useImageHistory from '../useImageHistory';
import { cacheService } from '@/utils/cache-service';

// 模拟fetch和其他依赖
global.fetch = jest.fn();
jest.mock('@/utils/cache-service');
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('useImageHistory Hook', () => {
  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();
    
    // 模拟cacheService
    (cacheService.getOrFetch as jest.Mock).mockImplementation(async (key, fetchFn) => {
      return await fetchFn();
    });
    
    (cacheService.delete as jest.Mock).mockImplementation(() => {});
    (cacheService.onRefresh as jest.Mock).mockImplementation(() => jest.fn());
    (cacheService.get as jest.Mock).mockImplementation(() => null);
  });
  
  it('should initialize with empty arrays', () => {
    const { result } = renderHook(() => useImageHistory());
    
    expect(result.current.images).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });
  
  it('should fetch image history on mount', async () => {
    // 模拟成功响应
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        history: [
          {
            id: '1',
            image_url: 'https://example.com/image1.jpg',
            prompt: 'test prompt',
            created_at: '2023-01-01T00:00:00Z'
          }
        ]
      })
    });
    
    const { result, waitForNextUpdate } = renderHook(() => useImageHistory());
    
    // 等待异步操作完成
    await waitForNextUpdate();
    
    // 验证结果
    expect(result.current.images.length).toBe(1);
    expect(result.current.images[0]).toBe('https://example.com/image1.jpg');
    expect(result.current.isLoading).toBe(false);
  });
  
  it('should handle image deletion', async () => {
    // 模拟成功响应
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          history: [
            {
              id: '1',
              image_url: 'https://example.com/image1.jpg',
              prompt: 'test prompt',
              created_at: '2023-01-01T00:00:00Z'
            },
            {
              id: '2',
              image_url: 'https://example.com/image2.jpg',
              prompt: 'test prompt 2',
              created_at: '2023-01-02T00:00:00Z'
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true
        })
      });
    
    const { result, waitForNextUpdate } = renderHook(() => useImageHistory());
    
    // 等待初始加载完成
    await waitForNextUpdate();
    
    // 验证初始状态
    expect(result.current.images.length).toBe(2);
    
    // 执行删除操作
    await act(async () => {
      await result.current.deleteImage('https://example.com/image1.jpg');
    });
    
    // 验证删除后的状态
    expect(result.current.images.length).toBe(1);
    expect(result.current.images[0]).toBe('https://example.com/image2.jpg');
    
    // 验证删除API被调用
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/history/delete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ imageUrl: 'https://example.com/image1.jpg' })
      })
    );
    
    // 验证缓存被删除
    expect(cacheService.delete).toHaveBeenCalled();
  });
  
  it('should handle error during fetch', async () => {
    // 模拟失败响应
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    
    const { result, waitForNextUpdate } = renderHook(() => useImageHistory());
    
    // 等待异步操作完成
    await waitForNextUpdate();
    
    // 验证错误处理
    expect(result.current.images).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    // 应该尝试从缓存获取
    expect(cacheService.get).toHaveBeenCalled();
  });
  
  it('should refetch history when requested', async () => {
    // 模拟两次成功响应
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          history: [{ id: '1', image_url: 'https://example.com/image1.jpg' }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          history: [
            { id: '1', image_url: 'https://example.com/image1.jpg' },
            { id: '2', image_url: 'https://example.com/image2.jpg' }
          ]
        })
      });
    
    const { result, waitForNextUpdate } = renderHook(() => useImageHistory());
    
    // 等待初始加载完成
    await waitForNextUpdate();
    
    // 验证初始状态
    expect(result.current.images.length).toBe(1);
    
    // 请求刷新
    act(() => {
      result.current.refetch(true);
    });
    
    // 等待刷新完成
    await waitForNextUpdate();
    
    // 验证刷新后的状态
    expect(result.current.images.length).toBe(2);
  });
}); 