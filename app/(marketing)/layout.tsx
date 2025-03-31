import { PersistentNav } from "@/components/persistent-nav";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-full">
      <PersistentNav />
      <div className="max-w-7xl mx-auto mt-10">
        {children}
      </div>
    </div>
  );
}
