type OrquestraLoaderProps = { label?: string };

export function OrquestraLoader({ label = "Carregando" }: OrquestraLoaderProps) {
  return <span className="orquestra-loader" role="status" aria-live="polite">
    <span className="orquestra-loader-mark" aria-hidden="true">
      <img src="/branding/orquestra-cs/symbol-o.png" alt="" />
    </span>
    <span>{label}…</span>
  </span>;
}
