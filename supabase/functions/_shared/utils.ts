// supabase/functions/_shared/utils.ts
// Utility functions shared across edge functions

/**
 * Extracts the first likely image URL from a given string content.
 * Handles Markdown format, direct URLs, and tries to validate common image extensions or domains.
 *
 * @param content The string content possibly containing an image URL.
 * @returns The extracted image URL or null if not found or invalid.
 */
export function extractImageUrl(content: string): string | null {
  console.log("开始提取图片URL，原始内容:", content ? content.substring(0, 100) + '...' : '(空)');

  if (!content) return null; // Handle null or empty content

  // 1. Try Markdown format: ![alt text](url)
  const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (markdownMatch && markdownMatch[1]) {
    console.log("找到Markdown格式图片URL:", markdownMatch[1]);
    if (markdownMatch[1].includes("placehold.co")) {
        console.log("URL是占位图，不视为有效图片URL");
        return null;
    }
    return markdownMatch[1];
  }

  // 2. Try direct URL format with common image extensions
  // Allows for URLs possibly enclosed in quotes or spaces, looks for common extensions
  const directUrlMatch = content.match(/(https?:\/\/[^\"\'\s]+\.(?:jpe?g|png|gif|webp|bmp))/i);
  if (directUrlMatch && directUrlMatch[1]) {
    console.log("找到直接图片URL:", directUrlMatch[1]);
    if (directUrlMatch[1].includes("placehold.co")) {
      console.log("URL是占位图，不视为有效图片URL");
      return null;
    }
    return directUrlMatch[1];
  }

  // 3. Try any URL and validate if it looks like an image URL
  // This pattern is broad; refine if causing issues with non-image URLs
  const anyUrlMatch = content.match(/(https?:\/\/[^\s\"\'<>]+)/i);
   if (anyUrlMatch && anyUrlMatch[1]) {
    console.log("找到任意URL (将验证是否为图片):", anyUrlMatch[1]);

    // Basic check for common image extensions or known image hosting domains
    // Add more domains like cloudflare, aws, specific CDNs if needed
    const likelyImageUrl = /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(anyUrlMatch[1]) ||
                          /cloudinary\.com|unsplash\.com|imgix\.net|supabase\.co|filesystem\.site|picsum\.photos|img\.shields\.io/i.test(anyUrlMatch[1]); // Added more common domains

    if (likelyImageUrl && !anyUrlMatch[1].includes("placehold.co")) {
      console.log("URL 看起来像有效的图片 URL");
      return anyUrlMatch[1];
    } else {
       console.log("URL不是已知图片格式或域名，或为占位图");
    }
  }

  console.log("未找到任何可用的图片URL");
  return null;
}

/**
 * Handles various API error types and returns a structured error object.
 *
 * @param error The error object caught during the API call.
 * @returns An object containing the errorType and a user-friendly message.
 */
export function handleApiError(error: any): { errorType: string, message: string } {
   console.error("API错误详情:", error);

   // Check if it's an OpenAI structured error (common pattern)
   if (error?.error && typeof error.error === 'object') {
      const apiError = error.error;
      const status = error.status; // Status might be at the top level

      if (apiError.code === "insufficient_user_quota" || apiError.message?.includes("quota")) {
        return { errorType: "quota_exceeded", message: "API配额已用完" };
      }
      if (status === 401 || apiError.message?.includes("Incorrect API key")) {
        return { errorType: "invalid_token", message: "API密钥无效或不匹配" };
      }
      if (status === 429 || apiError.message?.includes("Rate limit")) {
         return { errorType: "rate_limit_exceeded", message: "API请求频率过高" };
      }
      // Add more specific Tuzi error checks here if their error structure is known
      // e.g., if (apiError.code === 'TUZI_SPECIFIC_ERROR') { ... }

      return { errorType: apiError.type || "api_error", message: apiError.message || "API调用失败" };
   }

   // Handle network errors (like Deno's fetch errors) or other exception types
   if (error instanceof Error) {
     if (error.message.includes('timeout')) {
         return { errorType: "timeout", message: "API请求超时" };
     }
     // Catch common network issues
     if (error.message.match(/network|connection|fetch failed|dns/i)) {
         return { errorType: "network_error", message: `网络错误: ${error.message}` };
     }
     return { errorType: "generic_error", message: `处理时发生错误: ${error.message}` };
   }

   // Fallback for unknown errors (e.g., non-Error objects thrown)
   try {
      return { errorType: "unknown_error", message: `发生未知错误: ${JSON.stringify(error)}` };
   } catch (e) {
      return { errorType: "unknown_error", message: "发生无法序列化的未知错误" };
   }
} 