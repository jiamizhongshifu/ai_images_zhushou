      // 如果没有从流中提取到URL，尝试从完整响应中提取
      if (!imageUrl) {
        const fullContent = chunks.join('');
        const extractedUrl = extractUrlFromContent(fullContent);
        if (extractedUrl) {
          imageUrl = extractedUrl;
          logger.info(`从完整响应中提取到图片URL: ${imageUrl}`);
        } else {
          // 记录完整响应内容，帮助调试
          logger.warn(`未能从响应中提取图片URL，完整响应:`);
          logger.warn(fullContent.substring(0, 1000) + (fullContent.length > 1000 ? '...(已截断)' : ''));
          throw new Error('未能提取图片URL');
        }
      }
      
      // 保存历史记录
      saveGenerationHistory(user.id, prompt, imageUrl, style || null, originalAspectRatio || null, standardAspectRatio || null);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      logger.info(`图片生成请求完成，总耗时: ${duration}ms`);
      
      // 返回结果
      return new Response(JSON.stringify({ 
        success: true,
        imageUrl: imageUrl,
        message: '图片生成成功',
        duration: duration
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
      
    } catch (generationError) {
      // 图片生成过程中出错，退还点数
      logger.error(`图片生成过程失败: ${generationError instanceof Error ? generationError.message : String(generationError)}`);
      
      // 尝试退还用户点数
      try {
        const { data: userCredits } = await supabaseAdmin
          .from('ai_images_creator_credits')
          .select('credits')
          .eq('user_id', user.id)
          .single();
        
        if (userCredits) {
          await supabaseAdmin
            .from('ai_images_creator_credits')
            .update({
              credits: userCredits.credits + 1,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id);
          
          logger.info(`已退还用户 ${user.id} 的1个点数`);
        }
      } catch (refundError) {
        logger.error(`尝试退还用户点数失败: ${refundError instanceof Error ? refundError.message : String(refundError)}`);
      }
      
      throw generationError;
    }
    
  } catch (error: any) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.error(`图片生成失败，总耗时: ${duration}ms, 错误: ${error.message || String(error)}`);
    
    // 格式化错误信息
    let errorMessage = '生成图片时出错';
    if (error.message) {
      if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        errorMessage = '连接图资API服务器超时，请稍后再试';
      } else if (error.message.includes('rate limit')) {
        errorMessage = '图资API服务器繁忙，请稍后再试';
      } else if (error.message.includes('Unauthorized') || error.message.includes('invalid_api_key')) {
        errorMessage = 'API密钥无效，请联系管理员更新配置';
      } else {
        errorMessage = error.message;
      }
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage,
      duration: duration
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    // 无论成功失败，都释放锁
    isProcessing = false;
  }
}

// 保存生成历史到数据库，捕获但不传播错误
async function saveGenerationHistory(userId: string, prompt: string, imageUrl: string, style: string | null = null, aspectRatio: string | null = null, standardAspectRatio: string | null = null) {
  try {
    const supabaseAdmin = createAdminClient();
    const { error: historyError } = await supabaseAdmin
      .from('ai_images_creator_history')
      .insert({
        user_id: userId,
        prompt: prompt,
        image_url: imageUrl,
        // 检查数据库是否有style字段，如果不确定则不写入
        ...(style ? { style } : {}),
        // 添加图片比例字段，如果有的话
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        // 添加标准化比例字段
        ...(standardAspectRatio ? { standard_aspect_ratio: standardAspectRatio } : {}),
        model_used: 'tuzi-gpt4o', // 记录使用的是图资API的GPT-4o
        created_at: new Date().toISOString()
      });
    
    if (historyError) {
      logger.warn(`保存生成历史失败: ${historyError.message}`);
    } else {
      logger.info(`成功保存生成历史记录${aspectRatio ? `，图片比例: ${aspectRatio}` : ''}${standardAspectRatio ? `，标准比例: ${standardAspectRatio}` : ''}`);
    }
  } catch (error) {
    logger.warn(`保存历史记录过程中出错: ${error instanceof Error ? error.message : String(error)}`);
    // 不抛出错误，保证主流程不受影响
  }
}

// 从API响应内容中提取URL
function extractUrlFromContent(content: string): string | null {
  try {
    // 尝试匹配常见URL模式
    const urlPatterns = [
      /(https?:\/\/[^\s'"()<>]+)/, // 基本URL
      /(https?:\/\/[^\s'"]+)/, // 更宽松的URL
      /\b(https?:\/\/\S+)/, // 非空格的URL
      /\[(https?:\/\/[^\]]+)\]/, // 方括号中的URL
      /"(https?:\/\/[^"]+)"/, // 双引号中的URL
      /'(https?:\/\/[^']+)'/, // 单引号中的URL
      /链接[:：]\s*(https?:\/\/\S+)/, // 中文标记的URL
      /URL[:：]\s*(https?:\/\/\S+)/, // URL标记
      /image:?\s*(https?:\/\/\S+)/, // image标记
      /源文件[地址链接]?[为是:：]\s*(https?:\/\/\S+)/ // 中文描述的图片URL
    ];
    
    // 尝试所有模式
    for (const pattern of urlPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        let extractedUrl = match[1].trim();
        
        // 记录匹配的模式和原始URL
        logger.info(`匹配到URL模式: ${pattern}, 原始URL: ${extractedUrl}`);
        
        // 清理URL
        if (extractedUrl.endsWith(')') && !extractedUrl.includes('(')) {
          extractedUrl = extractedUrl.slice(0, -1);
        }
        
        // 删除尾部特殊字符
        extractedUrl = extractedUrl.replace(/[.,;:!?)]$/, '');
        
        // 删除其他可能的无效字符
        extractedUrl = extractedUrl.replace(/["'<>{}]/, '');
        
        // 日志记录清理后的URL
        logger.info(`提取到URL: ${extractedUrl}`);
        
        // 返回清理后的URL
        return extractedUrl;
      }
    }
    
    // 如果没有找到URL，记录整个内容以便分析
    logger.warn(`无法从内容中提取URL，完整内容: ${content.substring(0, 500)}...`);
    return null;
  } catch (error) {
    logger.error(`URL提取过程中出错: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
} 