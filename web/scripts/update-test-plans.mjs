import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const updates = [
  ["test-creator-lite@flashflowai.com", "creator_lite"],
  ["test-creator-pro@flashflowai.com", "creator_pro"],
  ["test-brand@flashflowai.com", "brand"],
  ["test-agency@flashflowai.com", "agency"],
];

const { data: { users } } = await sb.auth.admin.listUsers();

for (const [email, planId] of updates) {
  const user = users.find(u => u.email === email);
  if (!user) { console.log("Not found:", email); continue; }

  const { error } = await sb
    .from("user_subscriptions")
    .update({ plan_id: planId })
    .eq("user_id", user.id);

  if (error) console.log("Error updating", email, error.message);
  else console.log("Updated", email, "->", planId);
}

console.log("\n=== VERIFICATION ===\n");
console.log("Email".padEnd(38), "Plan".padEnd(15), "Credits".padEnd(8), "Status");
console.log("-".repeat(75));
for (const u of users.filter(u => u.email?.startsWith("test-"))) {
  const { data: sub } = await sb.from("user_subscriptions").select("plan_id, status").eq("user_id", u.id).single();
  const { data: cred } = await sb.from("user_credits").select("credits_remaining").eq("user_id", u.id).single();
  console.log(
    u.email.padEnd(38),
    (sub?.plan_id || "?").padEnd(15),
    String(cred?.credits_remaining ?? "?").padEnd(8),
    sub?.status || "?"
  );
}
