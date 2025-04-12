// 修复文件格式的脚本
const fs = require('fs');
const path = require('path');

// 读取原始文件
const filePath = path.join(__dirname, 'route.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 替换最后几行
const fixedContent = content.replace(/\}\s*\}\s*$/, '  }\n}');

// 写入修复后的内容
fs.writeFileSync(filePath, fixedContent);

console.log('文件已修复'); 