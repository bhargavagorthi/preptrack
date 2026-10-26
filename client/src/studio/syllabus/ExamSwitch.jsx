import { useState } from "react";
import api from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { SYLLABUS_EXAMS, SYLLABUS_LABEL } from "../constants";

// Lets a student switch (and remember) which syllabus they follow
export default function ExamSwitch({ value, onChange }) {
  const { setUser } = useAuth();
  const [busy, setBusy] = useState(false);

  async function pick(exam) {
    if (exam === value || busy) return;
    setBusy(true);
    try {
      const { data } = await api.patch("/auth/me", { target_exam: exam });
      setUser((u) => ({ ...u, target_exam: data.user.target_exam }));
      onChange(exam);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="seg exam-switch" title="Which syllabus you follow. You can switch any time.">
      {SYLLABUS_EXAMS.map((e) => (
        <button key={e} className={value === e ? "seg-btn active" : "seg-btn"} onClick={() => pick(e)} disabled={busy}>
          {SYLLABUS_LABEL[e]}
        </button>
      ))}
    </div>
  );
}
