import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAcelineStore } from "@/lib/acelineStore";
import { useStore } from "@/lib/store";
import { Sparkles, MapPin } from "lucide-react";

export function AcelineButton() {
  const aceline = useAcelineStore();
  const { activePage } = useStore();

  const handleClick = () => {
    if (aceline.active) {
      aceline.recall();
    } else {
      // Dispatch to current page
      aceline.dispatch(activePage);
    }
  };

  return (
    <motion.button
      onClick={handleClick}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        "fixed bottom-4 right-4 z-[9998] flex items-center gap-2 px-3 py-2.5 rounded-2xl shadow-2xl border transition-all",
        aceline.active
          ? "bg-accent/20 border-accent/40 text-accent"
          : "bg-bg-card border-accent/20 text-accent hover:border-accent/40"
      )}
      title={aceline.active ? `Aceline on ${aceline.location} — click to recall` : "Dispatch Aceline to this page"}
    >
      <div className="relative">
        <Sparkles className="w-5 h-5" />
        {!aceline.active && (
          <motion.div
            className="absolute inset-0 rounded-full bg-accent/30"
            animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
        )}
      </div>
      <div className="text-left hidden sm:block">
        <p className="text-[10px] font-bold leading-none">
          {aceline.active ? "Aceline Active" : "Aceline"}
        </p>
        <p className="text-[8px] text-muted leading-none mt-0.5 flex items-center gap-0.5">
          {aceline.active ? (
            <><MapPin className="w-2 h-2" /> {aceline.location}</>
          ) : (
            "Click to dispatch"
          )}
        </p>
      </div>
    </motion.button>
  );
}
