export default function LevelBar({ level }) {
  return (
    <div className="xp">
      <div className="xp-track">
        <div className="xp-fill" style={{ width: `${level.progress_pct}%` }} />
      </div>
      <div className="xp-label muted">
        {level.points - level.floor} / {level.next - level.floor} points to Level {level.level + 1}
      </div>
    </div>
  );
}
