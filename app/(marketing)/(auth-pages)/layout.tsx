export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-12 items-center justify-center min-h-[calc(100vh-120px)] mt-10 px-4">
      {children}
    </div>
  );
}
