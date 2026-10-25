import { HealthResponse } from "@english-course/shared";

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`Health check failed with HTTP ${res.status}`);
  return HealthResponse.parse(await res.json());
}
