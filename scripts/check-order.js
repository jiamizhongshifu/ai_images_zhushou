const {createClient} = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 直接读取.env.local文件
function loadEnv() {
  try {
    const envPath = path.resolve(__dirname, '../.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^['"]|['"]$/g, '');
        envVars[key] = value;
      }
    });
    
    return envVars;
  } catch (error) {
    console.error('读取环境变量失败:', error);
    return {};
  }
}

async function checkOrder() {
  try {
    const env = loadEnv();
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    
    console.log('环境变量:', { supabaseUrl: supabaseUrl ? '已设置' : '未设置', supabaseServiceKey: supabaseServiceKey ? '已设置' : '未设置' });
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('缺少必要的Supabase配置环境变量');
      return;
    }
    
    // 使用service_role密钥创建客户端，绕过RLS策略
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    // 查询支付订单
    const { data: order, error: orderError } = await supabase
      .from('ai_images_creator_payments')
      .select('*')
      .eq('order_no', '17438715828958859')
      .single();
    
    if (orderError) {
      console.error('查询订单失败:', orderError);
      return;
    }
    
    console.log('订单信息:', JSON.stringify(order, null, 2));
    
    // 如果订单状态是pending，尝试主动更新
    if (order.status === 'pending') {
      console.log('尝试更新pending状态的订单...');
      
      // 更新订单状态
      const { data: updatedOrder, error: updateError } = await supabase
        .from('ai_images_creator_payments')
        .update({
          status: 'success',
          paid_at: new Date().toISOString(),
          trade_no: 'manual_fix_'+Date.now(),
          updated_at: new Date().toISOString()
        })
        .eq('order_no', '17438715828958859')
        .select()
        .single();
      
      if (updateError) {
        console.error('更新订单状态失败:', updateError);
        return;
      }
      
      console.log('订单状态已更新为success');
      
      // 更新用户点数
      try {
        // 先查询当前点数
        const { data: creditData, error: creditError } = await supabase
          .from('ai_images_creator_credits')
          .select('credits')
          .eq('user_id', order.user_id)
          .single();
          
        if (creditError) {
          console.error('查询用户点数失败:', creditError);
          return;
        }
        
        const currentCredits = creditData?.credits || 0;
        const newCredits = currentCredits + order.credits;
        
        // 记录点数变更日志
        await supabase
          .from('ai_images_creator_credit_logs')
          .insert({
            user_id: order.user_id,
            order_no: order.order_no,
            operation_type: 'recharge',
            old_value: currentCredits,
            change_value: order.credits,
            new_value: newCredits,
            created_at: new Date().toISOString(),
            note: '手动处理充值'
          });
        
        // 更新用户点数
        const { error: updateError } = await supabase
          .from('ai_images_creator_credits')
          .update({
            credits: newCredits,
            updated_at: new Date().toISOString(),
            last_order_no: order.order_no
          })
          .eq('user_id', order.user_id);
        
        if (updateError) {
          console.error('更新用户点数失败:', updateError);
          return;
        }
        
        console.log(`用户点数已更新: ${currentCredits} -> ${newCredits}`);
      } catch (error) {
        console.error('处理点数更新失败:', error);
      }
    } else {
      console.log(`订单状态已经是 ${order.status}，无需更新`);
    }
  } catch (error) {
    console.error('执行脚本时出错:', error);
  }
}

checkOrder(); 