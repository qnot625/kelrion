export function KlerionMark({ size = 32 }: { readonly size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <span className="brand-mark-core" />
    </span>
  );
}

export function Brand({ compact = false }: { readonly compact?: boolean }) {
  return (
    <div className="brand">
      <KlerionMark size={compact ? 28 : 34} />
      {!compact && <span><strong>Klerion</strong><small>Operations OS</small></span>}
    </div>
  );
}
