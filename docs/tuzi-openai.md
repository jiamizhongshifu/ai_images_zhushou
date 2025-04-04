import 'dotenv/config';

import { OpenAI } from 'openai';
import { image2Base64 } from './utils';

const openai = new OpenAI({
    apiKey: process.env.TUZI_API_KEY,
    baseURL: process.env.TUZI_BASE_URL,
});

const imagePath = './assets/photo.jpg'; // 图片的路径
const imageType = imagePath.split('.').pop();

async function main() {
    try {
        console.log("开始请求")
        const stream = await openai.chat.completions.create({
            model: process.env.TUZI_MODEL as string,
            messages: [{
                role: 'user', content: [
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/${imageType};base64,${image2Base64(imagePath)}`
                        }
                    },
                    {
                        type: "text",
                        text: `把图片转换成文艺复兴时期的油画风格` // 提示词
                    },
                ]
            }],
            stream: true,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                process.stdout.write(content); // 输出内容
            }
        }
        process.stdout.write('\n');
    } catch (error) {
        console.error('Error processing image:', error);
        process.exit(1);
    }
}

main();

import fs from 'fs';

export function image2Base64(imagePath: string) {
    const image = fs.readFileSync(imagePath);
    return image.toString('base64');
}