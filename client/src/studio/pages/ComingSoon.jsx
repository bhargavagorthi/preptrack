export default function ComingSoon({ title, text }) {
  return (
    <div className="page">
      <h1>{title}</h1>
      <div className="card empty">
        <p>{text}</p>
        <span className="badge">Coming soon</span>
      </div>
    </div>
  );
}
