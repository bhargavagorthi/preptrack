import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api";

const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function ContestRank({ testId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/leaderboard/contests/${testId}`).then((r) => setData(r.data)).catch(() => {});
  }, [testId]);

  if (!data?.me) return null;
  const me = data.me;

  return (
    <div className="card contest-rank">
      <div>
        <span className="muted small-caps">Contest result</span>
        <h3>{MEDAL[me.rank] || "🏆"} Rank #{me.rank} <small>of {data.participants}</small></h3>
        <p className="muted">
          Percentile {me.percentile}{me.bonus ? ` · +${me.bonus} rank bonus points` : ""}
        </p>
      </div>
      <Link to={`/studio/leaderboard?contest=${testId}`}><button className="ghost">Full leaderboard</button></Link>
    </div>
  );
}
