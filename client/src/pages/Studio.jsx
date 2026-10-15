import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import StudioLayout from "../studio/StudioLayout";
import { NAV } from "../studio/nav";

export default function Studio() {
  const { user } = useAuth();
  const items = NAV[user.role] || [];

  return (
    <StudioLayout items={items}>
      <Routes>
        {items.map((i) =>
          i.path ? (
              <Route key={i.path} path={`${i.path}/*`} element={i.element} />
          ) : (
            <Route key="home" index element={i.element} />
          )
        )}
        <Route path="*" element={<Navigate to="/studio" replace />} />
      </Routes>
    </StudioLayout>
  );
}
