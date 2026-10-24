if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = class {};
}
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (e) {
    console.error('Error loading .env.local', e);
  }
}
loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seedSampleEstimates() {
  console.log('Seeding demo accounts & estimates...');

  // 1. Seed accounts first with valid status 'in_progress'
  const accountsToInsert = [
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001',
      name: 'Meridian Financial Group',
      description: 'Mid-market investment and wealth management firm undergoing a full digital transformation',
      service_tier: 'enterprise',
      status: 'in_progress',
    },
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002',
      name: 'Vanta Health',
      description: 'Series B health-tech startup building patient engagement and telehealth software',
      service_tier: 'premium',
      status: 'in_progress',
    },
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-000000000003',
      name: 'Harlow & Sons Bakery',
      description: 'Family-owned artisan bakery chain with 6 locations expanding into e-commerce',
      service_tier: 'basic',
      status: 'in_progress',
    },
  ];

  const { error: accInsertErr } = await supabase.from('accounts').upsert(accountsToInsert);
  if (accInsertErr) {
    console.error('Error inserting accounts:', accInsertErr);
  } else {
    console.log('Successfully inserted/upserted accounts!');
  }

  // Get accounts
  const { data: accounts, error: accError } = await supabase.from('accounts').select('id, name').limit(3);
  if (accError || !accounts || accounts.length === 0) {
    console.error('No accounts found to seed estimates for:', accError);
    return;
  }

  console.log(`Found ${accounts.length} accounts:`, accounts.map(a => a.name).join(', '));

  for (const account of accounts) {
    // Check if account already has estimates
    const { count } = await supabase.from('estimates').select('*', { count: 'exact', head: true }).eq('account_id', account.id);
    if (count && count > 0) {
      console.log(`Account ${account.name} already has ${count} estimates.`);
      continue;
    }

    // Get a project in this account
    const { data: projects } = await supabase.from('projects').select('id').eq('account_id', account.id).limit(1);
    const projectId = projects && projects.length > 0 ? projects[0].id : null;

    // Create a Draft estimate
    const { data: est1, error: est1Err } = await supabase.from('estimates').insert({
      account_id: account.id,
      project_id: projectId,
      estimate_number: `EST-2026-0001`,
      title: `${account.name} — Q2 Architecture & Engineering`,
      status: 'draft',
      currency: 'USD',
      subtotal_minor: 1250000, // $12,500.00
      discount_rate_basis_points: 500, // 5.00%
      discount_minor: 62500, // $625.00
      tax_rate_basis_points: 800, // 8.00%
      tax_minor: 95000, // $950.00
      total_minor: 1282500, // $12,825.00
      notes: 'Initial scope breakdown for digital transformation phase 1.',
      terms: 'Net 30 payment terms upon completion.',
      valid_until: '2026-11-30',
    }).select().single();

    if (est1Err) {
      console.error(`Failed to seed draft estimate for ${account.name}:`, est1Err);
      continue;
    }

    // Insert line items for est1
    await supabase.from('estimate_line_items').insert([
      {
        estimate_id: est1.id,
        account_id: account.id,
        description: 'Frontend Architecture & State Machine Design',
        quantity: 40,
        unit_price_minor: 15000, // $150.00
        amount_minor: 600000, // $6,000.00
        position: 0,
      },
      {
        estimate_id: est1.id,
        account_id: account.id,
        description: 'Backend Microservices & DB Optimization',
        quantity: 35,
        unit_price_minor: 18000, // $180.00
        amount_minor: 630000, // $6,300.00
        position: 1,
      },
      {
        estimate_id: est1.id,
        account_id: account.id,
        description: 'Cloud Infrastructure & Security Audit',
        quantity: 1,
        unit_price_minor: 20000, // $200.00
        amount_minor: 20000, // $200.00
        position: 2,
      },
    ]);

    // Create a Sent estimate
    const { data: est2, error: est2Err } = await supabase.from('estimates').insert({
      account_id: account.id,
      project_id: projectId,
      estimate_number: `EST-2026-0002`,
      title: `${account.name} — Dedicated Support & SLA`,
      status: 'sent',
      currency: 'USD',
      subtotal_minor: 450000, // $4,500.00
      discount_rate_basis_points: 0,
      discount_minor: 0,
      tax_rate_basis_points: 0,
      tax_minor: 0,
      total_minor: 450000, // $4,500.00
      notes: 'Monthly retainer for 24/7 mission critical support.',
      terms: 'Quarterly billing.',
      valid_until: '2026-12-15',
      sent_at: new Date().toISOString(),
    }).select().single();

    if (!est2Err && est2) {
      await supabase.from('estimate_line_items').insert([
        {
          estimate_id: est2.id,
          account_id: account.id,
          description: 'Tier-1 SLA Support Retainer',
          quantity: 3,
          unit_price_minor: 150000, // $1,500.00
          amount_minor: 450000, // $4,500.00
          position: 0,
        },
      ]);
    }

    console.log(`✅ Seeded 2 demo estimates for ${account.name}`);
  }

  console.log('🎉 Estimates seeding complete!');
}

seedSampleEstimates().catch(console.error);
