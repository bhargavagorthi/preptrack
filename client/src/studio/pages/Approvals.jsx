import { useEffect, useState } from "react";
import api from "../../api";

export default function Approvals() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/admin/pending")
      .then((res) => setUsers(res.data.users))
      .catch((e) => setError(e.response?.data?.error || "Couldn't load pending accounts"))
      .finally(() => setLoading(false));
  }, []);

  async function decide(id, status) {
    try {
      await api.patch(`/admin/users/${id}`, { status });
      setUsers((list) => list.filter((u) => u.id !== id));
    } catch (e) {
      setError(e.response?.data?.error || "Update failed");
    }
  }

  return (
    <div className="page">
      <h1>Approvals</h1>
      <p className="muted">Creator, teacher and organiser accounts waiting for review.</p>
      {error && <p className="error">{error}</p>}
      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : users.length === 0 ? (
          <p className="muted">No pending accounts. 🎉</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Signed up</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className="role-badge">{u.role}</span></td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="actions">
                    <button onClick={() => decide(u.id, "active")}>Approve</button>
                    <button className="ghost" onClick={() => decide(u.id, "suspended")}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
