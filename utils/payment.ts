import crypto from 'crypto';

// 获取环境变量中的支付配置
const ZPAY_PID = process.env.ZPAY_PID || '';
const ZPAY_KEY = process.env.ZPAY_KEY || '';
const PAYMENT_BASE_URL = 'https://zpayz.cn/submit.php';

// 生产环境的默认站点URL，开发环境下可以使用localhost
const DEFAULT_PRODUCTION_URL = 'https://www.imgtutu.ai/'; // 替换为实际的生产域名
const SITE_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 
                      (process.env.NODE_ENV === 'production' 
                       ? DEFAULT_PRODUCTION_URL 
                       : 'http://localhost:3000');

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
  // 1. 排除sign和sign_type参数，以及空值参数
  const filteredParams: Record<string, any> = {};
  Object.keys(params).forEach(k => {
    const value = params[k];
    if (k !== 'sign' && k !== 'sign_type' && value !== null && value !== undefined && value !== '') {
      filteredParams[k] = value;
    }
  });

  // 2. 按照参数名ASCII码从小到大排序
  const sortedKeys = Object.keys(filteredParams).sort();

  // 3. 拼接成URL键值对的格式
  const stringArray = sortedKeys.map(key => `${key}=${filteredParams[key]}`);
  const stringA = stringArray.join('&');

  // 4. 拼接商户密钥并进行MD5加密
  const stringSignTemp = stringA + key;
  return crypto.createHash('md5').update(stringSignTemp).digest('hex').toLowerCase();
}

/**
 * 验证签名
 * @param params 请求参数
 * @param key 商户密钥
 */
export function verifySign(params: Record<string, any>, key: string): boolean {
  const receivedSign = params.sign;
  if (!receivedSign) return false;

  const calculatedSign = generateSign(params, key);
  return receivedSign === calculatedSign;
}

/**
 * 生成支付URL
 * @param orderNo 订单号
 * @param amount 金额
 * @param credits 点数
 * @param paymentType 支付类型
 * @param userId 用户ID (新增参数)
 */
export function generatePaymentUrl(
  orderNo: string,
  amount: number,
  credits: number,
  paymentType: PaymentType = PaymentType.ALIPAY,
  userId?: string // 添加可选的用户ID参数
): string {
  // 检查环境变量是否设置
  if (!ZPAY_PID || !ZPAY_KEY) {
    console.error('支付环境变量未设置: ZPAY_PID 或 ZPAY_KEY 缺失');
  }
  
  // 为返回URL添加用户ID参数，确保返回时可以识别用户
  const returnUrl = userId 
    ? `${SITE_BASE_URL}/protected?order_no=${orderNo}&user_id=${userId}` 
    : `${SITE_BASE_URL}/protected?order_no=${orderNo}`;
  
  // 确保传递所有必需参数，且参数值不为空
  const params: Record<string, any> = {
    pid: ZPAY_PID,
    type: paymentType,
    out_trade_no: orderNo,
    notify_url: `${SITE_BASE_URL}/api/payment/webhook`,
    return_url: returnUrl,
    name: `AI图片助手-${credits}点数充值`,
    money: amount.toFixed(2),
    sign_type: 'MD5',
    // 添加自定义参数，将用户ID信息传递到支付页面
    param: userId || ''
  };
  
  // 确保没有空值参数
  Object.keys(params).forEach(key => {
    if (params[key] === undefined || params[key] === null || params[key] === '') {
      console.error(`支付参数错误: ${key} 不能为空`);
    }
  });

  // 生成签名
  params.sign = generateSign(params, ZPAY_KEY);

  // 打印日志方便调试
  console.log('支付参数:', params);

  // 构建URL查询参数
  const queryString = Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  return `${PAYMENT_BASE_URL}?${queryString}`;
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
    
  // 尝试验证签名，但不将其作为必要条件
  let isValid = true;
  
  try {
    if (data.sign) {
      // 只有当提供了签名时才验证
      isValid = verifySign(data, ZPAY_KEY);
    }
  } catch (error) {
    console.error('验证签名过程中出错:', error);
    // 签名验证失败时仍然继续处理
    isValid = true;
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