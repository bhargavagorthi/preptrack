// Three linked dropdowns: subject → chapter → topic
export default function SyllabusPicker({ tree, value, onChange, allowAny = false }) {
  const subject = tree.find((s) => s.id === Number(value.subject_id));
  const chapter = subject?.chapters.find((c) => c.id === Number(value.chapter_id));

  return (
    <>
      <select
        value={value.subject_id || ""}
        onChange={(e) => onChange({ subject_id: e.target.value, chapter_id: "", topic_id: "" })}
      >
        <option value="">{allowAny ? "All subjects" : "Subject"}</option>
        {tree.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select
        value={value.chapter_id || ""}
        disabled={!subject}
        onChange={(e) => onChange({ chapter_id: e.target.value, topic_id: "" })}
      >
        <option value="">{allowAny ? "All chapters" : "Chapter"}</option>
        {subject?.chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select
        value={value.topic_id || ""}
        disabled={!chapter}
        onChange={(e) => onChange({ topic_id: e.target.value })}
      >
        <option value="">{allowAny ? "All topics" : "Topic"}</option>
        {chapter?.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </>
  );
}
