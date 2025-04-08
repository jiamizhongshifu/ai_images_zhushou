import { Button } from "./ui/button";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function HeaderAuth() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setIsAuthenticated(!!data.session);
        setUserEmail(data.session?.user?.email || null);
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (isLoading) {
    return <Button variant="outline">加载中...</Button>;
  }

  return isAuthenticated ? (
    <div className="flex items-center gap-4">
      Hey, {userEmail}!
      <Button variant="outline" onClick={signOut}>
        登出
      </Button>
    </div>
  ) : (
    <Button
      onClick={() => router.push("/login")}
    >
      登录
    </Button>
  );
}
