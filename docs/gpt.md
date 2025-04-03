
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

使用 `openai.images.create` 方法生成图片：

```js
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateImage() {
  try {
    const response = await openai.images.create({
      prompt: '一只穿着太空服的柴犬在火星上行走，数字艺术风格',
      n: 1,
      size: '1024x1024',
      response_format: 'url', // 或 'b64_json' 返回 base64 编码的图片
    });

    const imageUrl = response.data[0].url;
    console.log('生成的图片链接：', imageUrl);
  } catch (error) {
    console.error('生成图片时出错：', error);
  }
}

generateImage();
```

### 🧾 参数说明

- `prompt`（string）：描述您希望生成的图像内容。
- `n`（number）：生成的图片数量（最大值为 10）。
- `size`（string）：图片尺寸，支持值如 `256x256`、`512x512`、`1024x1024`。
- `response_format`（string）：返回格式，`url`（默认）返回图片链接，`b64_json` 返回 base64 编码的图片。
- `user`（string，可选）：用于追踪用户的标识符。

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
- **艺术风格**：指定图像的艺术风格，如“油画风格”、“赛博朋克”、“像素艺术”等。
- **颜色和光影**：描述期望的色调、光影效果等。

示例提示词：

- `“一只穿着太空服的柴犬在火星上行走，数字艺术风格”`
- `“赛博朋克风格的城市夜景，高楼大厦和霓虹灯”`

### 🌐 参考链接

- OpenAI API 文档（API 参考）：[https://platform.openai.com/docs/api-reference](https://platform.openai.com/docs/api-reference)
- 图像生成指南（Prompt Engineering）：[https://platform.openai.com/docs/guides/prompt-engineering](https://platform.openai.com/docs/guides/prompt-engineering)