const AnimatedChatIcon = () => {
  return (
    <div className="relative w-16 h-16">
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full animate-pulse"
      >
        {/* Outer chat bubble */}
        <path
          d="M52 12H12C8.68629 12 6 14.6863 6 18V38C6 41.3137 8.68629 44 12 44H16V52L26 44H52C55.3137 44 58 41.3137 58 38V18C58 14.6863 55.3137 12 52 12Z"
          stroke="#22d3ee"
          strokeWidth="2"
          fill="rgba(34, 211, 238, 0.1)"
          className="animate-[pulse_2s_ease-in-out_infinite]"
        />
        
        {/* Chat dots */}
        <circle
          cx="24"
          cy="28"
          r="3"
          fill="#22d3ee"
          className="animate-[bounce_1.5s_ease-in-out_infinite]"
        />
        <circle
          cx="32"
          cy="28"
          r="3"
          fill="#22d3ee"
          className="animate-[bounce_1.5s_ease-in-out_0.1s_infinite]"
        />
        <circle
          cx="40"
          cy="28"
          r="3"
          fill="#22d3ee"
          className="animate-[bounce_1.5s_ease-in-out_0.2s_infinite]"
        />
      </svg>
    </div>
  );
};

export default AnimatedChatIcon;
