-- Create locks table for handling concurrent operations
create table if not exists ai_images_creator_locks (
    id uuid default uuid_generate_v4() primary key,
    key text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    expires_at timestamp with time zone not null,
    
    -- Add unique constraint on key to prevent duplicate locks
    constraint unique_lock_key unique (key)
);

-- Add index for faster lookups
create index if not exists idx_locks_key on ai_images_creator_locks(key);

-- Add index for cleanup of expired locks
create index if not exists idx_locks_expires_at on ai_images_creator_locks(expires_at);

-- Function to cleanup expired locks
create or replace function cleanup_expired_locks()
returns void
language plpgsql
as $$
begin
    delete from ai_images_creator_locks
    where expires_at < now();
end;
$$;

-- Create a scheduled job to cleanup expired locks every minute
select cron.schedule(
    'cleanup-expired-locks',  -- job name
    '* * * * *',             -- every minute
    'select cleanup_expired_locks()'
); 