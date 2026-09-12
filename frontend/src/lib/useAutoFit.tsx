import { useAutoFit, useAutoFocus, HEADER_HEIGHT, MOBILE_NAV_HEIGHT } from "@/lib/useAutoFit";

interface AutoFitContainerProps {
  page: string;
  children: React.ReactNode;
}

export function AutoFitContainer({ page, children }: AutoFitContainerProps) {
  const { viewport } = useAutoFit();
  const { mainRef, scrollRef } = useAutoFocus(page);

  return (
    <main
      ref={mainRef}
      className="md:ml-64 min-h-screen outline-none"
      style={{
        paddingTop: `calc(${HEADER_HEIGHT}px + env(safe-area-inset-top))`,
        paddingBottom: viewport.isMobile
          ? `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`
          : "0px",
      }}
    >
      <div
        ref={scrollRef}
        className="mx-auto"
        style={{
          maxWidth: `${viewport.contentMaxWidth}px`,
          padding: `var(--vp-pad-y, 16px) var(--vp-pad-x, 16px)`,
          fontSize: `var(--vp-base-font, 16px)`,
          transform: viewport.scale < 1 ? `scale(${viewport.scale})` : undefined,
          transformOrigin: "top center",
        }}
      >
        {children}
      </div>
    </main>
  );
}
