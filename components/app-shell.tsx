import Link from "next/link";

type NavKey = "today" | "logs" | "habits" | "focus" | "analysis" | "settings";

const navItems: Array<{ key: NavKey; label: string; icon: string; href: string }> = [
  { key: "today", label: "今日", icon: "⌂", href: "/" },
  { key: "logs", label: "ログ", icon: "▣", href: "/logs" },
  { key: "habits", label: "継続", icon: "◎", href: "/habits" },
  { key: "focus", label: "集中", icon: "◉", href: "/focus" },
  { key: "analysis", label: "分析", icon: "⌁", href: "/#trend" },
  { key: "settings", label: "設定", icon: "⚙", href: "/#settings" },
];

export function AppShell({ children, active }: { children: React.ReactNode; active: NavKey }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">p<span>U</span></span>
          <span>powerUp</span>
        </Link>
        <p className="sidebar-caption">生産性の条件を見つける</p>
        <nav className="sidebar-nav" aria-label="メインナビゲーション">
          {navItems.map((item) => (
            <Link key={item.key} href={item.href} className={`nav-item ${active === item.key ? "active" : ""}`}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {active === item.key ? <span className="nav-active-dot" aria-hidden="true" /> : null}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">H</div>
          <div><strong>Haruki</strong><span>Personal workspace</span></div>
          <span className="status-dot" aria-label="同期中" />
        </div>
      </aside>
      <div className="mobile-topbar">
        <Link className="brand" href="/"><span className="brand-mark">p<span>U</span></span><span>powerUp</span></Link>
        <Link className="mobile-log-link" href="/logs">ログを見る →</Link>
      </div>
      <div className="mobile-nav" aria-label="モバイルナビゲーション">
        {navItems.map((item) => <Link key={item.key} href={item.href} className={active === item.key ? "active" : ""}><span>{item.icon}</span>{item.label}</Link>)}
      </div>
      {children}
    </div>
  );
}
