export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : "Não foi possível concluir.";
    throw new ApiError(error, response.status);
  }
  return body as T;
}

export type Employee = {
  id: string;
  name: string;
  email: string;
  role: "funcionario" | "analista";
  level: "N1" | "N2" | null;
};

export function hourInSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function openedAtLabel(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function daysAgo(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) {
    return "hoje";
  }
  if (days === 1) {
    return "há 1 dia";
  }
  return `há ${days} dias`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function priorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    critica: "Crítica",
    alta: "Alta",
    media: "Média",
    baixa: "Baixa",
  };
  return labels[priority] ?? priority;
}

export function confidenceLabel(confidence: string): string {
  if (confidence === "baixo") {
    return "baixo · 41%";
  }
  if (confidence === "medio") {
    return "médio · 60%";
  }
  if (confidence === "alto") {
    return "alto · 90%";
  }
  return confidence;
}
