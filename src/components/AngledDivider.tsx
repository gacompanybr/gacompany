interface AngledDividerProps {
  className?: string;
  /** flip vertically (peak pointing down) */
  flipped?: boolean;
}

/**
 * Shallow angled "ridge" transition between two stacked sections.
 * Wide flat chevron with two brand-orange contour lines tracing above it.
 */
const AngledDivider = ({ className = "", flipped = false }: AngledDividerProps) => {
  return (
    <div
      aria-hidden="true"
      className={`relative w-full leading-[0] pointer-events-none select-none ${className}`}
      style={flipped ? { transform: "scaleY(-1)" } : undefined}
    >
      <svg
        viewBox="0 0 1440 90"
        preserveAspectRatio="none"
        className="block w-full h-[48px] md:h-[80px]"
      >
        {/* solid base panel — matches the site dark background */}
        <path d="M0 90 L0 46 L720 6 L1440 46 L1440 90 Z" fill="hsl(0 0% 5%)" />
        {/* accent line 1 — brand orange */}
        <path
          d="M0 40 L720 0 L1440 40"
          fill="none"
          stroke="#fea310"
          strokeOpacity="0.8"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {/* accent line 2 — lighter tint, slight vertical offset */}
        <path
          d="M0 46 L720 6 L1440 46"
          fill="none"
          stroke="#ffcf70"
          strokeOpacity="0.8"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
};

export default AngledDivider;
