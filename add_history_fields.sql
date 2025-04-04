-- 为ai_images_creator_history表添加style、aspect_ratio和standard_aspect_ratio字段

-- 检查字段是否存在，不存在则添加
DO $$
BEGIN
    -- 检查style字段
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'ai_images_creator_history'
        AND column_name = 'style'
    ) THEN
        ALTER TABLE ai_images_creator_history ADD COLUMN style TEXT;
        RAISE NOTICE 'Added style column';
    ELSE 
        RAISE NOTICE 'style column already exists';
    END IF;
    
    -- 检查aspect_ratio字段
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'ai_images_creator_history'
        AND column_name = 'aspect_ratio'
    ) THEN
        ALTER TABLE ai_images_creator_history ADD COLUMN aspect_ratio TEXT;
        RAISE NOTICE 'Added aspect_ratio column';
    ELSE 
        RAISE NOTICE 'aspect_ratio column already exists';
    END IF;
    
    -- 检查standard_aspect_ratio字段
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'ai_images_creator_history'
        AND column_name = 'standard_aspect_ratio'
    ) THEN
        ALTER TABLE ai_images_creator_history ADD COLUMN standard_aspect_ratio TEXT;
        RAISE NOTICE 'Added standard_aspect_ratio column';
    ELSE 
        RAISE NOTICE 'standard_aspect_ratio column already exists';
    END IF;
END $$; 