import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api";
import ExamScreen from "./ExamScreen";
import ResultView from "./ResultView";

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

  return data.attempt.status === "submitted"
    ? <ResultView data={data} />
    : <ExamScreen key={data.attempt.id} data={data} onSubmitted={load} />;
}
