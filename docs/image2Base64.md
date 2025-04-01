import fs from 'fs';

export function image2Base64(imagePath: string) {
    const image = fs.readFileSync(imagePath);
    return image.toString('base64');
}