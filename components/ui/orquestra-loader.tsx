type OrquestraLoaderProps = { label?: string };

export function OrquestraLoader({ label = "Carregando" }: OrquestraLoaderProps) {
  return <span className="orquestra-loader" role="status" aria-live="polite">
    <span className="orquestra-loader-mark" aria-hidden="true">
      <svg className="orquestra-loader-plate" viewBox="0 0 48 48" focusable="false">
        <circle cx="24" cy="24" r="18" fill="#c78a46" />
        <circle cx="24" cy="24" r="13.5" fill="#8b5b2f" stroke="#f1c27d" strokeOpacity=".72" strokeWidth="1.2" />
        <circle cx="24" cy="24" r="6" fill="#071625" stroke="#f1c27d" strokeOpacity=".9" strokeWidth="1.4" />
        <path d="M12.5 16.5c3.4-4.8 8.6-7.2 14.4-6.8" fill="none" stroke="#ffe0a9" strokeLinecap="round" strokeOpacity=".8" strokeWidth="2" />
        <path d="M10 28.5c1.3 5.7 5.1 10 10.2 12.1" fill="none" stroke="#6c431e" strokeLinecap="round" strokeOpacity=".75" strokeWidth="2" />
      </svg>
    </span>
    <span>{label}…</span>
  </span>;
}
