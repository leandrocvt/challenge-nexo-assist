import type { Client } from "@libsql/client";

import { Attendance } from "../attendance/service";
import { ConversationStore } from "../conversations/store";
import { Directory } from "../session/directory";
import { databaseFile, migrate, openDatabase } from "../tickets/db";
import { TicketService } from "../tickets/service";

export type App = {
  client: Client;
  tickets: TicketService;
  directory: Directory;
  conversations: ConversationStore;
  attendance: Attendance;
  close: () => void;
};

let current: App | null = null;
let opening: Promise<App> | null = null;

export async function openApp(filePath: string): Promise<App> {
  const client = openDatabase(filePath);
  await migrate(client);
  const tickets = TicketService.bind(client);
  await tickets.seed(new Date());
  const conversations = new ConversationStore(client);
  return {
    client,
    tickets,
    directory: new Directory(client),
    conversations,
    attendance: new Attendance(client, tickets, conversations),
    close: () => closeClient(client),
  };
}

export function getApp(): Promise<App> {
  if (current) {
    return Promise.resolve(current);
  }
  if (!opening) {
    const filePath = process.env.NEXO_DB_PATH ?? databaseFile();
    opening = openApp(filePath)
      .then((app) => {
        current = app;
        return app;
      })
      .finally(() => {
        opening = null;
      });
  }
  return opening;
}

export function closeApp(): void {
  const app = current;
  current = null;
  opening = null;
  app?.close();
}

function closeClient(client: Client): void {
  client.close();
}
