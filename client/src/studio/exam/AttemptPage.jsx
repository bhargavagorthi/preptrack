import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../../api";
import ExamScreen from "./ExamScreen";
import ResultView from "./ResultView";

function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return d ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function ContestLocked({ attempt, lockedUntil, onOpen }) {
  const end = new Date(lockedUntil).getTime();
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (now >= end + 2000 && !fired.current) {
      fired.current = true;
      onOpen();
    }
  }, [now, end, onOpen]);

  return (
    <div className="page">
      <Link to="/studio/tests" className="link-btn">← All tests</Link>
      <div className="card locked-card">
        <div className="locked-icon">🔒</div>
        <h1>{attempt.title}</h1>
        <p><b>✅ Your answers are submitted.</b></p>
        <p className="muted">
          Your score, solutions and rank will be revealed when the contest closes, so nobody can share answers while
          others are still writing.
        </p>
        <div className="locked-clock">{clock(end - now)}</div>
        <p className="muted small">
          Results open {new Date(lockedUntil).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}.
          This page will update automatically.
        </p>
      </div>
    </div>
  );
}

export default function AttemptPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.get(`/student/attempts/${id}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.error || "Couldn't load this test"));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) return <div className="page"><p className="muted">Loading…</p></div>;

  if (data.attempt.status === "submitted" && data.locked_until) {
    return <ContestLocked key={data.locked_until} attempt={data.attempt} lockedUntil={data.locked_until} onOpen={load} />;
  }
  return data.attempt.status === "submitted"
    ? <ResultView data={data} />
    : <ExamScreen key={data.attempt.id} data={data} onSubmitted={load} />;
}
