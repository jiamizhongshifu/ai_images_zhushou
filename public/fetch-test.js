/**
 * Supabase连接测试脚本
 * 使用方法: 
 * 1. 在浏览器控制台中运行
 * 2. 通过node命令运行: node fetch-test.js
 */

(function() {
  console.log('=== Supabase连接测试工具 ===');
  
  // 获取Supabase URL
  function getSupabaseUrl() {
    // 优先从预设变量获取
    if (typeof SUPABASE_URL !== 'undefined') {
      return SUPABASE_URL;
    }
    
    // 尝试从环境变量获取
    if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return process.env.NEXT_PUBLIC_SUPABASE_URL;
    }
    
    // 尝试从localStorage获取
    try {
      if (typeof localStorage !== 'undefined') {
        const url = localStorage.getItem('SUPABASE_URL');
        if (url) return url;
      }
    } catch (e) {
      // 忽略localStorage错误
    }
    
    // 默认返回通用Supabase URL
    return 'https://supabase.co';
  }
  
  // 测试Fetch API是否可用
  function checkFetchAvailability() {
    return typeof fetch !== 'undefined';
  }
  
  // 执行网络测试
  async function runNetworkTest() {
    console.log('正在测试网络连接...');
    
    try {
      // 测试一个已知的可访问网站
      const googleTest = await fetch('https://www.google.com', { 
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache'
      });
      console.log('✅ 基本互联网连接测试成功');
    } catch (err) {
      console.error('❌ 基本互联网连接测试失败:', err.message);
      console.warn('这表明您可能没有连接到互联网或您的网络限制了HTTP请求');
      return false;
    }
    
    return true;
  }
  
  // 测试DNS解析
  async function testDNSResolution(url) {
    console.log(`正在测试DNS解析: ${url}`);
    
    try {
      const hostname = new URL(url).hostname;
      console.log(`尝试解析主机名: ${hostname}`);
      
      const startTime = Date.now();
      await fetch(`https://${hostname}/favicon.ico`, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache' 
      });
      
      const resolveTime = Date.now() - startTime;
      console.log(`✅ DNS解析成功! 解析时间: ${resolveTime}ms`);
      return true;
    } catch (err) {
      console.error(`❌ DNS解析失败: ${err.message}`);
      console.warn('这可能表明您的DNS服务器无法解析Supabase域名');
      return false;
    }
  }
  
  // 测试Supabase健康状态API
  async function testSupabaseHealth(url) {
    console.log(`正在测试Supabase健康状态: ${url}`);
    
    try {
      // 尝试访问健康状态端点
      const healthUrl = `${url}/health`;
      console.log(`请求URL: ${healthUrl}`);
      
      const startTime = Date.now();
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cache: 'no-cache'
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Supabase服务器健康状态: 正常 (${responseTime}ms)`);
        console.log('详细信息:', data);
        return true;
      } else {
        console.warn(`⚠️ Supabase服务器返回非正常状态码: ${response.status}`);
        console.log(`响应内容: ${await response.text()}`);
        return false;
      }
    } catch (err) {
      console.error(`❌ Supabase健康检查失败: ${err.message}`);
      return false;
    }
  }
  
  // 完整的连接测试
  async function testConnection() {
    if (!checkFetchAvailability()) {
      console.error('❌ Fetch API不可用，无法执行测试');
      return;
    }
    
    // 获取URL
    const supabaseUrl = getSupabaseUrl();
    console.log(`使用Supabase URL: ${supabaseUrl}`);
    
    // 基本网络测试
    const networkOk = await runNetworkTest();
    if (!networkOk) {
      console.error('🔴 网络测试失败，请检查您的互联网连接');
      return;
    }
    
    // DNS解析测试
    const dnsOk = await testDNSResolution(supabaseUrl);
    if (!dnsOk) {
      console.error('🔴 DNS解析测试失败，请检查您的DNS设置或网络配置');
      return;
    }
    
    // Supabase健康状态测试
    const healthOk = await testSupabaseHealth(supabaseUrl);
    if (!healthOk) {
      console.error('🔴 Supabase健康状态测试失败，服务器可能不可用或URL配置错误');
      return;
    }
    
    console.log('✅✅✅ 全部测试通过! 您的应用可以正常连接到Supabase');
  }
  
  // 立即执行测试
  testConnection().catch(err => {
    console.error('测试过程中发生错误:', err);
  });
  
  // 导出函数，以便在Node.js或浏览器控制台中使用
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { testConnection };
  } else if (typeof window !== 'undefined') {
    window.supabaseConnectionTest = { testConnection };
  }
})(); 