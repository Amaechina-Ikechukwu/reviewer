import { useEffect, useState } from "react";
import { Icon } from "./ui/Icons";

export function GlobalLoading() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function handleGlobalLoading(e: CustomEvent<{ isLoading: boolean }>) {
      setLoading(e.detail.isLoading);
    }
    
    window.addEventListener("global-loading", handleGlobalLoading as EventListener);
    return () => window.removeEventListener("global-loading", handleGlobalLoading as EventListener);
  }, []);

  if (!loading) return null;

  return (
    <div className="fixed top-0 left-0 w-full z-[100] flex justify-center pointer-events-none animate-fade-in">
      <div className="bg-[var(--accent)] text-white text-[11px] uppercase tracking-wider font-semibold px-4 py-1.5 rounded-b shadow-lg flex items-center gap-2">
        <Icon.Refresh className="h-3.5 w-3.5 animate-spin" />
        Loading...
      </div>
    </div>
  );
}
