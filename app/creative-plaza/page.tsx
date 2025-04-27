"use client";

import React, { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { TemplateGrid } from "@/components/creative-plaza/template-grid";
import { TemplateFilters } from "@/components/creative-plaza/template-filters";
import { Pagination } from "@/components/creative-plaza/pagination";

// 模板数据类型
interface Template {
  id: string;
  name: string;
  description: string;
  preview_image: string;
  tags: string[];
  use_count: number;
  requires_image: boolean;
}

// 分页数据类型
interface PaginationData {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export default function CreativePlazaPage() {
  // 状态管理
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState("created_at:desc");
  const [pagination, setPagination] = useState<PaginationData>({
    total: 0,
    page: 1,
    limit: 12,
    pages: 0,
  });
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // 获取所有标签
  const fetchTags = async () => {
    try {
      const response = await fetch('/api/templates?tags=true');
      
      if (!response.ok) {
        throw new Error('获取标签列表失败');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setAvailableTags(data.data);
      } else {
        throw new Error(data.error || '获取标签列表失败');
      }
    } catch (err) {
      console.error('获取标签列表错误:', err);
      // 不显示错误给用户，使用空数组作为后备
      setAvailableTags([]);
    }
  };

  // 初始加载时获取标签
  useEffect(() => {
    fetchTags();
  }, []);

  // 获取模板列表
  const fetchTemplates = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 构建查询参数
      const params = new URLSearchParams();
      params.append("page", pagination.page.toString());
      params.append("limit", pagination.limit.toString());
      
      // 解析排序选项
      const [sortField, sortOrder] = sortOption.split(":");
      params.append("sort", sortField);
      params.append("order", sortOrder);
      
      // 添加搜索和标签筛选
      if (searchQuery) {
        params.append("search", searchQuery);
      }
      
      if (selectedTag) {
        params.append("tag", selectedTag);
      }

      // 发送请求
      const response = await fetch(`/api/templates?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error("获取模板列表失败");
      }

      const data = await response.json();
      
      if (data.success) {
        setTemplates(data.data);
        setPagination(data.pagination);
      } else {
        throw new Error(data.error || "获取模板列表失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取模板列表失败");
      console.error("获取模板列表错误:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // 初始加载和参数变化时获取数据
  useEffect(() => {
    fetchTemplates();
  }, [pagination.page, sortOption, selectedTag, searchQuery]);

  // 处理页面变化
  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, page }));
    // 滚动到页面顶部
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 处理搜索变化（防抖）
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    // 重置到第一页
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // 处理标签选择
  const handleTagSelect = (tag: string | null) => {
    setSelectedTag(tag);
    // 重置到第一页
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // 处理排序变化
  const handleSortChange = (option: string) => {
    setSortOption(option);
    // 重置到第一页
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 页面标题 */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-bold mb-3 flex items-center justify-center gap-2">
          <Sparkles className="h-8 w-8 text-primary" />
          创意广场
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          探索精选图片生成模板，从人像美化到场景创作，一键生成各种风格的AI艺术作品
        </p>
      </div>

      {/* 筛选和排序 */}
      <TemplateFilters
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        selectedTag={selectedTag}
        onTagSelect={handleTagSelect}
        sortOption={sortOption}
        onSortChange={handleSortChange}
        availableTags={availableTags}
      />

      {/* 错误提示 */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* 模板列表 */}
      <TemplateGrid templates={templates} isLoading={isLoading} />

      {/* 分页 */}
      {!isLoading && templates.length > 0 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.pages}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
} 