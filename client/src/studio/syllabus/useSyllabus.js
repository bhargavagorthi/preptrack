import { useCallback, useEffect, useState } from "react";
import api from "../../api";

// Loaded trees are shared across pages until something changes them
const cache = new Map();
const listeners = new Set();

// Index a flat node list: children by parent, and each node's chain of ancestors
export function indexTree(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map();
  for (const n of nodes) {
    const k = n.parent_id ?? "root";
    if (!children.has(k)) children.set(k, []);
    children.get(k).push(n);
  }
  const chain = (id) => {
    const out = [];
    let n = byId.get(id);
    while (n) {
      out.unshift(n);
      n = n.parent_id ? byId.get(n.parent_id) : null;
    }
    return out;
  };
  return { nodes, byId, children, chain, roots: children.get("root") || [] };
}

export function invalidateSyllabus(exam) {
  if (exam) cache.delete(exam);
  else cache.clear();
  listeners.forEach((fn) => fn(exam));
}

async function fetchTree(exam) {
  if (!cache.has(exam)) {
    cache.set(exam, api.get("/syllabus", { params: { exam } }).then((r) => indexTree(r.data.nodes)));
  }
  try {
    return await cache.get(exam);
  } catch (err) {
    cache.delete(exam);
    throw err;
  }
}

// const { tree, loading, error, reload } = useSyllabus("jee_main")
export function useSyllabus(exam) {
  const [state, setState] = useState({ tree: null, loading: true, error: "" });

  const load = useCallback(() => {
    if (!exam) return;
    setState((s) => ({ ...s, loading: true }));
    fetchTree(exam)
      .then((tree) => setState({ tree, loading: false, error: "" }))
      .catch(() => setState({ tree: null, loading: false, error: "Couldn't load the syllabus" }));
  }, [exam]);

  useEffect(() => {
    load();
    const onChange = (changed) => {
      if (!changed || changed === exam) load();
    };
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, [exam, load]);

  const reload = useCallback(() => invalidateSyllabus(exam), [exam]);
  return { ...state, reload };
}
