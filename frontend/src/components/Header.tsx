export function Header() {
  return (
    <header className="header">
      <svg className="header__mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" />
        <path d="M9 11h6M12 8v6M18 11h6M9 21h6M18 19l5 5M23 19l-5 5" />
      </svg>
      <h1 className="header__title">Calculator</h1>
    </header>
  );
}
