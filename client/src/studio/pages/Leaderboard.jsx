import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useSearchParams } from "react-router-dom";
import api from "../../api";
import { Avatar, CountUp } from "../components/Fx";
import { when } from "../components/fxUtils";

const MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };
const STATE_LABEL = { upcoming: "Upcoming", live: "Live now", ended: "Ended" };
// The signed-in student, so their own rows show their real name
const MeName = createContext("You");
const useDisplayName = () => {
  const me = useContext(MeName);
  return (r) => (r.is_me ? me : r.name);
};

const fmtDur = (s) =>
  s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

// Top three on steps: 2nd, 1st, 3rd
function Podium({ rows, value, sub }) {
  const nameOf = useDisplayName();
  // First three rows (ties keep their real rank and medal)
  const top = rows.slice(0, 3);
  const order = [top[1], top[0], top[2]].map((r, i) => r && { r, place: [2, 1, 3][i] }).filter(Boolean);
  if (!top.length) return null;
  return (
    <div className="lb-podium">
      {order.map(({ r, place }) => (
        <div key={r.attempt_id ?? r.id} className={`lb-pod p${place} ${r.is_me ? "me" : ""}`} style={{ "--i": place === 1 ? 2 : place === 2 ? 1 : 3 }}>
          {place === 1 && <span className="lb-crown">👑</span>}
          <Avatar name={nameOf(r)} size={place === 1 ? 64 : 52} />
          <b className="lb-pod-name">{nameOf(r)}{r.is_me && <span className="lb-you">You</span>}</b>
          <span className="lb-pod-value">{value(r)}</span>
          {sub && <small>{sub(r)}</small>}
          <div className="lb-step"><span>{MEDAL[r.rank] || `#${r.rank}`}</span></div>
        </div>
      ))}
    </div>
  );
}

function RankRow({ r, value, detail, max, index }) {
  const nameOf = useDisplayName();
  return (
    <li className={`lb-row ${r.is_me ? "me" : ""}`} style={{ "--i": index }}>
      <span className="lb-rank">{MEDAL[r.rank] || `#${r.rank}`}</span>
      <Avatar name={nameOf(r)} size={34} />
      <div className="lb-row-main">
        <b>{nameOf(r)}{r.is_me && <span className="lb-you">You</span>}</b>
        {detail && <small>{detail(r)}</small>}
        {max > 0 && <div className="lb-bar"><div style={{ width: `${Math.max(2, (Number(value.raw(r)) / max) * 100)}%` }} /></div>}
      </div>
      <span className="lb-row-value">{value.show(r)}</span>
    </li>
  );
}

function MeCard({ rank, total, children }) {
  return (
    <div className="lb-me">
      <span className="lb-me-rank">#{rank}</span>
      <div><b>Your position</b><small>{total ? `out of ${total}` : ""}</small></div>
      <div className="lb-me-extra">{children}</div>
    </div>
  );
}

function ContestBoard({ id }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  // The parent remounts this board (key) when the contest changes, so no reset is needed
  useEffect(() => {
    api.get(`/leaderboard/contests/${id}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || "Couldn't load this leaderboard"));
  }, [id]);

  if (error) return <div className="card"><p className="error">{error}</p></div>;
  if (!data) return <div className="jr-skeleton" style={{ height: 320 }} />;

  const { contest: c, rows, me } = data;
  const meOutside = me && !rows.some((r) => r.is_me);
  const max = Math.max(0, ...rows.map((r) => r.score));
  const value = { raw: (r) => Math.max(0, r.score), show: (r) => <>{r.score}<small> / {r.max_score}</small></> };
  const detail = (r) => (
    <><span className="good">✓ {r.correct}</span> · <span className="bad">✗ {r.wrong}</span> · ⏱ {fmtDur(r.seconds)} · {r.percentile} pct{data.bonus_active && r.bonus ? ` · +${r.bonus} bonus` : ""}</>
  );
  const myRow = rows.find((r) => r.is_me) || me;

  return (
    <div className="card lb-board">
      <div className="lb-board-head">
        <div>
          <h3>{c.title}</h3>
          <small className="muted">{when(c.starts_at)} – {when(c.ends_at)}</small>
        </div>
        <span className={`state-chip state-${c.state}`}>{STATE_LABEL[c.state]}</span>
      </div>

      {c.state !== "ended" ? (
        <div className="lb-locked">
          <span className="lb-lock">🔒</span>
          <p>Rankings are published when the contest closes at <b>{when(c.ends_at)}</b>.</p>
          <div className="lb-locked-stats">
            <div><strong><CountUp value={data.participants} /></strong><small>participating</small></div>
            <div><strong><CountUp value={data.submitted} /></strong><small>submitted</small></div>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="db-empty"><span>🏁</span><p>Nobody took this contest.</p></div>
      ) : (
        <>
          {myRow && (
            <MeCard rank={myRow.rank} total={data.submitted || rows.length}>
              <b>{myRow.score} / {myRow.max_score}</b><small>{myRow.percentile} percentile</small>
            </MeCard>
          )}
          <Podium rows={rows} value={(r) => `${r.score} / ${r.max_score}`} sub={(r) => `⏱ ${fmtDur(r.seconds)}`} />
          <ol className="lb-list">
            {rows.slice(3).map((r, i) => (
              <RankRow key={r.attempt_id} r={r} value={value} detail={detail} max={max} index={i} />
            ))}
            {meOutside && (
              <>
                <li className="lb-gap">⋯</li>
                <RankRow r={{ ...me, is_me: true }} value={value} detail={detail} max={max} index={rows.length} />
              </>
            )}
          </ol>
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
  const [loaded, setLoaded] = useState({});

  useEffect(() => {
    api.get("/leaderboard/points", { params: { period } })
      .then((r) => setLoaded((m) => ({ ...m, [period]: r.data })))
      .catch(() => setLoaded((m) => ({ ...m, [period]: { rows: [], me: null, total: 0 } })));
  }, [period]);
  const data = loaded[period] || null;

  const all = period === "all";
  const rows = data?.rows || [];
  const meOutside = data?.me && !rows.some((r) => r.is_me);
  const max = Math.max(0, ...rows.map((r) => r.points));
  const value = { raw: (r) => r.points, show: (r) => <>⭐ {r.points}</> };
  const detail = all ? (r) => `Level ${r.level}` : null;
  const myRow = rows.find((r) => r.is_me) || (data?.me && { ...data.me, name: "You", is_me: true });

  return (
    <div className="card lb-board">
      <div className="lb-board-head">
        <div>
          <h3>{all ? "All-time points" : "This week's points"}</h3>
          {data && <small className="muted">{data.total} student{data.total === 1 ? "" : "s"} ranked</small>}
        </div>
        <div className="seg">
          <button className={!all ? "seg-btn active" : "seg-btn"} onClick={() => setPeriod("week")}>This week</button>
          <button className={all ? "seg-btn active" : "seg-btn"} onClick={() => setPeriod("all")}>All time</button>
        </div>
      </div>
      {!data ? (
        <div className="jr-skeleton" style={{ height: 260 }} />
      ) : rows.length === 0 ? (
        <div className="db-empty"><span>⭐</span><p>No points earned {all ? "yet" : "this week yet"}. Take a test to get on the board.</p></div>
      ) : (
        <div key={period}>
          {myRow && (
            <MeCard rank={myRow.rank} total={data.total}>
              <b>⭐ {myRow.points}</b>{all && myRow.level && <small>Level {myRow.level}</small>}
            </MeCard>
          )}
          <Podium rows={rows} value={(r) => `⭐ ${r.points}`} sub={all ? (r) => `Level ${r.level}` : null} />
          <ol className="lb-list">
            {rows.slice(3).map((r, i) => (
              <RankRow key={r.id} r={r} value={value} detail={detail} max={max} index={i} />
            ))}
            {meOutside && (
              <>
                <li className="lb-gap">⋯</li>
                <RankRow r={{ ...data.me, name: "You", is_me: true }} value={value} detail={detail} max={max} index={rows.length} />
              </>
            )}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function Leaderboard() {
  const { user } = useAuth();
  return <MeName.Provider value={user?.name || "You"}><LeaderboardPage /></MeName.Provider>;
}

function LeaderboardPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "points" ? "points" : "contests";
  const [contests, setContests] = useState(null);

  useEffect(() => {
    api.get("/leaderboard/contests").then((r) => setContests(r.data.contests)).catch(() => setContests([]));
  }, []);

  const selected = Number(params.get("contest")) ||
    contests?.find((c) => c.state === "ended")?.id || contests?.[0]?.id;

  return (
    <div className="page lb">
      <div className="lb-banner">
        <div>
          <span className="db-eyebrow">Compete and climb</span>
          <h1>Leaderboard</h1>
          <p>Contest rankings and points standings.</p>
        </div>
        <div className="lb-tabs">
          <button className={tab === "contests" ? "active" : ""} onClick={() => setParams({})}>🏆 Contests</button>
          <button className={tab === "points" ? "active" : ""} onClick={() => setParams({ tab: "points" })}>⭐ Points</button>
        </div>
      </div>

      {tab === "points" ? (
        <PointsBoard />
      ) : contests === null ? (
        <div className="jr-skeleton" style={{ height: 320 }} />
      ) : contests.length === 0 ? (
        <div className="card db-empty big"><span>🏆</span><p>No contests yet. They'll appear here once one is scheduled.</p></div>
      ) : (
        <>
          <div className="lb-contests">
            {contests.map((c, i) => (
              <button key={c.id} className={`lb-contest ${c.id === selected ? "active" : ""} s-${c.state}`} style={{ "--i": i }}
                onClick={() => setParams({ contest: String(c.id) })}>
                <span className={`state-dot state-${c.state}`} />
                <div>
                  <b>{c.title}</b>
                  <small>{STATE_LABEL[c.state]} · {when(c.starts_at)}</small>
                </div>
                {c.my_status === "submitted" && <span className="lb-taken">✓ Taken</span>}
              </button>
            ))}
          </div>
          {selected && <ContestBoard key={selected} id={selected} />}
        </>
      )}
    </div>
  );
}
