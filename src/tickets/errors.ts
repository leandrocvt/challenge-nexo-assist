export class TicketUnavailableError extends Error {
  constructor() {
    super("O serviço de chamados está indisponível. Tente de novo.");
    this.name = "TicketUnavailableError";
  }
}

export class TicketNotFoundError extends Error {
  constructor() {
    super("Chamado não encontrado.");
    this.name = "TicketNotFoundError";
  }
}

export class TicketRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TicketRuleError";
  }
}
