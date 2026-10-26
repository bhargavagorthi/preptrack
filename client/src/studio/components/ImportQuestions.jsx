import { useState } from "react";
import api from "../../api";
import { TYPE_LABEL } from "../constants";

export default function ImportQuestions({ onCancel, onDone }) {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function downloadTemplate() {
    setError("");
    try {
      const { data } = await api.get("/questions/import/template", { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "preptrack-questions-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't download the template");
    }
  }

  async function preview() {
    if (!file) return;
    setError("");
    setRows(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/questions/import/preview", form);
      setRows(data.rows);
    } catch (e) {
      setError(e.response?.data?.error || "Couldn't check the file");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setError("");
    setBusy(true);
    try {
      const valid = rows.filter((r) => r.ok).map((r) => r.raw);
      const { data } = await api.post("/questions/import/commit", { rows: valid });
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.error || "Import failed. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="page">
        <h1>Import complete</h1>
        <div className="card empty">
          <p style={{ fontSize: 18, color: "var(--text)" }}>
            ✅ Imported <b>{result.imported}</b> question{result.imported === 1 ? "" : "s"}
            {result.skipped > 0 && <> · skipped {result.skipped}</>}
          </p>
          <button onClick={onDone}>Back to Question Bank</button>
        </div>
      </div>
    );
  }

  const validCount = rows?.filter((r) => r.ok).length || 0;
  const badCount = rows ? rows.length - validCount : 0;
  const shown = rows ? (onlyProblems ? rows.filter((r) => !r.ok) : rows) : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Import questions</h1>
          <p className="muted">Upload many questions at once from an Excel file.</p>
        </div>
        <button className="ghost" onClick={onCancel}>Cancel</button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card step">
        <span className="step-num">1</span>
        <div>
          <h3>Get the template</h3>
          <p className="muted">
            Each row has a <b>main_path</b> and/or <b>advanced_path</b>, e.g. <code>Physics &gt; Kinematics &gt; Projectile Motion</code>.
            The <b>Valid paths</b> sheets list every chapter, topic, subtopic and section. The import never creates syllabus entries.
          </p>
          <button className="ghost" onClick={downloadTemplate}>⬇ Download template</button>
        </div>
      </div>

      <div className="card step">
        <span className="step-num">2</span>
        <div>
          <h3>Upload your file</h3>
          <div className="upload-row">
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => { setFile(e.target.files[0] || null); setRows(null); }}
            />
            <button onClick={preview} disabled={!file || busy}>
              {busy && !rows ? "Checking…" : "Check file"}
            </button>
          </div>
        </div>
      </div>

      {rows && (
        <div className="card">
          <div className="import-summary">
            <span className="pill ok">✓ {validCount} ready</span>
            {badCount > 0 && <span className="pill bad">✗ {badCount} with problems</span>}
            {badCount > 0 && (
              <label className="toggle">
                <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
                Show only problems
              </label>
            )}
            <button className="push-right" onClick={commit} disabled={!validCount || busy}>
              {busy ? "Importing…" : `Import ${validCount} question${validCount === 1 ? "" : "s"}`}
            </button>
          </div>
          {badCount > 0 && (
            <p className="muted" style={{ marginBottom: 12 }}>
              Rows with problems will be skipped. Fix them in the file and upload again to include them.
            </p>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Row</th><th></th><th>Syllabus</th><th>Type</th><th>Question</th><th>Problems</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.row} className={r.ok ? "" : "row-bad"}>
                    <td>{r.row}</td>
                    <td>{r.ok ? "✅" : "❌"}</td>
                    <td className="path-cell">{r.path}</td>
                    <td>{TYPE_LABEL[r.type] || r.type}</td>
                    <td className="clip">{r.text}</td>
                    <td className="problems">{r.errors.join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
