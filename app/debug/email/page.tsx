import { EmailDebugger } from '@/app/utils/debug-email';

export default function EmailDebugPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-center">邮件系统诊断</h1>
        <div className="mb-6 p-4 bg-yellow-50 text-yellow-800 rounded-md">
          <p className="text-sm">
            此页面用于诊断邮件发送系统的问题。您可以：
          </p>
          <ul className="list-disc pl-5 mt-2 text-sm">
            <li>测试注册邮件发送</li>
            <li>测试密码重置邮件发送</li>
            <li>重新发送验证邮件</li>
          </ul>
          <p className="text-sm mt-2">
            注意：如果您仍然收不到邮件，请检查以下几点：
          </p>
          <ul className="list-disc pl-5 mt-1 text-sm">
            <li>检查邮箱地址是否正确</li>
            <li>检查垃圾邮件文件夹</li>
            <li>查看 Supabase 后台的邮件发送日志</li>
            <li>配置自定义 SMTP 服务器以提高送达率</li>
          </ul>
        </div>
        
        <EmailDebugger />
      </div>
    </div>
  );
} 