"""
* 此脚本用于调用GPT-4o-all及相关模型，提交提示词和两张图片，并返回处理结果
* 请确保已安装Python环境并安装所需依赖库（如requests，没有装请自行 `pip install requests`）
* 请替换$api_token为您自己的API密钥
* 确保output目录存在或脚本有权限创建该目录
* 脚本会尝试下载返回的图片并保存到output目录： 运行 python gpt.py （看你存什么文件名了）
"""

import os
import base64
import requests
import time

# 提示词和输入图片，图片请放到和脚本同一目录
prompt = "请参照第一张图片的风格，重绘第二张图片，输出比例按照第二张图片"
image_1 = "ff945c73-86df-461f-a858-fcb08a7f9939.png"
image_2 = "9c8b2b03-9c40-4fdd-9585-7b39ba3c28b0.png"

# 可以通过环境变量或直接修改指定模型，默认是gpt-4o-all
model = os.getenv("MODEL", "gpt-4o-all")
# 这个不用改
api_url = "https://api.tu-zi.com/v1/chat/completions"
# 这个请到 https://api.tu-zi.com/token 自己创建
api_token = os.getenv("API_TOKEN", "sk-jITadcbUQUAvg5vVb4XoVqPvabBKZ9ZrDB63GFvMfy7XudFG")

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

# 添加调试信息
print(f"使用的模型: {model}")
print(f"API 地址: {api_url}")
print(f"图片 1 路径: {image_1}")
print(f"图片 2 路径: {image_2}")

data = {
    "model": model,
    "stream": False,
    "messages": [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": prepare_image_data(image_1)}},
                {"type": "image_url", "image_url": {"url": prepare_image_data(image_2)}},
            ],
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