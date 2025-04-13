import base64
import requests

# OpenAI API Key
api_key = "sk-BdFjUwDwNyPjcv78*****"

# Function to encode the image
def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

# Path to your image
image_path = r"C:\Users\wa***\Downloads\兔子圆形.png"  # 替换为您本地图片的路径

# Getting the base64 string
base64_image = encode_image(image_path)

# 设置请求头
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {api_key}"
}

# 设置请求的payload
payload = {
    "model": "gpt-4o-fast",  # 使用的模型
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "What’s in this image?"
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{base64_image}"
                    }
                }
            ]
        }
    ],
    "max_tokens": 300
}

# 发送POST请求到自定义的API地址
response = requests.post("https://api.tu-zi.com/v1/chat/completions", headers=headers, json=payload)

# 解析响应
response_data = response.json()

# 打印文本内容
print("Text Response:", response_data)