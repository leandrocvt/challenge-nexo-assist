"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { api, initials, type Employee } from "./api";
import { Mark } from "./mark";

export function EmployeeShell({
  employee,
  active,
  children,
}: {
  employee: Employee;
  active: "atendimento" | "perfil";
  children: ReactNode;
}) {
  const router = useRouter();

  async function logout() {
    await api("/api/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <div className="grid h-dvh grid-cols-[232px_minmax(0,1fr)] bg-paper text-ink">
      <aside data-region="sidebar" className="flex flex-col border-r border-rule px-3.5 pt-5 pb-3.5">
        <div className="flex items-center gap-2.5 px-2">
          <Mark className="h-5 w-5" color="#037AF6" />
          <p className="text-[16px] font-bold tracking-[-0.2px]">Nexo Assist</p>
        </div>
        <div className="h-[22px]" />
        <nav className="flex flex-col gap-0.5">
          <NavLink href="/atendimento" label="Atendimento" icon="chat" selected={active === "atendimento"} />
          <NavLink href="/perfil" label="Meu perfil" icon="user" selected={active === "perfil"} />
        </nav>
        <div className="mt-auto flex items-center gap-2.5 border-t border-rule px-2 pt-3.5 pb-1">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-primary-soft text-[12.5px] font-bold text-primary-text">
            {initials(employee.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold">{employee.name}</span>
            <span className="block truncate text-[11.5px] text-ink-3">{employee.email}</span>
          </span>
        </div>
        <button
          type="button"
          className="mt-1 flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-ink-2"
          onClick={() => void logout()}
        >
          <LogoutIcon className="text-ink-3" />
          Sair
        </button>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-col">{children}</div>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon,
  selected,
}: {
  href: string;
  label: string;
  icon: "chat" | "user";
  selected: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] ${
        selected ? "bg-primary-soft font-semibold text-primary-text" : "font-medium text-ink-2"
      }`}
    >
      {icon === "chat" ? <ChatIcon selected={selected} /> : <UserIcon selected={selected} />}
      {label}
    </Link>
  );
}

function ChatIcon({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 ${selected ? "" : "text-ink-3"}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function UserIcon({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 ${selected ? "" : "text-ink-3"}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19.2c1.4-3 3.8-4.4 7-4.4s5.6 1.4 7 4.4" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 ${className ?? ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
