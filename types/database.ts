export interface ImageTask {
  id: string;
  user_id: string;
  prompt: string;
  style?: string | null;
  aspect_ratio?: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  image_url?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  provider: string;
  model?: string | null;
  attempt_count?: number;
  request_id?: string | null;
  progress?: number | null;
  stage?: string | null;
  lock_version: number;
}

export interface ImageTasksTable {
  Insert: ImageTask;
  Update: Partial<ImageTask>;
  Row: ImageTask;
}

export interface Database {
  public: {
    Tables: {
      image_tasks: ImageTasksTable;
      // 其他表...
    };
  };
} 