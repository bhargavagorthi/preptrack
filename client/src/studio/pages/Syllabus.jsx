import { useEffect, useState } from "react";
import api from "../../api";

function Column({ title, items, selectedId, onSelect, onAdd, onRename, onDelete, placeholder, disabledText }) {
  const [name, setName] = useState("");

  if (disabledText) {
    return (
      <div className="col">
        <h3>{title}</h3>
        <p className="muted col-empty">{disabledText}</p>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd(name.trim());
    setName("");
  }

  function rename(e, item) {
    e.stopPropagation();
    const next = prompt("Rename", item.name);
    if (next && next.trim() && next.trim() !== item.name) onRename(item.id, next.trim());
  }

  function remove(e, item) {
    e.stopPropagation();
    if (confirm(`Delete "${item.name}" and everything inside it?`)) onDelete(item.id);
  }

  return (
    <div className="col">
      <h3>
        {title} <span className="count">{items.length}</span>
      </h3>
      <ul className="col-list">
        {items.map((item) => (
          <li
            key={item.id}
            className={item.id === selectedId ? "selected" : ""}
            onClick={() => onSelect?.(item.id)}
          >
            <span>{item.name}</span>
            <span className="row-actions">
              <button className="icon" title="Rename" onClick={(e) => rename(e, item)}>✏️</button>
              <button className="icon" title="Delete" onClick={(e) => remove(e, item)}>🗑️</button>
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="empty-row">Nothing here yet</li>}
      </ul>
      <form className="add-row" onSubmit={submit}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} />
        <button>Add</button>
      </form>
    </div>
  );
}

export default function Syllabus() {
  const [subjects, setSubjects] = useState([]);
  const [subjectId, setSubjectId] = useState(null);
  const [chapterId, setChapterId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    const { data } = await api.get("/syllabus");
    setSubjects(data.subjects);
  }

  useEffect(() => {
    load().catch(() => setError("Couldn't load the syllabus"));
  }, []);

  // Run a change, then reload the tree; show any server error
  async function run(action) {
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(e.response?.data?.error || "Something went wrong");
    }
  }

  const crud = (level, parent = {}) => ({
    onAdd: (name) => run(() => api.post(`/syllabus/${level}`, { name, ...parent })),
    onRename: (id, name) => run(() => api.patch(`/syllabus/${level}/${id}`, { name })),
    onDelete: (id) => run(() => api.delete(`/syllabus/${level}/${id}`)),
  });

  const subject = subjects.find((s) => s.id === subjectId);
  const chapter = subject?.chapters.find((c) => c.id === chapterId);

  return (
    <div className="page">
      <h1>Syllabus</h1>
      <p className="muted">Organise subjects into chapters and topics. Questions will be tagged to topics.</p>
      {error && <p className="error">{error}</p>}
      <div className="columns">
        <Column
          title="Subjects"
          items={subjects}
          selectedId={subjectId}
          onSelect={(id) => { setSubjectId(id); setChapterId(null); }}
          placeholder="New subject"
          {...crud("subjects")}
        />
        <Column
          title="Chapters"
          items={subject?.chapters || []}
          selectedId={chapterId}
          onSelect={setChapterId}
          placeholder="New chapter"
          disabledText={!subject && "Select a subject"}
          {...crud("chapters", { subject_id: subjectId })}
        />
        <Column
          title="Topics"
          items={chapter?.topics || []}
          placeholder="New topic"
          disabledText={!chapter && "Select a chapter"}
          {...crud("topics", { chapter_id: chapterId })}
        />
      </div>
    </div>
  );
}
