import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const createClient = async () => {
  const cookieStore = await cookies();

  // 直接使用硬编码的URL和ANON KEY，而非环境变量
  const supabaseUrl = "https://wcjctczyzibrswwngmvd.supabase.co";
  const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjamN0Y3p5emlicnN3d25nbXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0MjAyMDcsImV4cCI6MjA1ODk5NjIwN30.vgCpbBqyHWV6ONAMDwOQ5kF6wn75p2txsYbMfLRJGAk";

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
};
