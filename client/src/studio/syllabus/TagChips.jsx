import { SYLLABUS_EXAMS, SYLLABUS_SHORT } from "../constants";

// Shows where a question sits in each syllabus, e.g. "Main · Kinematics › Projectile Motion"
export default function TagChips({ tags, depth = 3 }) {
  const shown = SYLLABUS_EXAMS.filter((e) => tags?.[e]);
  if (!shown.length) return <span className="tag untagged-tag">⚠ Untagged</span>;
  return shown.map((exam) => {
    const parts = tags[exam].path.split(" › ");
    // Skip the subject's cluster to keep chips short; the full path is in the tooltip
    const short = parts.length > depth ? parts.slice(-depth).join(" › ") : parts.join(" › ");
    return (
      <span key={exam} className={`tag tag-path exam-${exam}`} title={tags[exam].path}>
        <b>{SYLLABUS_SHORT[exam]}</b> {short}
      </span>
    );
  });
}
