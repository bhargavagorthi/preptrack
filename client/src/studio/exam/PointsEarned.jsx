import { useEffect, useState } from "react";
import api from "../../api";
import LevelBar from "../components/LevelBar";

export default function PointsEarned({ attemptId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/student/progress/attempt/${attemptId}`).then((r) => setData(r.data)).catch(() => {});
  }, [attemptId]);

  if (!data || data.events.length === 0) return null;

  return (
    <div className="card points-earned">
      {data.leveled_up && (
        <div className="levelup">
          🎉 Level up! You reached <b>Level {data.after.level} · {data.after.name}</b>
        </div>
      )}
      <div className="points-head">
        <h3>⭐ +{data.earned} points</h3>
        <span className="muted">Level {data.after.level} · {data.after.name}</span>
      </div>
      <ul className="points-list">
        {data.events.map((e) => (
          <li key={e.id}><span>{e.label}</span><b>+{e.points}</b></li>
        ))}
      </ul>
      <LevelBar level={data.after} />
    </div>
  );
}
