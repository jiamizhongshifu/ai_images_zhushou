//目标
* 通过最基本的 curl 请求调用 Tu-Zi 的 OpenAI 协议对话接口，生成图片结果，并提供 PHP 和 Python 的代码示例。

* 解决吉卜力出图问题，以下代码中第一张图找张千与千寻的图，第二张是要转化的图，执行就可以了。

//准备工作
* 登录 Tu-Zi API Token 页面 创建一个 API Token。
* API 基础地址为 https://api.tu-zi.com/v1，对话请求地址为 https://api.tu-zi.com/v1/chat/completions。
* 指定模型：gpt-4o-all


<?php
/*
* 这个脚本用于调用GPT-4o-all及相关模型，提交提示词和2张图片，并返回结果
* 请确保你已经安装了PHP的cURL扩展
* 请替换$api_token为你自己的API密钥
* 请确保output目录存在或可写入
* 放到web服务器里，浏览器打开地址，只要不成功，就会等20秒刷到出来为止
*/
//提示词和输入图片，图片请放到和脚本同一目录
$prompt = "请参照第一张图片的风格，重绘第二张图片，输出比例按照第二张图片";
$image_1 = "ff945c73-86df-461f-a858-fcb08a7f9939.png";
$image_2 = "9c8b2b03-9c40-4fdd-9585-7b39ba3c28b0.png";

//可以通过http接收外部模型指定，默认是gpt-4o-all
$model = isset($_GET['model']) ? $_GET['model'] : "gpt-4o-all";
// 这个不用改
$api_url = "https://api.tu-zi.com/v1/chat/completions";
// 这个请到 https://api.tu-zi.com/token 自己创建
$api_token = "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

// 准备请求数据
$data = [
    "model" => $model,
    "stream" => false,
    "messages" => [
        [
            "role" => "user",
            "content" => [
                [
                    "type" => "text",
                    "text" => $prompt,
                ],
                [
                    "type" => "image_url",
                    "image_url" => [
                        "url" => "data:image/png;base64," . base64_encode(file_get_contents($image_1)),
                    ],
                ],
                [
                    "type" => "image_url",
                    "image_url" => [
                        "url" => "data:image/png;base64," . base64_encode(file_get_contents($image_2)),
                    ],
                ],
            ],
        ],
    ],
];

// 初始化cURL请求
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $api_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer $api_token",
    "Content-Type: application/json"
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));

// 设置超时时间为10分钟
curl_setopt($ch, CURLOPT_TIMEOUT, 1200);

$tm = time();
// 执行请求并获取响应
$response = curl_exec($ch);
//这里debug输入和输出数据便于调试
var_dump($data);
echo "<hr/>";
var_dump($response);
echo "<hr/>";


if (curl_errno($ch)) {
    echo "cURL Error: " . curl_error($ch);
    curl_close($ch);
    exit;
}
curl_close($ch);

// 解析响应
$result = json_decode($response, true);
if (isset($result['error'])) {
    echo "API Error: " . $result['error']['message'];
    //如果是网络问题导致没有请求成功，等20秒再刷页面
    echo "<script>
        setTimeout(function() {
            location.reload();
        }, 20000);
    </script>";
    exit;
}

// 遍历result，提取content字段中的图片地址并保存
if (isset($result['choices']) && is_array($result['choices'])) {
    $download_success = false;
    foreach ($result['choices'] as $choice) {
        if (isset($choice['message']['content'])) {
            $content = $choice['message']['content'];
            // 使用正则表达式提取markdown中的图片地址
            if (preg_match_all('/!\[.*?\]\((https?:\/\/[^\s]+)\)/', $content, $matches)) {
                foreach ($matches[1] as $image_url) {
                    $image_data = file_get_contents($image_url);
                    if ($image_data !== false) {
                        $file_name = $result['id'] . '-' . $choice['index'] . '.png';
                        $output_path = __DIR__ . '/output/' . $file_name;
                        if (!is_dir(__DIR__ . '/output')) {
                            mkdir(__DIR__ . '/output', 0777, true);
                        }
                        file_put_contents($output_path, $image_data);
                        echo "图片已保存到: " . $output_path . "\n";
                        $download_success = true;
                    } else {
                        echo "无法下载图片数据: " . $image_url . "\n";
                    }
                }
            } else {
                echo "未能提取到图片地址。\n";
            }
        }
    }
    if (!$download_success) {
        echo "<script>
            setTimeout(function() {
                location.reload();
            }, 20000);
        </script>";
    }
} else {
    echo "返回值格式错误。\n";
    echo "<script>
        setTimeout(function() {
            location.reload();
        }, 20000);
    </script>";
}