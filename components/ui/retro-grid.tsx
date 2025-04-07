import { cn } from "@/lib/utils";

export function RetroGrid({
  className,
  angle = 75,
}: {
  className?: string;
  angle?: number;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute size-full overflow-hidden opacity-90 [perspective:400px]",
        className,
      )}
    >
      {/* Grid */}
      <div 
        className="absolute inset-0"
        style={{ transform: `rotateX(${angle}deg)` }}
      >
        <div
          className={cn(
            "retro-grid-animation",
            "[background-repeat:repeat] [background-size:50px_50px] [height:300vh] [inset:0%_0px] [margin-left:-50%] [transform-origin:100%_0_0] [width:600vw]",

            // Light Styles
            "[background-image:linear-gradient(to_right,rgba(0,0,0,0.5)_1px,transparent_0),linear-gradient(to_bottom,rgba(0,0,0,0.5)_1px,transparent_0)]",

            // Dark styles
            "dark:[background-image:linear-gradient(to_right,rgba(255,255,255,0.4)_1px,transparent_0),linear-gradient(to_bottom,rgba(255,255,255,0.4)_1px,transparent_0)]",
          )}
        />
      </div>

      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-white via-white/70 to-transparent to-85% dark:from-black dark:via-black/70" />
    </div>
  );
} 