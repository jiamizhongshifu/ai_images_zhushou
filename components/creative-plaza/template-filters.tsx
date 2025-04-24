import React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface TemplateFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedTag: string | null;
  onTagSelect: (tag: string | null) => void;
  sortOption: string;
  onSortChange: (option: string) => void;
  availableTags: string[];
}

export function TemplateFilters({
  searchQuery,
  onSearchChange,
  selectedTag,
  onTagSelect,
  sortOption,
  onSortChange,
  availableTags
}: TemplateFiltersProps) {
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
  };

  return (
    <div className="mb-8 space-y-4">
      {/* 搜索栏 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索模板..."
          className="pl-10"
          value={searchQuery}
          onChange={handleSearchChange}
        />
      </div>
      
      {/* 筛选和排序 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">标签：</span>
          
          <Badge
            variant={selectedTag === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => onTagSelect(null)}
          >
            全部
          </Badge>
          
          {availableTags.map(tag => (
            <Badge
              key={tag}
              variant={selectedTag === tag ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => onTagSelect(tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">排序：</span>
          <Select value={sortOption} onValueChange={onSortChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="排序方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at:desc">最新上架</SelectItem>
              <SelectItem value="use_count:desc">最多使用</SelectItem>
              <SelectItem value="name:asc">名称 A-Z</SelectItem>
              <SelectItem value="name:desc">名称 Z-A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
} 