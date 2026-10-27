"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api, type Employee } from "./api";

export function useEmployee(expected: Employee["role"]) {
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api<{ employee: Employee }>("/api/session")
      .then((body) => {
        if (!active) {
          return;
        }
        if (body.employee.role !== expected) {
          router.replace(body.employee.role === "analista" ? "/console" : "/atendimento");
          return;
        }
        setEmployee(body.employee);
      })
      .catch(() => {
        if (active) {
          router.replace("/");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [expected, router]);

  return { employee, loading };
}
