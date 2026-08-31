interface AngledDividerProps {
  className?: string;
  /** flip vertically (peak pointing down) */
  flipped?: boolean;
}

/**
 * Soft blurred "aurora ridge" transition between two stacked sections.
 * Wide shallow chevron rendered as a blurred gradient glow in brand orange,
 * fading down into the dark background.
 */
const AngledDivider = ({ className = "", flipped = false }: AngledDividerProps) => {
  return (
    <div
      aria-hidden="true"
      className={`relative w-full leading-[0] pointer-events-none select-none overflow-hidden ${className}`}
      style={flipped ? { transform: "scaleY(-1)" } : undefined}
    >
      <svg
        viewBox="0 0 1440 240"
        preserveAspectRatio="none"
        className="block w-full h-[120px] md:h-[200px]"
      >
        <defs>
          <linearGradient id="ridge-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff6e6" stopOpacity="0.95" />
            <stop offset="18%" stopColor="#ffcf70" stopOpacity="0.9" />
            <stop offset="42%" stopColor="#fea310" stopOpacity="0.75" />
            <stop offset="75%" stopColor="#fea310" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#fea310" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ridge-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(0 0% 5%)" stopOpacity="0" />
            <stop offset="60%" stopColor="hsl(0 0% 5%)" stopOpacity="0.75" />
            <stop offset="100%" stopColor="hsl(0 0% 5%)" stopOpacity="1" />
          </linearGradient>
          <filter id="ridge-blur" x="-20%" y="-40%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="26" />
          </filter>
        </defs>

        {/* blurred glow band following a shallow chevron */}
        <g filter="url(#ridge-blur)">
          <path
            d="M-60 150 L720 30 L1500 150 L1500 300 L-60 300 Z"
            fill="url(#ridge-glow)"
          />
        </g>

        {/* fade the bottom into the page background */}
        <rect x="0" y="90" width="1440" height="150" fill="url(#ridge-fade)" />
      </svg>
    </div>
  );
};

export default AngledDivider;
