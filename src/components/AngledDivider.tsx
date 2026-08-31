import { useEffect, useRef, useState } from "react";

interface AngledDividerProps {
  className?: string;
  /** flip vertically (peak pointing down) */
  flipped?: boolean;
}

/**
 * Soft blurred "aurora ridge" transition between two stacked sections.
 * Rendered as an overlay (zero layout height, overflow visible, above sections)
 * so the blur never gets clipped by section boundaries.
 * Scroll-reactive: grows to full size when centered in the viewport,
 * shrinks toward a thin glowing line as it leaves the screen.
 */
const AngledDivider = ({ className = "", flipped = false }: AngledDividerProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;

    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const center = rect.top + rect.height / 2;
      const dist = Math.abs(center - vh / 2) / (vh / 2);
      const next = Math.max(0, Math.min(1, 1 - dist));
      setP(next);
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // eased progress -> vertical scale + opacity
  const eased = p * p * (3 - 2 * p);
  const scaleY = 0.08 + 0.92 * eased;
  const opacity = 0.5 + 0.5 * eased;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`relative z-30 h-0 w-full pointer-events-none select-none ${className}`}
    >
      <div
        className="absolute left-0 right-0 top-1/2 -translate-y-1/2 will-change-transform"
        style={{
          transform: `translateY(-50%) scaleY(${scaleY})${flipped ? " scaleY(-1)" : ""}`,
          opacity,
          transition: "transform 120ms linear, opacity 120ms linear",
        }}
      >
        <svg
          viewBox="0 0 1440 240"
          preserveAspectRatio="none"
          className="block w-full h-[140px] md:h-[220px] overflow-visible"
        >
          <defs>
            <linearGradient id="ridge-glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fff6e6" stopOpacity="0.95" />
              <stop offset="18%" stopColor="#ffcf70" stopOpacity="0.9" />
              <stop offset="42%" stopColor="#fea310" stopOpacity="0.75" />
              <stop offset="75%" stopColor="#fea310" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#fea310" stopOpacity="0" />
            </linearGradient>
            <filter id="ridge-blur" x="-25%" y="-60%" width="150%" height="260%">
              <feGaussianBlur stdDeviation="26" />
            </filter>
          </defs>

          <g filter="url(#ridge-blur)">
            <path
              d="M-60 150 L720 30 L1500 150 L1500 300 L-60 300 Z"
              fill="url(#ridge-glow)"
            />
          </g>
        </svg>
      </div>
    </div>
  );
};

export default AngledDivider;
