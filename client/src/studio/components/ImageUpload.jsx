import { useRef, useState } from "react";
import api from "../../api";

export default function ImageUpload({ value, onChange, label = "Add image" }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/uploads", form);
      onChange(data.url);
    } catch (err) {
      setError(err.response?.data?.error || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="img-upload">
      {value ? (
        <div className="img-preview">
          <img src={value} alt="" />
          <button type="button" className="ghost small" onClick={() => onChange("")}>Remove</button>
        </div>
      ) : (
        <button type="button" className="ghost small" onClick={() => input.current.click()} disabled={busy}>
          {busy ? "Uploading…" : `🖼 ${label}`}
        </button>
      )}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={pick} />
      {error && <span className="error small">{error}</span>}
    </div>
  );
}
