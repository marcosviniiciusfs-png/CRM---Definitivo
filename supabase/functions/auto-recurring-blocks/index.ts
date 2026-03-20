import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const now = new Date();
  const today = now.getDate(); // day of month (1-31)

  console.log(`[auto-recurring-blocks] Running on day ${today} of month ${now.getMonth() + 1}/${now.getFullYear()}`);

  // Fetch all blocks with auto_recurring = true
  const { data: recurringBlocks, error } = await supabase
    .from('production_blocks')
    .select('id, organization_id, month, year, start_date, end_date, recurrence_day, total_profit')
    .eq('auto_recurring', true);

  if (error) {
    console.error('[auto-recurring-blocks] Error fetching recurring blocks:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }

  console.log(`[auto-recurring-blocks] Found ${recurringBlocks?.length || 0} recurring blocks`);

  let created = 0;
  let skipped = 0;

  for (const block of (recurringBlocks || [])) {
    const recurrenceDay = block.recurrence_day || 1;

    // Only trigger on the specified day
    if (today !== recurrenceDay) {
      skipped++;
      continue;
    }

    // Calculate next period
    let nextMonth: number;
    let nextYear: number;
    let nextStartDate: string;
    let nextEndDate: string;

    if (block.start_date && block.end_date) {
      // Date-range based: advance by 1 month
      const start = new Date(block.start_date + 'T00:00:00');
      const end = new Date(block.end_date + 'T00:00:00');
      const durationDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const newStart = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate());
      const newEnd = new Date(newStart.getTime() + durationDays * 24 * 60 * 60 * 1000);
      nextMonth = newStart.getMonth() + 1;
      nextYear = newStart.getFullYear();
      nextStartDate = newStart.toISOString().split('T')[0];
      nextEndDate = newEnd.toISOString().split('T')[0];
    } else {
      nextMonth = block.month === 12 ? 1 : block.month + 1;
      nextYear = block.month === 12 ? block.year + 1 : block.year;
      const newStart = new Date(nextYear, nextMonth - 1, 1);
      const newEnd = new Date(nextYear, nextMonth, 0);
      nextStartDate = newStart.toISOString().split('T')[0];
      nextEndDate = newEnd.toISOString().split('T')[0];
    }

    // Check if block already exists for next period
    const { data: existing } = await supabase
      .from('production_blocks')
      .select('id')
      .eq('organization_id', block.organization_id)
      .eq('month', nextMonth)
      .eq('year', nextYear)
      .maybeSingle();

    if (existing) {
      console.log(`[auto-recurring-blocks] Block for ${nextMonth}/${nextYear} already exists for org ${block.organization_id}`);
      skipped++;
      continue;
    }

    // Compute metrics for the new period
    const startDateObj = new Date(nextStartDate + 'T00:00:00');
    const endDateObj = new Date(nextEndDate + 'T23:59:59');

    const { data: leads } = await supabase
      .from('leads')
      .select('id, valor, funnel_stages(stage_type)')
      .eq('organization_id', block.organization_id)
      .gte('data_conclusao', startDateObj.toISOString())
      .lte('data_conclusao', endDateObj.toISOString());

    const wonLeads = (leads || []).filter((l: any) => l.funnel_stages?.stage_type === 'won');
    const totalRevenue = wonLeads.reduce((sum: number, l: any) => sum + (l.valor || 0), 0);
    const profitChange = totalRevenue - (block.total_profit || 0);
    const profitChangePercentage = (block.total_profit || 0) > 0 ? (profitChange / block.total_profit) * 100 : 0;

    const { error: insertError } = await supabase
      .from('production_blocks')
      .insert({
        organization_id: block.organization_id,
        month: nextMonth,
        year: nextYear,
        start_date: nextStartDate,
        end_date: nextEndDate,
        auto_recurring: true,
        recurrence_day: block.recurrence_day,
        total_sales: wonLeads.length,
        total_revenue: totalRevenue,
        total_cost: 0,
        total_profit: totalRevenue,
        previous_month_profit: block.total_profit || 0,
        profit_change_value: profitChange,
        profit_change_percentage: profitChangePercentage,
      });

    if (insertError) {
      console.error(`[auto-recurring-blocks] Error creating block:`, insertError.message);
    } else {
      console.log(`[auto-recurring-blocks] Created block for ${nextMonth}/${nextYear} org ${block.organization_id}`);
      created++;
    }
  }

  return new Response(
    JSON.stringify({ success: true, created, skipped, total: recurringBlocks?.length || 0 }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
