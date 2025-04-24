"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { 
  Loader2, Plus, Edit, Trash, Eye, Filter, Search, 
  ArrowUpDown, Check, X, Tag 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ImageWithFallback } from "@/components/ui/image-with-fallback";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "react-hot-toast";

// 模板类型
interface Template {
  id: string;
  name: string;
  description: string;
  preview_image: string;
  style_id: string | null;
  requires_image: boolean;
  prompt_required: boolean;
  tags: string[];
  status: string;
  created_at: string;
  updated_at: string;
  use_count: number;
}

export default function AdminTemplatesPage() {
  const router = useRouter();
  
  // 状态管理
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // 获取模板列表
  const fetchTemplates = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 构建查询参数
      const params = new URLSearchParams();
      params.append("sort", sortField);
      params.append("order", sortOrder);
      
      if (searchQuery) {
        params.append("search", searchQuery);
      }
      
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      } else {
        // 显式请求所有状态的模板
        params.append("status", "all");
      }
      
      // 添加随机时间戳，确保不使用缓存数据
      params.append("_t", Date.now().toString());

      // 发送请求
      console.log('正在获取模板列表，参数:', params.toString());
      const response = await fetch(`/api/templates?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error("获取模板列表失败");
      }

      const data = await response.json();
      
      if (data.success) {
        console.log('获取到模板列表:', data.data.length, '条数据');
        setTemplates(data.data || []);
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

  // 初始加载
  useEffect(() => {
    fetchTemplates();
  }, [searchQuery, statusFilter, sortField, sortOrder]);

  // 添加路由变化监听，确保从创建页面返回时刷新列表
  useEffect(() => {
    // 在组件挂载时和路由变化时获取数据
    const handleRouteChange = () => {
      console.log('路由变化，刷新模板列表');
      fetchTemplates();
    };

    // 监听路由变化
    window.addEventListener('popstate', handleRouteChange);
    
    // 初始化时强制刷新一次
    fetchTemplates();

    return () => {
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  // 处理排序
  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  // 处理状态更新
  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      setIsLoading(true);
      
      // 调用API更新模板状态
      const response = await fetch(`/api/templates/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `更新状态失败 (${response.status})`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(`已将模板"${data.data.name}"状态更新为${newStatus === "published" ? "已发布" : "草稿"}`);
      } else {
        throw new Error(data.error || "更新状态失败");
      }
      
      // 重新获取数据
      await fetchTemplates();
    } catch (err) {
      console.error("更新状态失败:", err);
      setError(err instanceof Error ? err.message : "更新状态失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 处理删除
  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除此模板吗？此操作不可撤销。")) {
      return;
    }
    
    try {
      setIsLoading(true);
      
      // 调用API删除模板
      const response = await fetch(`/api/templates/${id}`, {
        method: "DELETE"
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `删除模板失败 (${response.status})`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast.success("模板已成功删除");
      } else {
        throw new Error(data.error || "删除模板失败");
      }
      
      // 重新获取数据
      await fetchTemplates();
    } catch (err) {
      console.error("删除模板失败:", err);
      setError(err instanceof Error ? err.message : "删除模板失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 格式化日期
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">模板管理</h1>
        <Link 
          href="/admin/templates/new" 
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-[#ffffff] font-bold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all"
        >
          <Plus className="h-5 w-5 text-white" strokeWidth={2.5} />
          <span className="text-white text-base tracking-wide">新建模板</span>
        </Link>
      </div>

      {/* 筛选和搜索 */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索模板..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="筛选状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="draft">草稿</SelectItem>
              <SelectItem value="published">已发布</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* 表格 */}
      <div className="w-full overflow-auto rounded-lg border">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="p-3 text-xs font-medium text-muted-foreground">预览</th>
              <th 
                className="p-3 text-xs font-medium text-muted-foreground cursor-pointer"
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center">
                  名称
                  {sortField === "name" && (
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  )}
                </div>
              </th>
              <th className="p-3 text-xs font-medium text-muted-foreground">标签</th>
              <th 
                className="p-3 text-xs font-medium text-muted-foreground cursor-pointer"
                onClick={() => handleSort("created_at")}
              >
                <div className="flex items-center">
                  创建时间
                  {sortField === "created_at" && (
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  )}
                </div>
              </th>
              <th 
                className="p-3 text-xs font-medium text-muted-foreground cursor-pointer"
                onClick={() => handleSort("use_count")}
              >
                <div className="flex items-center">
                  使用次数
                  {sortField === "use_count" && (
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  )}
                </div>
              </th>
              <th className="p-3 text-xs font-medium text-muted-foreground">状态</th>
              <th className="p-3 text-xs font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                </td>
              </tr>
            ) : templates.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  暂无模板数据
                </td>
              </tr>
            ) : (
              templates.map((template) => (
                <tr key={template.id} className="border-b">
                  <td className="p-3">
                    <div className="relative w-16 h-16 rounded-md overflow-hidden">
                      <ImageWithFallback
                        src={template.preview_image}
                        alt={template.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{template.name}</div>
                    <div className="text-sm text-muted-foreground line-clamp-1">
                      {template.description}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {template.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {template.tags.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{template.tags.length - 2}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-sm">
                    {formatDate(template.created_at)}
                  </td>
                  <td className="p-3">{template.use_count}</td>
                  <td className="p-3">
                    <Badge
                      variant={template.status === "published" ? "default" : "outline"}
                    >
                      {template.status === "published" ? "已发布" : "草稿"}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        className="h-8 w-8"
                      >
                        <Link href={`/creative-plaza/template/${template.id}`}>
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">查看</span>
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        className="h-8 w-8"
                      >
                        <Link href={`/admin/templates/${template.id}`}>
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">编辑</span>
                        </Link>
                      </Button>
                      {template.status === "published" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusChange(template.id, "draft")}
                          className="h-8 w-8 text-amber-500"
                        >
                          <X className="h-4 w-4" />
                          <span className="sr-only">下架</span>
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusChange(template.id, "published")}
                          className="h-8 w-8 text-green-500"
                        >
                          <Check className="h-4 w-4" />
                          <span className="sr-only">发布</span>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(template.id)}
                        className="h-8 w-8 text-destructive"
                      >
                        <Trash className="h-4 w-4" />
                        <span className="sr-only">删除</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
} 