export default function PageIllustration() {
  return (
    <>
      {/* SVG Stripes Pattern */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2 transform"
        aria-hidden="true"
      >
        <svg
          className="max-w-none"
          width={768}
          height={432}
          viewBox="0 0 768 432"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="stripeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.1" />
              <stop offset="100%" stopColor="rgb(147, 51, 234)" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          {/* Vertical stripes */}
          {Array.from({ length: 20 }, (_, i) => (
            <rect
              key={i}
              x={i * 40}
              y={0}
              width={2}
              height={432}
              fill="url(#stripeGradient)"
              opacity={0.3}
            />
          ))}
          {/* Diagonal stripes */}
          {Array.from({ length: 15 }, (_, i) => (
            <line
              key={`diag-${i}`}
              x1={i * 60}
              y1={0}
              x2={i * 60 + 200}
              y2={432}
              stroke="url(#stripeGradient)"
              strokeWidth={1}
              opacity={0.2}
            />
          ))}
        </svg>
      </div>

      {/* Gradient blur circles */}
      <div
        className="pointer-events-none absolute -top-32 left-1/2 ml-[580px] -translate-x-1/2"
        aria-hidden="true"
      >
        <div className="h-80 w-80 rounded-full bg-gradient-to-tr from-blue-500 to-transparent opacity-40 blur-[120px]" />
      </div>

      <div
        className="pointer-events-none absolute left-1/2 top-[420px] ml-[380px] -translate-x-1/2"
        aria-hidden="true"
      >
        <div className="h-80 w-80 rounded-full bg-gradient-to-tr from-blue-500 to-purple-600 opacity-30 blur-[120px]" />
      </div>

      <div
        className="pointer-events-none absolute left-1/2 top-[640px] -ml-[300px] -translate-x-1/2"
        aria-hidden="true"
      >
        <div className="h-80 w-80 rounded-full bg-gradient-to-tr from-purple-500 to-blue-600 opacity-25 blur-[120px]" />
      </div>

      {/* Additional subtle background elements */}
      <div
        className="pointer-events-none absolute left-1/2 top-[200px] -ml-[600px] -translate-x-1/2"
        aria-hidden="true"
      >
        <div className="h-60 w-60 rounded-full bg-gradient-to-tr from-green-400 to-blue-500 opacity-20 blur-[100px]" />
      </div>
    </>
  );
}