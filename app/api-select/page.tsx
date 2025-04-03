'use client';

import { useState } from 'react';

export default function ApiSelectPage() {
  const [prompt, setPrompt] = useState('');
  const [apiType, setApiType] = useState('tuzi'); // 'tuzi' 或 'openai'
  const [size, setSize] = useState('1024x1024');
  const [style, setStyle] = useState('vivid');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt) {
      setError('请输入提示词');
      return;
    }

    setLoading(true);
    setError(null);
    setImage(null);

    try {
      // 根据选择的API类型，调用不同的端点
      const endpoint = apiType === 'tuzi' 
        ? '/api/generate-image' 
        : '/api/generate-image-openai';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt,
          size,
          style
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '图片生成失败');
      }

      setImage(data.imageUrl);
    } catch (error: any) {
      setError(error.message || '请求失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">API选择测试工具</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="border rounded-lg p-6 shadow-sm">
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">选择API提供商</label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={apiType === 'tuzi'}
                    onChange={() => setApiType('tuzi')}
                    className="mr-2"
                  />
                  TUZI API
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={apiType === 'openai'}
                    onChange={() => setApiType('openai')}
                    className="mr-2"
                  />
                  OpenAI API
                </label>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">提示词</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="输入生成图片的提示词..."
                className="w-full border rounded-md p-2"
                rows={4}
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">图片尺寸</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full border rounded-md p-2"
              >
                <option value="256x256">256x256</option>
                <option value="512x512">512x512</option>
                <option value="1024x1024">1024x1024</option>
              </select>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium mb-1">风格</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full border rounded-md p-2"
              >
                <option value="vivid">生动 (Vivid)</option>
                <option value="natural">自然 (Natural)</option>
              </select>
            </div>
            
            <button
              type="submit"
              disabled={loading || !prompt}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-md disabled:opacity-50"
            >
              {loading ? '生成中...' : '生成图片'}
            </button>
            
            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md">
                {error}
              </div>
            )}
          </form>
        </div>
        
        <div className="border rounded-lg p-6 shadow-sm flex items-center justify-center">
          {loading ? (
            <div className="flex flex-col items-center">
              <div className="animate-spin h-10 w-10 border-4 border-blue-500 rounded-full border-t-transparent"></div>
              <p className="mt-2">正在生成图片，请稍候...</p>
            </div>
          ) : image ? (
            <div className="text-center">
              <img 
                src={image} 
                alt="生成的图片" 
                className="max-w-full max-h-[500px] rounded-md" 
              />
              <a 
                href={image} 
                target="_blank" 
                rel="noopener noreferrer"
                className="mt-2 text-blue-500 hover:underline inline-block"
              >
                查看原图
              </a>
            </div>
          ) : (
            <div className="text-center text-gray-500">
              <p>图片将在这里显示</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 