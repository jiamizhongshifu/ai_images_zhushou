import { changelogData } from "@/data/changelog";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "更新日志 - iMG图图 - AI图像助手",
  description: "查看网站最新功能和未来规划",
};

export default function ChangelogPage() {
  return (
    <div className="container py-10 max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold mb-8">更新日志</h1>
      
      <div className="space-y-12">
        {changelogData
          .filter(entry => entry.isPublished)
          .map(entry => (
            <div key={entry.id} className="border-l-4 border-primary pl-5 py-2">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-2xl font-bold">{entry.title}</h2>
                <div className="text-sm text-muted-foreground">
                  {entry.version} 
                  {entry.date && ` · ${entry.date}`}
                </div>
              </div>
              
              <p className="text-muted-foreground mb-4">{entry.description}</p>
              
              <div className="space-y-3">
                {entry.changes.map((change, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                      change.type === "new" ? "bg-green-100 text-green-800" :
                      change.type === "improved" ? "bg-blue-100 text-blue-800" :
                      change.type === "fixed" ? "bg-amber-100 text-amber-800" :
                      "bg-purple-100 text-purple-800"
                    }`}>
                      {change.type === "new" ? "新功能" :
                       change.type === "improved" ? "优化" :
                       change.type === "fixed" ? "修复" : "即将推出"}
                    </span>
                    <span>{change.content}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
} 