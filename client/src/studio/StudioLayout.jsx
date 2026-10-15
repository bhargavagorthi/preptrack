import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const ROLE_LABEL = {
  student: "Student", creator: "Creator", teacher: "Teacher", organiser: "Organiser", admin: "Admin",
};

export default function StudioLayout({ items, children }) {
  const { user, logout } = useAuth();
  const initials = user.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand-sm">PrepTrack</div>
        <input className="search" placeholder="Search chapters, tests, questions…" />
        <div className="user-chip">
          <span className="role-badge">{ROLE_LABEL[user.role]}</span>
          <span className="avatar" title={user.name}>{initials}</span>
          <button className="ghost" onClick={logout}>Log out</button>
        </div>
      </header>
      <aside className="sidebar">
        <nav>
          {items.map((i) => (
            <NavLink
              key={i.path || "home"}
              to={i.path ? `/studio/${i.path}` : "/studio"}
              end={!i.path}
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
            >
              <span>{i.icon}</span>
              {i.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="studio-main">{children}</main>
    </div>
  );
}
