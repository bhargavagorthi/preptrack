import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api";

const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };
const STATE_LABEL = { upcoming: "Upcoming", live: "Live now", ended: "Ended" };
const when = (iso) =>
  new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fmtDur = (s) =>
  s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

const Rank = ({ rank }) => <td className="rank-cell">{MEDAL[rank] || `#${rank}`}</td>;

function ContestRow({ r, bonus }) {
  return (
    <tr className={r.is_me ? "me-row" : ""}>
      <Rank rank={r.rank} />
      <td><b>{r.name}</b></td>
      <td>{r.score} / {r.max_score}</td>
      <td><span className="good">{r.correct}</span> / <span className="bad">{r.wrong}</span></td>
      <td>{fmtDur(r.seconds)}</td>
      <td>{r.percentile}</td>
      {bonus && <td>{r.bonus ? `+${r.bonus}` : "—"}</td>}
    </tr>
  );
}

function ContestBoard({ id }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    setError("");
    api.get(`/leaderboard/contests/${id}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || "Couldn't load this leaderboard"));
  }, [id]);

  if (error) return <div className="card"><p className="error">{error}</p></div>;
  if (!data) return <div className="card"><p className="muted">Loading…</p></div>;

  const { contest: c, rows, me } = data;
  const meOutside = me && !rows.some((r) => r.is_me);
  const cols = data.bonus_active ? 7 : 6;

  return (
    <div className="card">
      <div className="board-head">
        <div>
          <h3>{c.title}</h3>
          <div className="muted small">{when(c.starts_at)} – {when(c.ends_at)}</div>
        </div>
        <span className={`state-chip state-${c.state}`}>{STATE_LABEL[c.state]}</span>
      </div>

      {c.state !== "ended" ? (
        <div className="empty board-wait">
          <p>🔒 Rankings are published when the contest closes at <b>{when(c.ends_at)}</b>.</p>
          <p className="muted">{data.participants} participating · {data.submitted} submitted</p>
        </div>
      ) : rows.length === 0 ? (
        <p className="muted">Nobody took this contest.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table board">
              <thead>
                <tr>
                  <th>Rank</th><th>Student</th><th>Score</th><th>Correct / Wrong</th><th>Time</th><th>Percentile</th>
                  {data.bonus_active && <th>Bonus</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => <ContestRow key={r.attempt_id} r={r} bonus={data.bonus_active} />)}
                {meOutside && (
                  <>
                    <tr className="gap-row"><td colSpan={cols}>⋯</td></tr>
                    <ContestRow r={me} bonus={data.bonus_active} />
                  </>
                )}
              </tbody>
            </table>
          </div>
          {!data.bonus_active && (
            <p className="muted small">Rank bonus points apply when at least {data.min_participants} students take part.</p>
          )}
        </>
      )}
    </div>
  );
}

function PointsBoard() {
  const [period, setPeriod] = useState("week");
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get("/leaderboard/points", { params: { period } })
      .then((r) => setData(r.data))
      .catch(() => setData({ rows: [], me: null, total: 0 }));
  }, [period]);

  const meOutside = data?.me && !data.rows.some((r) => r.is_me);
  const all = period === "all";

  return (
    <div className="card">
      <div className="board-head">
        <div>
          <h3>{all ? "All-time points" : "This week's points"}</h3>
          {data && <div className="muted small">{data.total} student{data.total === 1 ? "" : "s"} ranked</div>}
        </div>
        <div className="seg">
          <button className={!all ? "seg-btn active" : "seg-btn"} onClick={() => setPeriod("week")}>This week</button>
          <button className={all ? "seg-btn active" : "seg-btn"} onClick={() => setPeriod("all")}>All time</button>
        </div>
      </div>
      {!data ? (
        <p className="muted">Loading…</p>
      ) : data.rows.length === 0 ? (
        <p className="muted">No points earned {all ? "yet" : "this week yet"}. Take a test to get on the board.</p>
      ) : (
        <div className="table-wrap">
          <table className="table board">
            <thead><tr><th>Rank</th><th>Student</th>{all && <th>Level</th>}<th>Points</th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className={r.is_me ? "me-row" : ""}>
                  <Rank rank={r.rank} /><td><b>{r.name}</b></td>{all && <td>Lv {r.level}</td>}<td><b>⭐ {r.points}</b></td>
                </tr>
              ))}
              {meOutside && (
                <>
                  <tr className="gap-row"><td colSpan={all ? 4 : 3}>⋯</td></tr>
                  <tr className="me-row">
                    <Rank rank={data.me.rank} /><td><b>You</b></td>{all && <td>Lv {data.me.level}</td>}<td><b>⭐ {data.me.points}</b></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Leaderboard() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "points" ? "points" : "contests";
  const [contests, setContests] = useState(null);

  useEffect(() => {
    api.get("/leaderboard/contests").then((r) => setContests(r.data.contests)).catch(() => setContests([]));
  }, []);

  const selected = Number(params.get("contest")) ||
    contests?.find((c) => c.state === "ended")?.id || contests?.[0]?.id;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Leaderboard</h1>
          <p className="muted">Contest rankings and points standings.</p>
        </div>
        <div className="seg">
          <button className={tab === "contests" ? "seg-btn active" : "seg-btn"} onClick={() => setParams({})}>🏆 Contests</button>
          <button className={tab === "points" ? "seg-btn active" : "seg-btn"} onClick={() => setParams({ tab: "points" })}>⭐ Points</button>
        </div>
      </div>

      {tab === "points" ? (
        <PointsBoard />
      ) : contests === null ? (
        <p className="muted">Loading…</p>
      ) : contests.length === 0 ? (
        <div className="card empty"><p>No contests yet. They'll appear here once one is scheduled.</p></div>
      ) : (
        <div className="board-layout">
          <div className="card contest-list">
            {contests.map((c) => (
              <button key={c.id} className={`contest-item ${c.id === selected ? "active" : ""}`}
                onClick={() => setParams({ contest: String(c.id) })}>
                <span className={`state-dot state-${c.state}`} />
                <div>
                  <b>{c.title}</b>
                  <div className="muted small">{STATE_LABEL[c.state]} · {when(c.starts_at)}</div>
                </div>
                {c.my_status === "submitted" && <span className="tag">Taken</span>}
              </button>
            ))}
          </div>
          {selected && <ContestBoard id={selected} />}
        </div>
      )}
    </div>
  );
}
