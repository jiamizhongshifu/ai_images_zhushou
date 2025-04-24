import { NextRequest, NextResponse } from "next/server";

// 这是一个模拟的文件上传API
export async function POST(request: NextRequest) {
  try {
    // 在实际应用中，应该解析FormData并处理文件上传
    // 例如：上传到OSS、CDN等
    
    // 模拟处理文件上传
    // 为了演示，我们直接返回一个模拟URL
    const mockImageUrl = `/images/uploads/image-${Date.now()}.jpg`;
    
    // 延迟200ms模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return NextResponse.json({
      success: true,
      url: mockImageUrl,
      message: "文件上传成功"
    });
  } catch (error) {
    console.error("文件上传失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: "文件上传失败"
      },
      { status: 500 }
    );
  }
} 