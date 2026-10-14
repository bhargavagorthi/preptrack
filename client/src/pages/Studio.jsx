import { useAuth } from "../auth/AuthContext";

export default function Studio() {
  const { user, logout } = useAuth();
  return (
    <div className="center">
      <h1>Welcome, {user.name}</h1>
      <p className="muted">You're in the <strong>{user.role}</strong> studio.</p>
      <button onClick={logout}>Log out</button>
    </div>
  );
}
