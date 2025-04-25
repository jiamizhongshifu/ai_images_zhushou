## 🛠 OpenAI API 调用指南（Node.js 环境）

### 📦 安装依赖

首先，确保您已安装以下依赖：

```bash
npm install openai axios dotenv
```

- `openai`：官方 SDK，用于与 OpenAI API 交互。
- `axios`：用于发送 HTTP 请求。
- `dotenv`：用于加载环境变量。

### 🔑 配置 API Key

在项目根目录下创建 `.env` 文件，添加您的 OpenAI API 密钥：

```env
OPENAI_API_KEY=your-api-key-here
```

在代码中加载环境变量：

```js
import dotenv from 'dotenv';
dotenv.config();
```

### 🧑‍💻 创建 OpenAI 客户端

使用您的 API 密钥初始化 OpenAI 客户端：

```js
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### 🎨 生成图片的 API 调用

使用 `openai.images.generate` 方法生成图片：

```js
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateImage() {
  try {
    const response = await openai.images.generate({
      model: "gpt-image-1-vip",
      prompt: '一只穿着太空服的柴犬在火星上行走，数字艺术风格',
      n: 1,
      size: '1024x1024',
      quality: "standard",
      style: "natural",
      response_format: 'url',
      user: "user-123"
    });

    const imageUrl = response.images[0].url;
    console.log('生成的图片链接：', imageUrl);
  } catch (error) {
    console.error('生成图片时出错：', error);
  }
}

generateImage();
```

### 🧾 参数说明

- `model`（string）：使用的模型，应为 `"gpt-image-1-vip"` 或其他支持的图像生成模型。
- `prompt`（string）：生成图像的文本描述，最多1000个字符。
- `n`（integer）：要生成的图像数量，默认为1。
- `size`（string）：图像的尺寸，可选 `"256x256"`, `"512x512"`, 或 `"1024x1024"`。
- `response_format`（string）：响应格式，可选 `"url"` 或 `"b64_json"`。
- `quality`（string）：图像质量，可选 "standard" 或 "hd"，会影响生成速度和消耗的点数。
- `style`（string）：风格偏好，可选 "natural" 或 "vivid"。
- `user`（string）：标识最终用户的唯一标识符，用于监控和检测滥用。

### 🖼 下载并保存图片（可选）

如果您希望将生成的图片保存到本地，可以使用以下代码：

```js
import fs from 'fs';
import axios from 'axios';

async function downloadImage(url, filename = 'output.png') {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(filename, response.data);
    console.log('图片已保存为：', filename);
  } catch (error) {
    console.error('下载图片时出错：', error);
  }
}

// 使用示例
// downloadImage('https://example.com/generated_image.png');
```

### 🚀 提示词设计建议（Prompt Engineering）

为了获得更好的图像生成效果，建议在提示词中包含以下元素：

- **具体描述**：明确图像的主体、场景、动作等细节。
- **艺术风格**：指定图像的艺术风格，如"油画风格"、"赛博朋克"、"像素艺术"等。
- **颜色和光影**：描述期望的色调、光影效果等。

示例提示词：

- `"一只穿着太空服的柴犬在火星上行走，数字艺术风格"`
- `"赛博朋克风格的城市夜景，高楼大厦和霓虹灯"`

### 🌐 参考链接

- OpenAI API 文档（API 参考）：[https://platform.openai.com/docs/api-reference](https://platform.openai.com/docs/api-reference)
- 图像生成指南（Prompt Engineering）：[https://platform.openai.com/docs/guides/prompt-engineering](https://platform.openai.com/docs/guides/prompt-engineering)