"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ApiError, api, type Employee } from "./api";
import { Mark } from "./mark";

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("ana.souza@nexo.com.br");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body = await api<{ employee: Employee }>("/api/login", {
        method: "POST",
        body: JSON.stringify({ email, password, remember }),
      });
      router.push(body.employee.role === "analista" ? "/console" : "/atendimento");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-[800px_minmax(0,1fr)]">
      <section data-region="vitrine" className="flex flex-col justify-between bg-ink px-16 pt-10 pb-12 text-white">
        <div className="flex items-center gap-2.5">
          <Mark className="h-6 w-6" color="#FFFFFF" />
          <p className="text-[17px] font-bold tracking-[-0.2px]">Nexo Assist</p>
        </div>
        <div className="flex max-w-[640px] flex-col gap-9">
          <div className="flex flex-col gap-[18px]">
            <p className="text-[13.5px] font-medium text-white/55">Service desk de TI da Nexo</p>
            <h1 className="font-display text-[54px] leading-[1.04] tracking-[-1.2px]">
              Seu problema de TI, resolvido em uma conversa.
            </h1>
            <p className="max-w-[520px] text-[16px] leading-[1.55] text-white/65">
              Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um
              analista quando precisa.
            </p>
          </div>
          <div className="pl-24">
            <div className="flex w-[500px] max-w-full flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/5 p-[18px]">
              <div className="flex justify-end">
                <p className="rounded-[12px_12px_4px_12px] bg-paper px-3.5 py-2 text-[13.5px] text-ink">
                  Meu notebook não conecta na VPN. Erro 809.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-[12.5px] text-white/70">
                  <span className="font-semibold text-white/80">Nexo Assist</span>
                  <span className="text-white/45"> · consultou seus chamados · criou um chamado</span>
                </p>
                <p className="w-[380px] max-w-full rounded-[4px_12px_12px_12px] bg-white/10 px-3.5 py-2.5 text-[13.5px] leading-normal">
                  Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
                </p>
                <p className="flex w-fit items-center gap-2 rounded-xl bg-paper px-3 py-1.5 text-[12.5px] text-ink">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  <span className="font-semibold">INC-20517</span>
                  <span className="text-ink-3">Rede e VPN · Alta · em até 4 h</span>
                </p>
              </div>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-3 border-t border-white/10 pt-6">
          <div className="flex flex-col gap-1.5">
            <dd className="font-display text-[34px] tracking-[-0.6px]">8 s</dd>
            <dt className="text-[13.5px] text-white/55">primeira resposta, em média</dt>
          </div>
          <div className="flex flex-col gap-1.5 border-l border-white/10 pl-6">
            <dd className="font-display text-[34px] tracking-[-0.6px]">72%</dd>
            <dt className="text-[13.5px] text-white/55">resolvidos sem fila</dt>
          </div>
          <div className="flex flex-col gap-1.5 border-l border-white/10 pl-6">
            <dd className="flex items-center gap-2 font-display text-[34px] tracking-[-0.6px]">
              6 <span className="h-2 w-2 rounded-full bg-success" />
            </dd>
            <dt className="text-[13.5px] text-white/55">analistas online agora</dt>
          </div>
        </dl>
      </section>
      <section data-region="login" className="flex flex-col justify-between px-14 py-10">
        <p className="flex justify-end gap-1.5 text-[13.5px] text-ink-3">
          Problema para entrar?
          <span className="font-semibold text-primary-text">Ligue no ramal 4000</span>
        </p>
        <form onSubmit={submit} className="mx-auto flex w-[380px] max-w-full flex-col gap-7">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-[40px] leading-[1.1] tracking-[-0.8px]">Entrar</h2>
            <p className="text-[15.5px] leading-normal text-ink-3">Use seu e-mail corporativo e a senha da rede Nexo.</p>
          </div>
          <div className="flex flex-col gap-[18px]">
            <label className="flex flex-col gap-2 text-[13.5px] font-medium" htmlFor="email">
              E-mail corporativo
              <span className="flex h-11 items-center gap-2.5 rounded-lg border border-[#1B24311F] px-3.5">
                <MailIcon />
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full bg-transparent text-[14.5px] font-normal outline-none"
                />
              </span>
            </label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[13.5px]">
                <label className="font-medium" htmlFor="password">
                  Senha
                </label>
                <button
                  type="button"
                  className="font-medium text-primary-text"
                  onClick={() => setHelp("Não enviamos e-mail. Para os funcionários de exemplo, qualquer senha entra.")}
                >
                  Esqueci minha senha
                </button>
              </div>
              <span className="flex h-11 items-center gap-2.5 rounded-lg border border-cta pr-2 pl-3.5 focus-within:border-cta">
                <LockIcon />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full bg-transparent text-[14.5px] font-normal tracking-[2px] outline-none"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                  className="grid h-[30px] w-[30px] place-items-center rounded-md text-ink-3"
                  onClick={() => setShowPassword((current) => !current)}
                >
                  <EyeIcon off={showPassword} />
                </button>
              </span>
            </div>
            <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="sr-only" />
              <span className={`grid h-[18px] w-[18px] place-items-center rounded-md ${remember ? "bg-cta text-white" : "border border-[#1B24311F]"}`}>
                {remember ? <CheckIcon /> : null}
              </span>
              Manter conectado neste computador
            </label>
          </div>
          <button
            type="submit"
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-cta text-[15.5px] font-semibold text-white disabled:opacity-70"
            disabled={loading}
          >
            {loading ? "Entrando…" : "Entrar"}
            {loading ? null : <ArrowIcon />}
          </button>
          {error ? (
            <p role="alert" className="text-[13.5px] text-danger-text">
              {error}
            </p>
          ) : null}
          {help ? <p className="border-t border-rule pt-4 text-[13.5px] text-ink-2">{help}</p> : null}
        </form>
        <div className="flex justify-between text-[12.5px] text-ink-3">
          <p>© 2026 Nexo · Service desk de TI</p>
          <p>Privacidade e uso de dados</p>
        </div>
      </section>
    </main>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 7 9-7" />
    </svg>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
      {off ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <path d="M5 12.5l4.2 4.2L19 7.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-primary-text" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
