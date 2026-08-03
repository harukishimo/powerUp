import Link from "next/link";

export function HabitTabs({ active }: { active: "calendar" | "manage" }) {
  return (
    <nav className="habit-tabs" aria-label="継続メニュー">
      <Link className={active === "calendar" ? "active" : ""} href="/habits">
        <span aria-hidden="true">▦</span>
        カレンダー
      </Link>
      <Link className={active === "manage" ? "active" : ""} href="/habits/manage">
        <span aria-hidden="true">☷</span>
        継続項目の管理
      </Link>
    </nav>
  );
}
