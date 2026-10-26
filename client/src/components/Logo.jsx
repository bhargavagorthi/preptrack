import { Link } from "react-router-dom";

// Gradient tile with a graduation cap, plus the wordmark
export default function Logo({ to = "/", light = false, size = 38 }) {
  return (
    <Link to={to} className={`logo ${light ? "light" : ""}`} aria-label="PrepTrack home">
      <span className="logo-tile" style={{ width: size, height: size }}>
        <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} aria-hidden="true">
          <path fill="#fff" d="M12 3 1 8.5l11 5.5 9-4.5V16h2V8.5L12 3z" />
          <path fill="#fff" opacity="0.85" d="M5 12.2V16c0 1.7 3.1 3.5 7 3.5s7-1.8 7-3.5v-3.8l-7 3.5-7-3.5z" />
        </svg>
      </span>
      <span className="logo-word">PrepTrack</span>
    </Link>
  );
}
