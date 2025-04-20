import crypto from 'crypto';

// 获取环境变量中的支付配置
const ZPAY_PID = process.env.ZPAY_PID || '';
const ZPAY_KEY = process.env.ZPAY_KEY || '';
const PAYMENT_BASE_URL = 'https://zpayz.cn/submit.php';
const SITE_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// 订单状态
export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed'
}

// 支付类型
export enum PaymentType {
  ALIPAY = 'alipay',
  WXPAY = 'wxpay'
}

// 点数套餐
export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  baseCredits?: number;   // 基础点数
  bonusCredits?: number;  // 赠送点数
  recommended?: boolean;  // 是否推荐
  bestValue?: boolean;    // 是否最划算
  tag?: string;           // 套餐标签
}

// 预定义的点数套餐
export const CREDIT_PACKAGES: CreditPackage[] = [
  { 
    id: 'basic', 
    name: '普通套餐', 
    credits: 35, 
    baseCredits: 30,
    bonusCredits: 5,
    price: 30,
    tag: '轻松起步'
  },
  { 
    id: 'standard', 
    name: '高级套餐', 
    credits: 120, 
    baseCredits: 98,
    bonusCredits: 22,
    price: 98,
    recommended: true,
    tag: '超值之选'
  },
  { 
    id: 'premium', 
    name: '至尊套餐', 
    credits: 260, 
    baseCredits: 198,
    bonusCredits: 62,
    price: 198,
    bestValue: true,
    tag: '最划算'
  }
];

/**
 * 生成唯一订单号
 */
export function generateOrderNo(): string {
  const timestamp = new Date().getTime().toString();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${timestamp}${random}`;
}

/**
 * 根据MD5签名算法生成签名
 * @param params 请求参数
 * @param key 商户密钥
 */
export function generateSign(params: Record<string, any>, key: string): string {
  try {
    // 1. 排除sign和sign_type参数，以及空值参数
    const filteredParams: Record<string, any> = {};
    Object.keys(params).forEach(k => {
      const value = params[k];
      if (k !== 'sign' && k !== 'sign_type' && value !== null && value !== undefined && value !== '') {
        // 确保所有值都是字符串类型
        filteredParams[k] = String(value).trim();
      }
    });

    // 2. 按照参数名ASCII码从小到大排序(a-z)
    const sortedKeys = Object.keys(filteredParams).sort();

    // 3. 拼接成URL键值对的格式 - 不进行URL编码
    const stringArray = sortedKeys.map(key => `${key}=${filteredParams[key]}`);
    const stringA = stringArray.join('&');
    
    // 4. 拼接商户密钥并进行MD5加密
    const stringSignTemp = stringA + '商户KEY';
    
    // 调试输出
    console.log('待签名字符串(不含KEY):', stringA);
    console.log('最终签名字符串(拼接固定文本):', stringSignTemp);
    
    // 5. MD5加密结果使用小写
    const sign = crypto.createHash('md5').update(stringSignTemp, 'utf8').digest('hex').toLowerCase();
    return sign;
  } catch (error) {
    console.error('生成签名出错:', error);
    throw new Error(`生成支付签名失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 验证签名
 * @param params 请求参数
 * @param key 商户密钥
 */
export function verifySign(params: Record<string, any>, key: string): boolean {
  try {
    const receivedSign = params.sign;
    if (!receivedSign) {
      console.error('缺少签名参数');
      return false;
    }

    // 计算签名
    const calculatedSign = generateSign(params, key);
    
    // 比较签名（不区分大小写）
    const isValid = receivedSign.toLowerCase() === calculatedSign.toLowerCase();
    
    if (!isValid) {
      console.error('签名不匹配。收到:', receivedSign, '计算:', calculatedSign);
    }
    
    return isValid;
  } catch (error) {
    console.error('验证签名过程出错:', error);
    return false;
  }
}

/**
 * 生成支付URL
 * @param orderNo 订单号
 * @param amount 金额
 * @param credits 点数
 * @param paymentType 支付类型
 * @param userId 用户ID (新增参数)
 * @returns 支付URL或表单数据
 */
export function generatePaymentUrl(
  orderNo: string,
  amount: number,
  credits: number,
  paymentType: PaymentType = PaymentType.ALIPAY,
  userId?: string // 添加可选的用户ID参数
): string {
  // 检查环境变量是否设置 - 改为静默检查
  if (!ZPAY_PID || !ZPAY_KEY) {
    // 仅在开发环境记录错误
    if (process.env.NODE_ENV === 'development') {
      console.warn('支付配置提示: 请确保 ZPAY_PID 和 ZPAY_KEY 已正确设置');
    }
  }
  
  // 为返回URL添加用户ID参数，确保返回时可以识别用户
  const returnUrl = userId 
    ? `${SITE_BASE_URL}/protected?order_no=${orderNo}&user_id=${userId}` 
    : `${SITE_BASE_URL}/protected?order_no=${orderNo}`;
  
  // 商品名称处理 - 不进行任何URL编码，文档要求：参数值不要进行url编码
  let productName = '';
  if (paymentType === PaymentType.WXPAY) {
    // 对于微信支付，使用英文命名避免中文问题
    productName = `AI Assistant-${credits} Credits`;
  } else {
    // 支付宝也使用英文命名避免中文问题
    productName = `AI Assistant-${credits} Credits`;
  }
  
  // 创建参数对象 - 所有值都使用字符串格式
  const params: Record<string, string> = {
    pid: ZPAY_PID,
    type: paymentType,
    out_trade_no: orderNo,
    notify_url: `${SITE_BASE_URL}/api/payment/webhook`,
    return_url: returnUrl,
    name: productName,
    money: amount.toFixed(2),
    sign_type: 'MD5',
    param: userId || ''
  };
  
  // 检查空值参数
  Object.keys(params).forEach(key => {
    if (params[key] === undefined || params[key] === null || params[key] === '') {
      console.error(`支付参数错误: ${key} 不能为空`);
    }
  });

  // 生成签名
  params.sign = generateSign(params, ZPAY_KEY);

  // 打印日志方便调试
  console.log(`${paymentType}支付参数:`, params);

  // 构建URL查询参数 - 这时需要对URL做编码，但只针对最终URL
  const queryString = Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  const fullPaymentUrl = `${PAYMENT_BASE_URL}?${queryString}`;
  
  // 输出完整的支付URL用于调试，遮盖签名值
  const debugUrl = fullPaymentUrl.replace(/sign=[^&]+/, 'sign=***');
  console.log(`${paymentType}支付URL: ${debugUrl}`);
  
  return fullPaymentUrl;
}

/**
 * 生成支付表单数据，解决URL特殊字符问题
 * @param orderNo 订单号
 * @param amount 金额
 * @param credits 点数
 * @param paymentType 支付类型
 * @param userId 用户ID
 * @returns 表单数据，包括请求URL和参数
 */
export function generatePaymentFormData(
  orderNo: string,
  amount: number,
  credits: number,
  paymentType: PaymentType = PaymentType.ALIPAY,
  userId?: string
): { url: string, formData: Record<string, string> } {
  
  // 检查环境变量
  if (!ZPAY_PID || !ZPAY_KEY) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('支付配置提示: 请确保 ZPAY_PID 和 ZPAY_KEY 已正确设置');
    }
  }
  
  // 使用更简洁的返回URL
  const returnUrl = `${SITE_BASE_URL}/pay?o=${orderNo}`;
  
  // 使用超短商品名
  const productName = `AI${credits}`;
  
  // 直接构建无特殊字符的通知URL
  const notifyUrl = `${SITE_BASE_URL}/api/n/${orderNo}`;
  
  // 创建参数对象 - 最小化参数值
  const params: Record<string, string> = {
    pid: ZPAY_PID,
    type: paymentType,
    out_trade_no: orderNo,
    notify_url: notifyUrl,
    return_url: returnUrl,
    name: productName,
    money: amount.toFixed(2),
    sign_type: 'MD5',
    param: orderNo // 使用订单号作为param参数
  };
  
  // 生成签名
  params.sign = generateSign(params, ZPAY_KEY);
  
  // 打印完整日志方便调试
  const debugParams = { ...params, sign: '***' };
  console.log(`${paymentType}支付表单数据:`, debugParams);
  
  return {
    url: PAYMENT_BASE_URL,
    formData: params
  };
}

/**
 * 解析支付通知参数
 * @param data 通知数据
 */
export function parsePaymentNotification(data: Record<string, any>): {
  isValid: boolean;
  isSuccess: boolean;
  orderNo: string;
  amount: number;
  tradeNo: string;
} {
  // 记录调试信息
  console.log('解析支付通知参数:', data);
  
  // 尝试从多种可能的参数名中获取订单号和交易号
  const orderNo = data.out_trade_no || data.order_no || data.orderno || '';
  const tradeNo = data.trade_no || data.transaction_id || `auto_${Date.now()}`;
  
  // 尝试从不同参数中获取金额
  let amount = 0;
  if (data.money) {
    amount = parseFloat(data.money);
  } else if (data.amount) {
    amount = parseFloat(data.amount);
  } else if (data.total_amount) {
    amount = parseFloat(data.total_amount);
  }

  // 判断是否支付成功 - 兼容多种状态格式
  const isSuccess = 
    data.trade_status === 'TRADE_SUCCESS' || 
    data.status === 'success' || 
    data.pay_status === 'success' ||
    data.result === 'success' ||
    // 微信支付特有状态
    data.return_code === 'SUCCESS' ||
    data.result_code === 'SUCCESS' ||
    // 其他可能的成功状态
    data.status === '1' ||
    data.paid === '1' ||
    data.paid === 'true';
    
  // 验证签名 - 增强安全性
  let isValid = false;
  
  try {
    if (data.sign) {
      // 根据文档，必须验证签名
      isValid = verifySign(data, ZPAY_KEY);
      console.log('签名验证结果:', isValid ? '通过' : '失败');
      
      if (!isValid) {
        // 记录失败原因，用于调试
        const calculatedSign = generateSign(data, ZPAY_KEY);
        console.error('签名验证失败。收到的签名:', data.sign, '计算的签名:', calculatedSign);
      }
    } else {
      console.error('支付通知缺少签名参数');
      isValid = false;
    }
  } catch (error) {
    console.error('验证签名过程中出错:', error);
    isValid = false;
  }
  
  // 打印处理结果
  console.log('支付通知解析结果:', { isValid, isSuccess, orderNo, amount, tradeNo });
  
  return {
    isValid,
    isSuccess,
    orderNo,
    amount,
    tradeNo
  };
} 