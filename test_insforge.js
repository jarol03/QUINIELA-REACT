import { createClient } from "@insforge/sdk";

const baseUrl = "https://acde4djb.us-east.insforge.app";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Qw03NzYxMzh9.ThXjSWcEpZ5tMOYmHj-9nyzxW9NUt3hsvuTedtN5NuA"; // Note: the key in .env.local was:
// eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzYxMzh9.ThXjSWcEpZ5tMOYmHj-9nyzxW9NUt3hsvuTedtN5NuA
// Let's use the exact key from .env.local

const exactAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzYxMzh9.ThXjSWcEpZ5tMOYmHj-9nyzxW9NUt3hsvuTedtN5NuA";

const db = createClient({
  baseUrl,
  anonKey: exactAnonKey
}).database;

async function run() {
  console.log("Starting Insforge query for non-existent user...");
  console.time("insforge-query");
  try {
    const { data, error } = await db
      .from("usuarios")
      .select("*")
      .eq("username", "nonexistent_user_12345")
      .single();
    console.timeEnd("insforge-query");
    console.log("Result:", { data, error });
  } catch (e) {
    console.timeEnd("insforge-query");
    console.error("Error thrown:", e);
  }
}

run();
