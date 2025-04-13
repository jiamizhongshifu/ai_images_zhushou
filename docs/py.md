"""
* 此脚本用于调用GPT-4o-all及相关模型，提交提示词和图片，并返回处理结果
* 支持无图、单图或多图（最多10张）的情况
* 请确保已安装Python环境并安装所需依赖库（如requests，python-dotenv）
* 请复制.env.template为.env并填写您的API密钥
* 确保output目录存在或脚本有权限创建该目录
* 脚本会尝试下载返回的图片并保存到output目录： 运行 python gpt.py （看你存什么文件名了）
"""

import os
import base64
import requests
import time
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 提示词和输入图片，图片请放到和脚本同一目录
prompt = "把照片中的人物变成 泡泡玛特 公仔包装盒的风格，以等距视角（isometric）呈现，并在包装盒上标注标题为“某某”（具体见文末）。包装盒内展示的是照片中人物形象，旁边搭配有日常必备物品（具体见文末）同时，在包装盒旁边还应呈现该公仔本体的实物效果，采用逼真的、具有真实感的渲染风格。标题为雷总，日常必备物品帽子、鞋子、耳坠。"
# 图片列表，可以包含0-10张图片
images = [
    "5.jpg"
]

# 从环境变量获取配置
model = os.getenv("MODEL", "gpt-4o-all")
api_url = "https://api.tu-zi.com/v1/chat/completions"
api_token = os.getenv("API_TOKEN")

# 验证API Token
if not api_token:
    print("错误：未设置API_TOKEN环境变量")
    print("请复制.env.template为.env并填写您的API密钥")
    exit(1)

# 准备请求数据
def prepare_image_data(image_path):
    try:
        with open(image_path, "rb") as img_file:
            encoded_data = base64.b64encode(img_file.read()).decode("utf-8")
            print(f"已准备图片数据: {image_path}（内容已隐藏以确保安全）")
            return "data:image/png;base64," + encoded_data
    except Exception as e:
        print(f"准备图片数据时出错: {image_path} - {e}")
        raise

# 验证图片数量
if len(images) > 10:
    print("错误：图片数量不能超过10张")
    exit(1)

# 添加调试信息
print(f"使用的模型: {model}")
print(f"API 地址: {api_url}")
print(f"图片数量: {len(images)}")
for i, img in enumerate(images, 1):
    print(f"图片 {i} 路径: {img}")

# 构建消息内容
message_content = [{"type": "text", "text": prompt}]

# 添加图片到消息内容
for image_path in images:
    try:
        image_data = prepare_image_data(image_path)
        message_content.append({
            "type": "image_url",
            "image_url": {"url": image_data}
        })
    except Exception as e:
        print(f"处理图片时出错: {image_path} - {e}")
        exit(1)

data = {
    "model": model,
    "stream": False,
    "messages": [
        {
            "role": "user",
            "content": message_content
        }
    ],
}

# 添加调试信息
print(f"请求数据已准备好（图片内容已隐藏）。")

# 发送请求
headers = {
    "Authorization": f"Bearer {api_token}",
    "Content-Type": "application/json",
}

try:
    response = requests.post(api_url, json=data, headers=headers, timeout=1200)
    print(f"响应状态码: {response.status_code}")
    print(f"响应内容: {response.text}")
except Exception as e:
    print(f"发送请求时出错: {e}")
    raise

# 处理响应
if response.status_code != 200:
    print(f"API 错误: {response.status_code} - {response.text}")
    exit()

try:
    result = response.json()
    print(f"响应 JSON 数据: {result}")
except Exception as e:
    print(f"解析响应 JSON 时出错: {e}")
    exit()

if "error" in result:
    print(f"API 错误: {result['error']['message']}")
    exit()

# 遍历result，提取content字段中的图片地址并保存
if "choices" in result and isinstance(result["choices"], list):
    download_success = False
    for choice in result["choices"]:
        if "message" in choice and "content" in choice["message"]:
            content = choice["message"]["content"]
            print(f"正在处理内容: {content}")
            # 使用正则表达式提取markdown中的图片地址
            import re
            matches = re.findall(r"!\[.*?\]\((https?://[^\s]+)\)", content)
            for image_url in matches:
                try:
                    print(f"正在下载图片: {image_url}")
                    image_data = requests.get(image_url).content
                    file_name = f"{result['id']}-{choice['index']}.png"
                    output_dir = os.path.join(os.getcwd(), "output")
                    os.makedirs(output_dir, exist_ok=True)
                    output_path = os.path.join(output_dir, file_name)
                    with open(output_path, "wb") as f:
                        f.write(image_data)
                    print(f"图片已保存到: {output_path}")
                    download_success = True
                except Exception as e:
                    print(f"无法下载图片数据: {image_url} - {e}")
    if not download_success:
        print("未成功下载任何图片。")
else:
    print("返回值格式错误。")