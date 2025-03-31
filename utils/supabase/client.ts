import { createBrowserClient } from "@supabase/ssr";

export const createClient = () =>
  createBrowserClient(
    "https://wcjctczyzibrswwngmvd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjamN0Y3p5emlicnN3d25nbXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0MjAyMDcsImV4cCI6MjA1ODk5NjIwN30.vgCpbBqyHWV6ONAMDwOQ5kF6wn75p2txsYbMfLRJGAk",
  );
