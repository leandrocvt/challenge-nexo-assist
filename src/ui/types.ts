export type Trace = {
  intent: string;
  evidence: Array<{ source: string; id: string; note: string }>;
  citedRule: string;
  appliedRule: string;
  proposedAction: string;
  takenAction: string;
  confidence: string;
  policyRefused: boolean;
  transferReason: string | null;
  priority: string | null;
  slaDueAt: string | null;
};

export type HistoryMessage = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  countsTowardLimit: boolean;
  visibleActions: string[];
  options: string[];
  trace: Trace | null;
};

export type DraftCard = {
  id: string;
  publicCode: string;
  status: string;
  operation: "create" | "update" | "reopen";
  title: string;
  description: string;
  type: string;
  category: string;
  priority: string;
  slaDueAt: string;
  targetTicketId: string | null;
  impact?: "pessoa" | "equipe" | "empresa";
};

export type History = {
  messages: HistoryMessage[];
  draft: DraftCard | null;
  session: { messageCount: number; limit: number };
};

export type TicketCard = {
  id: string;
  title: string;
  description: string;
  category: string;
  subjectDetail: string | null;
  priority: string;
  status: string;
  slaDueAt: string;
  createdAt?: string;
  updatedAt?: string;
  overdue: boolean;
};

export type QueueItem = {
  id: string;
  employeeId: string;
  employeeName: string;
  state: string;
  analystId: string | null;
  transferReason: string | null;
  transferSummary: string | null;
  lastMessage: string | null;
  updatedAt: string;
};
