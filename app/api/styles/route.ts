import { NextRequest, NextResponse } from "next/server";

// 模拟数据
const mockStyles = [
  {
    id: "style-1",
    name: "动漫风格",
    description: "日式动漫风格，适合创建动漫角色和场景",
    preview_image: "/images/styles/anime.jpg",
    created_at: "2023-09-01T08:00:00Z",
    updated_at: "2023-09-01T08:00:00Z",
  },
  {
    id: "style-2",
    name: "水彩插画",
    description: "精美水彩风格插画，色彩丰富，质感细腻",
    preview_image: "/images/styles/watercolor.jpg",
    created_at: "2023-09-02T10:15:00Z",
    updated_at: "2023-09-02T10:15:00Z",
  },
  {
    id: "style-3",
    name: "卡通风格",
    description: "可爱的卡通风格，适合创建有趣的人物和场景",
    preview_image: "/images/styles/cartoon.jpg",
    created_at: "2023-09-03T09:30:00Z",
    updated_at: "2023-09-03T09:30:00Z",
  },
  {
    id: "style-4",
    name: "动物森友会风格",
    description: "任天堂动物森友会游戏风格，可爱、圆润的角色与明亮的色彩",
    preview_image: "/images/styles/animal-crossing.jpg",
    created_at: "2023-09-10T14:45:00Z",
    updated_at: "2023-09-10T14:45:00Z",
  },
  {
    id: "style-5",
    name: "像素艺术",
    description: "复古像素风格，适合创建游戏角色和场景",
    preview_image: "/images/styles/pixel-art.jpg",
    created_at: "2023-09-15T11:20:00Z",
    updated_at: "2023-09-15T11:20:00Z",
  },
  {
    id: "style-6",
    name: "赛博朋克",
    description: "未来科技与复古元素混合的赛博朋克风格",
    preview_image: "/images/styles/cyberpunk.jpg",
    created_at: "2023-09-20T16:10:00Z",
    updated_at: "2023-09-20T16:10:00Z",
  }
];

export async function GET(request: NextRequest) {
  try {
    // 获取查询参数
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    
    // 搜索过滤
    let filteredStyles = [...mockStyles];
    if (search) {
      const searchLower = search.toLowerCase();
      filteredStyles = filteredStyles.filter(style => 
        style.name.toLowerCase().includes(searchLower) || 
        style.description.toLowerCase().includes(searchLower)
      );
    }
    
    // 返回结果
    return NextResponse.json({
      success: true,
      data: filteredStyles
    });
  } catch (error) {
    console.error('获取风格列表出错:', error);
    return NextResponse.json({
      success: false,
      error: '获取风格列表失败'
    }, { status: 500 });
  }
} 