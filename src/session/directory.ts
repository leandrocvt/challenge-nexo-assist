import type { Client, Row } from "@libsql/client";
import { z } from "zod";

const roleSchema = z.enum(["funcionario", "analista"]);
const levelSchema = z.enum(["N1", "N2"]);

export type Employee = {
  id: string;
  name: string;
  email: string;
  role: z.infer<typeof roleSchema>;
  level: z.infer<typeof levelSchema> | null;
};

export class Directory {
  constructor(private readonly client: Client) {}

  async findByEmail(email: string): Promise<Employee | null> {
    const result = await this.client.execute({
      sql: `SELECT id, name, email, role, level FROM employees WHERE lower(email) = ?`,
      args: [email.toLowerCase()],
    });
    const row = result.rows[0];
    return row ? toEmployee(row) : null;
  }

  async findById(id: string): Promise<Employee | null> {
    const result = await this.client.execute({
      sql: `SELECT id, name, email, role, level FROM employees WHERE id = ?`,
      args: [id],
    });
    const row = result.rows[0];
    return row ? toEmployee(row) : null;
  }
}

function toEmployee(row: Row): Employee {
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    email: text(row, "email"),
    role: roleSchema.parse(text(row, "role")),
    level: row.level === null ? null : levelSchema.parse(text(row, "level")),
  };
}

function text(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`Coluna ${column} sem texto.`);
  }
  return value;
}
