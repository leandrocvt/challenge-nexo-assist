import type { Client } from "@libsql/client";

import { ConversationStore } from "../conversations/store";
import { Directory } from "../session/directory";
import { databaseFile, migrate, openDatabase } from "../tickets/db";
import { TicketService } from "../tickets/service";

export type App = {
  tickets: TicketService;
  directory: Directory;
  conversations: ConversationStore;
  close: () => void;
};

let current: App | null = null;
let opening: Promise<App> | null = null;

export async function openApp(filePath: string): Promise<App> {
  const client = openDatabase(filePath);
  await migrate(client);
  const tickets = TicketService.bind(client);
  await tickets.seed(new Date());
  return {
    tickets,
    directory: new Directory(client),
    conversations: new ConversationStore(client),
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
