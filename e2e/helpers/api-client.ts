/**
 * Lightweight tRPC HTTP client for E2E tests.
 * Calls the real API endpoints just like the frontend would.
 */

import { API_URL } from "../setup/test-context";

export class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      h["Authorization"] = `Bearer ${this.token}`;
    }
    return h;
  }

  /**
   * Call a tRPC mutation (POST).
   */
  async mutation<T = any>(path: string, input?: any): Promise<T> {
    const url = `${API_URL}/trpc/${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: input !== undefined ? JSON.stringify(input) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API mutation ${path} failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    if (json.error) {
      throw new Error(
        `API mutation ${path} error: ${JSON.stringify(json.error)}`
      );
    }
    return json.result?.data as T;
  }

  /**
   * Call a tRPC query (GET).
   */
  async query<T = any>(path: string, input?: any): Promise<T> {
    let url = `${API_URL}/trpc/${path}`;
    if (input !== undefined) {
      url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
    }

    const res = await fetch(url, {
      method: "GET",
      headers: this.headers(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API query ${path} failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    if (json.error) {
      throw new Error(
        `API query ${path} error: ${JSON.stringify(json.error)}`
      );
    }
    return json.result?.data as T;
  }
}

export const apiClient = new ApiClient();
