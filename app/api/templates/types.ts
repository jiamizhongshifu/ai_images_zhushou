export interface Template {
  id: string;
  name: string;
  description: string;
  preview_image: string;
  style_id: string | null;
  requires_image: boolean;
  prompt_required: boolean;
  prompt_guide: string | null;
  prompt_placeholder: string | null;
  base_prompt: string;
  tags: string[];
  status: string;
  use_count: number;
  created_at: string;
  updated_at: string;
} 