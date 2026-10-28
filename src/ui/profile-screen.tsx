"use client";

import { EmployeeShell } from "./employee-shell";
import { useEmployee } from "./use-employee";

export function ProfileScreen() {
  const { employee, loading } = useEmployee("funcionario");

  if (loading || !employee) {
    return <p className="p-8 text-[13.5px] text-ink-3">Carregando o perfil…</p>;
  }

  return (
    <EmployeeShell employee={employee} active="perfil">
      <header className="flex h-16 items-center border-b border-rule px-8">
        <p className="flex items-center gap-2 text-[13.5px]">
          <span className="text-ink-3">Service desk de TI</span>
          <Chevron />
          <span className="font-semibold">Meu perfil</span>
        </p>
      </header>
      <section data-region="perfil" className="flex flex-1 justify-center px-10 py-12">
        <div className="flex w-[600px] max-w-full flex-col gap-8">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[24px] font-bold tracking-[-0.4px]">Meu perfil</h1>
            <p className="text-[14.5px] text-ink-3">Seus dados de acesso ao service desk de TI.</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#1B243117]">
            <div className="flex items-center gap-4 border-b border-rule px-6 py-5">
              <p className="w-40 text-[13.5px] text-ink-3">Nome</p>
              <p className="text-[14.5px] font-medium">{employee.name}</p>
            </div>
            <div className="flex items-center gap-4 px-6 py-5">
              <p className="w-40 text-[13.5px] text-ink-3">E-mail corporativo</p>
              <p className="text-[14.5px] font-medium">{employee.email}</p>
              <p className="ml-auto flex items-center gap-1 text-[12.5px] text-ink-3">
                <LockIcon />
                Gerenciado pela TI
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#1B243117]">
            <div className="flex items-center gap-4 p-6">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-desk text-ink-2">
                <KeyIcon />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold">Senha</p>
                <p className="text-[13.5px] text-ink-3">Alterada há 42 dias</p>
              </div>
              <span className="flex h-9 items-center gap-1.5 rounded-lg border border-[#1B24311F] pr-3.5 pl-3 text-[13.5px] font-medium text-ink-2">
                <RefreshIcon />
                Redefinir senha
              </span>
            </div>
            <p className="flex items-center gap-2 border-t border-rule bg-desk px-6 py-3 text-[13px] text-ink-3">
              Não enviamos e-mail. A senha de demonstração continua sendo qualquer uma.
            </p>
          </div>
        </div>
      </section>
    </EmployeeShell>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.2-5.5" />
      <path d="M20 4v5h-5" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="8" cy="14" r="4" />
      <path d="M11.5 12.5L20 4l-2 2M16 6l2 2" />
    </svg>
  );
}
