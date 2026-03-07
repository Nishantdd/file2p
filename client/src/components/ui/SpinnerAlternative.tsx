import { type FunctionalComponent } from "preact";

interface SpinnerAlternativeProps {
  size?: string;
  speed?: string;
  bgOpacity?: number;
}

export const SpinnerAlternative: FunctionalComponent<
  SpinnerAlternativeProps
> = ({ size = "16px", speed = "1.8s", bgOpacity = 0.2 }) => {
  return (
    <>
      <svg
        class="container"
        viewBox="0 0 40 40"
        height={size}
        width={size}
        style={`--uib-size:${size}; --uib-speed:${speed}; --uib-color:black; --uib-bg-opacity:${bgOpacity};`}
      >
        <circle
          class="track"
          cx="20"
          cy="20"
          r="17.5"
          pathLength="100"
          stroke-width="5px"
          fill="none"
        />
        <circle
          class="car"
          cx="20"
          cy="20"
          r="17.5"
          pathLength="100"
          stroke-width="5px"
          fill="none"
        />
      </svg>

      <style>
        {`
        .container {
          height: var(--uib-size);
          width: var(--uib-size);
          transform-origin: center;
          animation: rotate var(--uib-speed) linear infinite;
          will-change: transform;
          overflow: visible;
        }

        .car {
          fill: none;
          stroke: var(--uib-color);
          stroke-dasharray: 65, 75;
          stroke-dashoffset: 0;
          stroke-linecap: round;
          transition: stroke 0.5s ease;
        }

        .track {
          fill: none;
          stroke: var(--uib-color);
          opacity: var(--uib-bg-opacity);
          transition: stroke 0.5s ease;
        }

        @keyframes rotate {
          100% {
            transform: rotate(360deg);
          }
        }
      `}
      </style>
    </>
  );
};
