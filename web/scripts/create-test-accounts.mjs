/**
 * Create test accounts via Supabase Admin API.
 * Run: node scripts/create-test-accounts.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(import.meta.dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Map user-requested tiers to actual DB plan IDs
// free=free, creator_lite→starter(75cr), creator_pro→creator(300cr),
// brand→business(1000cr), agency→video_agency
const ACCOUNTS = [
  { email: "test-free@flashflowai.com",         planId: "free",          credits: 5    },
  { email: "test-creator-lite@flashflowai.com",  planId: "starter",       credits: 75   },
  { email: "test-creator-pro@flashflowai.com",   planId: "creator",       credits: 300  },
  { email: "test-brand@flashflowai.com",          planId: "business",      credits: 1000 },
  { email: "test-agency@flashflowai.com",         planId: "video_agency",  credits: 9999 },
];

const PASSWORD = "FlashFlow2026!";

async function main() {
  // First, verify available plans
  const { data: plans, error: plansErr } = await supabase
    .from("subscription_plans")
    .select("id, name, credits_per_month")
    .order("sort_order");

  if (plansErr) {
    console.error("Failed to query plans:", plansErr.message);
    process.exit(1);
  }
  console.log("Available plans:", plans.map(p => `${p.id} (${p.name}, ${p.credits_per_month} cr/mo)`).join(", "));
  console.log("");

  const planIds = new Set(plans.map(p => p.id));
  for (const acct of ACCOUNTS) {
    if (!planIds.has(acct.planId)) {
      console.error(`Plan "${acct.planId}" not found in DB! Available: ${[...planIds].join(", ")}`);
      process.exit(1);
    }
  }

  for (const acct of ACCOUNTS) {
    console.log(`--- Creating ${acct.email} (plan: ${acct.planId}, credits: ${acct.credits}) ---`);

    // 1. Create auth user
    const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
      email: acct.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: "creator" },
    });

    if (userErr) {
      // If user already exists, fetch their ID instead
      if (userErr.message.includes("already been registered") || userErr.status === 422) {
        console.log(`  User already exists, fetching ID...`);
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existing = users.find(u => u.email === acct.email);
        if (!existing) {
          console.error(`  Could not find existing user ${acct.email}`);
          continue;
        }
        // Upsert subscription + credits for existing user
        await upsertRecords(existing.id, acct);
        continue;
      }
      console.error(`  Auth error: ${userErr.message}`);
      continue;
    }

    const userId = userData.user.id;
    console.log(`  Auth user created: ${userId}`);

    // The DB trigger (initialize_user_credits) auto-creates free sub + 5 credits.
    // We need to update to the correct plan and credit amount.
    await upsertRecords(userId, acct);
  }

  // Verify by querying
  console.log("\n=== VERIFICATION ===\n");
  const { data: results, error: verifyErr } = await supabase
    .from("user_subscriptions")
    .select(`
      user_id,
      plan_id,
      status,
      user_credits!inner(credits_remaining)
    `)
    .in("plan_id", ACCOUNTS.map(a => a.planId));

  if (verifyErr) {
    console.error("Verification query failed:", verifyErr.message);
    // Fallback: query each table separately
    await verifyManually();
    return;
  }

  // Also get emails from auth
  const { data: { users: allUsers } } = await supabase.auth.admin.listUsers();
  const emailMap = new Map(allUsers.map(u => [u.id, u.email]));

  console.log("Email                              | Plan          | Credits | Status");
  console.log("-----------------------------------+---------------+---------+-------");
  for (const row of results) {
    const email = emailMap.get(row.user_id) || row.user_id;
    if (!email.toString().startsWith("test-")) continue;
    const credits = row.user_credits?.[0]?.credits_remaining ?? row.user_credits?.credits_remaining ?? "?";
    console.log(
      `${email.toString().padEnd(35)}| ${row.plan_id.padEnd(14)}| ${String(credits).padEnd(8)}| ${row.status}`
    );
  }

  console.log("\nAll accounts use password: FlashFlow2026!");
  console.log("Login at: your-app-url/login");
}

async function upsertRecords(userId, acct) {
  // Wait briefly for the trigger to fire
  await new Promise(r => setTimeout(r, 500));

  // 2. Upsert user_subscriptions
  const { error: subErr } = await supabase
    .from("user_subscriptions")
    .upsert({
      user_id: userId,
      plan_id: acct.planId,
      status: "active",
      billing_period: "monthly",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "user_id" });

  if (subErr) {
    console.error(`  Subscription upsert error: ${subErr.message}`);
  } else {
    console.log(`  Subscription set: ${acct.planId}`);
  }

  // 3. Upsert user_credits
  const { error: credErr } = await supabase
    .from("user_credits")
    .upsert({
      user_id: userId,
      credits_remaining: acct.credits,
      credits_used_this_period: 0,
      lifetime_credits_used: 0,
      free_credits_total: acct.planId === "free" ? 5 : 0,
      free_credits_used: 0,
      period_start: new Date().toISOString(),
      period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "user_id" });

  if (credErr) {
    console.error(`  Credits upsert error: ${credErr.message}`);
  } else {
    console.log(`  Credits set: ${acct.credits}`);
  }
}

async function verifyManually() {
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const testUsers = users.filter(u => u.email?.startsWith("test-") && u.email?.endsWith("@flashflowai.com"));

  console.log("Email                              | Plan          | Credits | Status");
  console.log("-----------------------------------+---------------+---------+-------");

  for (const user of testUsers) {
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", user.id)
      .single();

    const { data: cred } = await supabase
      .from("user_credits")
      .select("credits_remaining")
      .eq("user_id", user.id)
      .single();

    console.log(
      `${user.email.padEnd(35)}| ${(sub?.plan_id || "?").padEnd(14)}| ${String(cred?.credits_remaining ?? "?").padEnd(8)}| ${sub?.status || "?"}`
    );
  }

  console.log("\nAll accounts use password: FlashFlow2026!");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
