# gpt-image-1-vip

## OpenAPI

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1/chat/completions:
    post:
      summary: gpt-image-1-vip
      deprecated: false
      description: ''
      tags:
        - 图片生成/gpt4oimage/chat 格式
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties: {}
              x-apifox-orders: []
            example:
              stream: true
              model: gpt-image-1-vip
              messages:
                - content: 画个牛马
                  role: user
                - content: >-
                    ```

                    {
                      "prompt": "画个牛马",
                      "ratio": "1:1"
                    }

                    ```




                    > ID: `task_01jqwtd9rvev28cr2kechxszq1`

                    > 排队中.

                    > 生成中..

                    > 进度 14%.

                    > 进度 44%.

                    > 进度 74%.

                    > 进度 83%

                    > 生成完成 ✅


                    > gen_id: `gen_01jqwte8yjf7haxqc521b7z2wf`


                    ![gen_01jqwte8yjf7haxqc521b7z2wf](https://videos.openai.com/vg-assets/assets%2Ftask_01jqwtd9rvev28cr2kechxszq1%2Fsrc_0.png?st=2025-04-03T01%3A55%3A56Z&se=2025-04-09T02%3A55%3A56Z&sks=b&skt=2025-04-03T01%3A55%3A56Z&ske=2025-04-09T02%3A55%3A56Z&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skoid=aa5ddad1-c91a-4f0a-9aca-e20682cc8969&skv=2019-02-02&sv=2018-11-09&sr=b&sp=r&spr=https%2Chttp&sig=1dmC3Xhm%2BdHSTQkkLDZo4SBDh9lKovpPswCBQZv0i0A%3D&az=oaivgprodscus)
                  role: assistant
                - content: 牛的脸上遮个布
                  role: user
                  model: gpt-4o-image
                - content: >-
                    ```

                    {
                      "prompt": "牛的脸上遮个布",
                      "ratio": "1:1",
                      "gen_id": "gen_01jqwte8yjf7haxqc521b7z2wf"
                    }

                    ```




                    > ID: `task_01jqwthpjaf3kap2dkqnhxfvpr`

                    > 排队中.

                    > 生成中.....

                    > 进度 15%.

                    > 进度 23%.

                    > 进度 39%.

                    > 进度 48%.

                    > 进度 56%.

                    > 进度 64%..

                    > 生成完成 ✅


                    > gen_id: `gen_01jqwtksnne8mtahpxcdyzna0m`


                    ![gen_01jqwtksnne8mtahpxcdyzna0m](https://videos.openai.com/vg-assets/assets%2Ftask_01jqwthpjaf3kap2dkqnhxfvpr%2Fsrc_0.png?st=2025-04-03T01%3A55%3A56Z&se=2025-04-09T02%3A55%3A56Z&sks=b&skt=2025-04-03T01%3A55%3A56Z&ske=2025-04-09T02%3A55%3A56Z&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skoid=aa5ddad1-c91a-4f0a-9aca-e20682cc8969&skv=2019-02-02&sv=2018-11-09&sr=b&sp=r&spr=https%2Chttp&sig=VepMKpDGUVzY%2BJmlQC2DSvK1sZxR6sZEnAVjq8iqdNI%3D&az=oaivgprodscus)
                  role: assistant
                - content: 最开始的图片改一下吧，让马的脸上遮个布
                  role: user
                - content: >-
                    ```

                    {
                      "prompt": "马的脸上遮个布",
                      "ratio": "1:1",
                      "gen_id": "gen_01jqwte8yjf7haxqc521b7z2wf"
                    }

                    ```




                    > ID: `task_01jqwtprjhftnvgthhtr9q6j5p`

                    > 排队中.

                    > 生成中.....

                    > 进度 11%.

                    > 进度 19%.

                    > 进度 27%....

                    > 进度 65%.

                    > 生成完成 ✅


                    > gen_id: `gen_01jqwtrwp4eq1brqdfasvft8nm`


                    ![gen_01jqwtrwp4eq1brqdfasvft8nm](https://filesystem.site/cdn/20250403/k0kVgLClcJyhH3Pybb5AInvsLptmQV.png)
                  role: assistant
                - content: 我又改了，刚才牛遮布的那一条修改一下，让牛的头上顶着锅盖
                  role: user
                  model: gpt-4o-image
                - content: >-
                    ```

                    {
                      "prompt": "牛的头上顶着锅盖",
                      "ratio": "1:1",
                      "gen_id": "gen_01jqwtksnne8mtahpxcdyzna0m"
                    }

                    ```




                    > ID: `task_01jqwtse1gex29ab7ecnsc7066`

                    > 排队中.

                    > 生成中....

                    > 进度 14%..

                    > 进度 27%.

                    > 进度 36%.

                    > 进度 44%.

                    > 进度 52%.

                    > 进度 60%..

                    > 进度 80%

                    > 生成完成 ✅


                    > gen_id: `gen_01jqwtvfgkea98036y6gbb345v`


                    ![gen_01jqwtvfgkea98036y6gbb345v](https://filesystem.site/cdn/20250403/PZSHoo9fI1pyrvrXmpsNsQFdEfMhWo.png)
                  role: assistant
                - role: user
                  content: 锅盖上再加根筷子
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apifox-orders: []
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 图片生成/gpt4oimage/chat 格式
      x-apifox-status: developing
      x-run-in-apifox: https://app.apifox.com/web/project/6200812/apis/api-282885415-run
components:
  schemas: {}
  securitySchemes: {}
servers:
  - url: https://api.tu-zi.com
    description: api.tu-zi.com
security: []

```