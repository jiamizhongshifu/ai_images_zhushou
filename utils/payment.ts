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
}

// 预定义的点数套餐
export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'basic', name: '基础套餐', credits: 1, price: 1 },
  { id: 'standard', name: '标准套餐', credits: 5, price: 5 }
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
 */
export function generatePaymentUrl(
  orderNo: string,
  amount: number,
  credits: number,
  paymentType: PaymentType = PaymentType.ALIPAY
): string {
  // 检查环境变量是否设置
  if (!ZPAY_PID || !ZPAY_KEY) {
    console.error('支付环境变量未设置: ZPAY_PID 或 ZPAY_KEY 缺失');
  }
  
  // 确保传递所有必需参数，且参数值不为空
  const params: Record<string, any> = {
    pid: ZPAY_PID,
    type: paymentType,
    out_trade_no: orderNo,
    notify_url: `${SITE_BASE_URL}/api/payment/webhook`,
    return_url: `${SITE_BASE_URL}/protected?order_no=${orderNo}`,
    name: `AI图片助手-${credits}点数充值`,
    money: amount.toFixed(2),
    sign_type: 'MD5'
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
  // 验证签名
  const isValid = verifySign(data, ZPAY_KEY);
  
  // 检查支付状态
  const isSuccess = data.trade_status === 'TRADE_SUCCESS';
  
  return {
    isValid,
    isSuccess,
    orderNo: data.out_trade_no || '',
    amount: parseFloat(data.money || '0'),
    tradeNo: data.trade_no || ''
  };
} 