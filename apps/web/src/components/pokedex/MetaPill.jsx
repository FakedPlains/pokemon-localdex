/* ─── Meta Pill ─── */
export default function MetaPill({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <span className="drawer-meta-pill">
      <span className="drawer-meta-key">{label}</span>
      <span className="drawer-meta-val">{value}</span>
    </span>
  );
}
