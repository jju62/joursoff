import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

type Preferences = {
  departure_reminders: boolean;
  bridge_alerts: boolean;
  sunny_bridge_alerts: boolean;
  pro_balance_alerts: boolean;
  duo_group_alerts: boolean;
};

type Leave = {
  id?: number | string;
  date?: string;
  type?: string;
  days?: number;
  halfDay?: string;
};

type UserSettings = {
  user_id: string;
  leaves: Leave[] | string | null;
  quotas: Record<string, unknown> | string | null;
};

type Profile = {
  id: string;
  is_pro: boolean;
  notification_preferences: Preferences;
  departure_city: string | null;
  annual_cp: number;
  cp_renewal_month: number;
};

type PushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type Notice = {
  key: string;
  title: string;
  body: string;
};

type LeaveChangeEvent = {
  id: number;
  user_id: string;
  previous_leaves: unknown;
  current_leaves: unknown;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const cronSecret = Deno.env.get('NOTIFICATION_CRON_SECRET');
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@congeszen.fr';

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseLeaves(value: UserSettings['leaves']): Leave[] {
  let parsed: unknown = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((leave): leave is Leave =>
    Boolean(leave) && typeof leave === 'object'
    && typeof (leave as Leave).date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test((leave as Leave).date!)
  );
}

function parisToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDays(isoDate: string, amount: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000);
}

function getEasterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function frenchHolidays(year: number) {
  const easter = getEasterSunday(year);
  const easterDate = new Date(`${easter}T12:00:00Z`);
  const offset = (days: number) => {
    const date = new Date(easterDate);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  return [
    { date: `${year}-01-01`, name: "Jour de l'An" },
    { date: offset(1), name: 'Lundi de Pâques' },
    { date: `${year}-05-01`, name: 'Fête du Travail' },
    { date: `${year}-05-08`, name: 'Victoire 1945' },
    { date: offset(39), name: 'Ascension' },
    { date: offset(50), name: 'Lundi de Pentecôte' },
    { date: `${year}-07-14`, name: 'Fête Nationale' },
    { date: `${year}-08-15`, name: 'Assomption' },
    { date: `${year}-11-01`, name: 'Toussaint' },
    { date: `${year}-11-11`, name: 'Armistice 1918' },
    { date: `${year}-12-25`, name: 'Noël' },
  ];
}

function bridgeOpportunities(from: string, to: string, booked: Set<string>) {
  const opportunities: { holidayDate: string; holidayName: string; bridgeDate: string }[] = [];
  const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]);

  for (const year of years) {
    for (const holiday of frenchHolidays(year)) {
      if (holiday.date < from || holiday.date > to) continue;
      const weekday = new Date(`${holiday.date}T12:00:00Z`).getUTCDay();
      const bridgeDate = weekday === 2
        ? addDays(holiday.date, -1)
        : weekday === 4
          ? addDays(holiday.date, 1)
          : null;
      if (bridgeDate && !booked.has(bridgeDate)) {
        opportunities.push({ holidayDate: holiday.date, holidayName: holiday.name, bridgeDate });
      }
    }
  }
  return opportunities;
}

function parsePreferences(value: unknown): Preferences {
  const defaults: Preferences = {
    departure_reminders: true,
    bridge_alerts: true,
    sunny_bridge_alerts: false,
    pro_balance_alerts: false,
    duo_group_alerts: true,
  };
  const object = parseObject(value);
  if (!object) return defaults;
  return {
    departure_reminders: object.departure_reminders === true,
    bridge_alerts: object.bridge_alerts === true,
    sunny_bridge_alerts: object.sunny_bridge_alerts === true,
    pro_balance_alerts: object.pro_balance_alerts === true,
    duo_group_alerts: object.duo_group_alerts !== false,
  };
}

function departureStarts(leaves: Leave[]) {
  const booked = new Set(leaves.map((leave) => leave.date!));
  const starts: string[] = [];
  for (const date of booked) {
    let previousWorkday = addDays(date, -1);
    while ([0, 6].includes(new Date(`${previousWorkday}T12:00:00Z`).getUTCDay())) {
      previousWorkday = addDays(previousWorkday, -1);
    }
    if (!booked.has(previousWorkday)) starts.push(date);
  }
  return starts;
}

function nextRenewalDate(today: string, month: number) {
  const year = Number(today.slice(0, 4));
  const currentYearDate = `${year}-${String(month).padStart(2, '0')}-01`;
  return currentYearDate < today
    ? `${year + 1}-${String(month).padStart(2, '0')}-01`
    : currentYearDate;
}

function daysUsedInCycle(leaves: Leave[], start: string, today: string) {
  return leaves.reduce((total, leave) => {
    if (leave.type !== 'CP' || !leave.date || leave.date < start || leave.date > today) return total;
    return total + (Number.isFinite(leave.days) ? Number(leave.days) : 1);
  }, 0);
}

async function sunnyAndWarm(city: string, date: string, signal: AbortSignal) {
  const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geocodingUrl.search = new URLSearchParams({ name: city, count: '1', language: 'fr', format: 'json' }).toString();
  const geoResponse = await fetch(geocodingUrl, { signal });
  if (!geoResponse.ok) throw new Error(`Open-Meteo geocoding failed (${geoResponse.status})`);
  const geoData = await geoResponse.json();
  const location = geoData.results?.[0];
  if (!location) return false;

  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    daily: 'temperature_2m_max,weather_code',
    forecast_days: '16',
    timezone: 'Europe/Paris',
  }).toString();
  const forecastResponse = await fetch(forecastUrl, { signal });
  if (!forecastResponse.ok) throw new Error(`Open-Meteo forecast failed (${forecastResponse.status})`);
  const forecastData = await forecastResponse.json();
  const index = forecastData.daily?.time?.indexOf(date) ?? -1;
  return index >= 0
    && forecastData.daily.temperature_2m_max[index] > 22
    && forecastData.daily.weather_code[index] <= 1;
}

function renewalCycleStart(today: string, month: number) {
  let year = Number(today.slice(0, 4));
  const anniversary = `${year}-${String(month).padStart(2, '0')}-01`;
  if (today < anniversary) year -= 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

async function candidateNotices(
  profile: Profile,
  leaves: Leave[],
  quotas: Record<string, unknown>,
  today: string,
): Promise<Notice[]> {
  const notices: Notice[] = [];
  const booked = new Set(leaves.map((leave) => leave.date!));

  if (profile.notification_preferences.departure_reminders) {
    for (const start of departureStarts(leaves)) {
      if (daysBetween(today, start) === 3) {
        notices.push({
          key: `departure:${start}`,
          title: 'Prépare ta valise !',
          body: `Ton prochain congé commence le ${new Date(`${start}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}.`,
        });
      }
    }
  }

  const rangeEnd = addDays(today, 30);
  if (profile.notification_preferences.bridge_alerts || (profile.is_pro && profile.notification_preferences.sunny_bridge_alerts)) {
    for (const opportunity of bridgeOpportunities(today, rangeEnd, booked)) {
      const daysUntilBridge = daysBetween(today, opportunity.bridgeDate);
      if (daysUntilBridge < 1 || daysUntilBridge > 14) continue;
      if (profile.notification_preferences.bridge_alerts) {
        notices.push({
          key: `bridge:${opportunity.holidayDate}:${opportunity.bridgeDate}`,
          title: 'Pont manqué',
          body: `Le ${opportunity.holidayName} permet de faire le pont le ${new Date(`${opportunity.bridgeDate}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}. Tu ne l’as pas encore posé.`,
        });
      }

      if (profile.is_pro && profile.notification_preferences.sunny_bridge_alerts && profile.departure_city) {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 8_000);
        try {
          if (await sunnyAndWarm(profile.departure_city, opportunity.bridgeDate, abort.signal)) {
            notices.push({
              key: `sunny-bridge:${opportunity.holidayDate}:${opportunity.bridgeDate}`,
              title: 'Soleil annoncé sur ce pont ☀️',
              body: `Plus de 22 °C sont prévus à ${profile.departure_city} le ${new Date(`${opportunity.bridgeDate}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}.`,
            });
          }
        } catch (error) {
          console.error(`Open-Meteo unavailable for ${profile.departure_city}:`, error);
        } finally {
          clearTimeout(timer);
        }
      }
    }
  }

  if (profile.is_pro && profile.notification_preferences.pro_balance_alerts) {
    const renewal = nextRenewalDate(today, profile.cp_renewal_month);
    const daysUntilRenewal = daysBetween(today, renewal);
    const cycleStart = renewalCycleStart(today, profile.cp_renewal_month);
    const annualCp = Number(quotas.cp ?? profile.annual_cp ?? 25);
    const remaining = Math.max(0, annualCp - daysUsedInCycle(leaves, cycleStart, today));
    if (daysUntilRenewal <= 30 && remaining > 0) {
      notices.push({
        key: `cp-renewal:${renewal}`,
        title: 'Tes congés payés se renouvellent bientôt',
        body: `Il te reste environ ${remaining} jour${remaining > 1 ? 's' : ''} de CP avant le ${new Date(`${renewal}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}.`,
      });
    } else if (today.slice(5) === '12-01' && remaining > 0) {
      notices.push({
        key: `year-end-summary:${today.slice(0, 4)}`,
        title: 'Ton bilan CongésZen de fin d’année',
        body: `Il te reste ${remaining} jour${remaining > 1 ? 's' : ''} de CP. C’est le moment d’optimiser tes prochaines pauses.`,
      });
    }
  }

  return notices;
}

function formattedDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function leaveIdentity(leave: Leave) {
  return leave.id === undefined ? `${leave.date}:${leave.type}` : String(leave.id);
}

function sameLeave(left: Leave, right: Leave) {
  return left.date === right.date
    && left.type === right.type
    && left.days === right.days
    && left.halfDay === right.halfDay;
}

function getLeaveChanges(previous: Leave[], current: Leave[]) {
  const before = new Map(previous.map((leave) => [leaveIdentity(leave), leave]));
  const after = new Map(current.map((leave) => [leaveIdentity(leave), leave]));
  const added: Leave[] = [];
  const modified: Leave[] = [];
  const cancelled: Leave[] = [];

  for (const [identity, leave] of after) {
    const oldLeave = before.get(identity);
    if (!oldLeave) added.push(leave);
    else if (!sameLeave(oldLeave, leave)) modified.push(leave);
  }
  for (const [identity, leave] of before) {
    if (!after.has(identity)) cancelled.push(leave);
  }
  return { added, modified, cancelled };
}

function dateRange(leaves: Leave[]) {
  const dates = [...new Set(leaves.flatMap((leave) =>
    typeof leave.date === 'string' ? [leave.date] : []
  ))].sort();
  if (!dates.length) return null;
  return { dates, start: dates[0], end: dates[dates.length - 1] };
}

function formatDateRange(start: string, end: string) {
  return `du ${formattedDate(start)} au ${formattedDate(end)}`;
}

function fullyAlignedDates(senderDates: string[], recipientLeaves: Leave[]) {
  if (!senderDates.length) return false;
  const start = senderDates[0];
  const end = senderDates[senderDates.length - 1];
  const recipientDates = [...new Set(recipientLeaves.flatMap((leave) =>
    typeof leave.date === 'string' && leave.date >= start && leave.date <= end
      ? [leave.date]
      : []
  ))].sort();
  return recipientDates.length === senderDates.length
    && recipientDates.every((date, index) => date === senderDates[index]);
}

async function sendDuoGroupNotifications(
  supabase: ReturnType<typeof createClient>,
  event: LeaveChangeEvent,
) {
  const previous = parseLeaves(event.previous_leaves as UserSettings['leaves']);
  const current = parseLeaves(event.current_leaves as UserSettings['leaves']);
  const changes = getLeaveChanges(previous, current);
  const changedGroups = [
    { action: 'posed', leaves: changes.added },
    { action: 'modified', leaves: changes.modified },
    { action: 'cancelled', leaves: changes.cancelled },
  ].flatMap((group) => {
    const range = dateRange(group.leaves);
    return range ? [{ ...group, range }] : [];
  });
  if (!changedGroups.length) return;

  const [{ data: senderResult, error: senderError }, { data: relationships, error: relationshipError }, { data: memberships, error: membershipError }] = await Promise.all([
    supabase.auth.admin.getUserById(event.user_id),
    supabase
      .from('user_relationships')
      .select('owner_id, partner_id')
      .eq('status', 'accepted')
      .or(`owner_id.eq.${event.user_id},partner_id.eq.${event.user_id}`),
    supabase.from('calendar_group_members').select('group_id').eq('user_id', event.user_id),
  ]);
  if (senderError) throw senderError;
  if (relationshipError) throw relationshipError;
  if (membershipError) throw membershipError;
  if (!senderResult.user) throw new Error('The leave owner account no longer exists.');

  const recipientIds = new Set<string>();
  for (const relationship of relationships ?? []) {
    const partnerId = relationship.owner_id === event.user_id
      ? relationship.partner_id
      : relationship.owner_id;
    if (partnerId && partnerId !== event.user_id) recipientIds.add(partnerId);
  }

  const groupIds = [...new Set((memberships ?? []).map((membership) => membership.group_id))];
  if (groupIds.length) {
    const { data: groupMembers, error: groupError } = await supabase
      .from('calendar_group_members')
      .select('user_id')
      .in('group_id', groupIds);
    if (groupError) throw groupError;
    for (const member of groupMembers ?? []) {
      if (member.user_id !== event.user_id) recipientIds.add(member.user_id);
    }
  }
  if (!recipientIds.size) return;

  const ids = [...recipientIds];
  const [{ data: profiles, error: profilesError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from('profiles').select('id, notification_preferences').in('id', ids),
    supabase.from('user_settings').select('user_id, leaves').in('user_id', ids),
  ]);
  if (profilesError) throw profilesError;
  if (settingsError) throw settingsError;

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const leavesByUser = new Map<string, Leave[]>();
  for (const row of settings ?? []) {
    leavesByUser.set(row.user_id, parseLeaves(row.leaves as UserSettings['leaves']));
  }

  const displayName = senderResult.user.user_metadata?.display_name;
  const metadataName = senderResult.user.user_metadata?.name;
  const senderName = (typeof displayName === 'string' ? displayName.trim() : '')
    || (typeof metadataName === 'string' ? metadataName.trim() : '')
    || 'Un membre';
  for (const recipientId of ids) {
    const profile = profileById.get(recipientId);
    const preferences = parsePreferences(profile?.notification_preferences);
    if (!preferences.duo_group_alerts) continue;

    for (const group of changedGroups) {
      const dates = group.range.dates;
      const rangeLabel = formatDateRange(group.range.start, group.range.end);
      const overlap = group.action === 'posed'
        && fullyAlignedDates(dates, leavesByUser.get(recipientId) ?? []);
      const title = overlap ? 'Vacances alignées !' : 'Congés Duo & Groupes';
      const body = overlap
        ? `🎉 Vos vacances ${rangeLabel} sont 100% alignées !`
        : group.action === 'posed'
          ? `👯 ${senderName} a posé des congés ${rangeLabel}.`
          : group.action === 'modified'
            ? `👯 ${senderName} a modifié des congés ${rangeLabel}.`
            : `👯 ${senderName} a annulé des congés ${rangeLabel}.`;
      const notificationKey = `leave-change:${event.id}:${group.action}`;
      const { data: priorDelivery, error: deliveryError } = await supabase
        .from('notification_deliveries')
        .select('notification_key')
        .eq('user_id', recipientId)
        .eq('notification_key', notificationKey)
        .maybeSingle();
      if (deliveryError) throw deliveryError;
      if (priorDelivery) continue;

      const { data: subscriptions, error: subscriptionError } = await supabase
        .from('push_subscriptions')
        .select('endpoint, keys')
        .eq('user_id', recipientId);
      if (subscriptionError) throw subscriptionError;
      let delivered = false;
      for (const subscription of subscriptions ?? []) {
        try {
          await webpush.sendNotification(subscription, JSON.stringify({
            title,
            body,
            tag: notificationKey,
            url: '/',
          }));
          delivered = true;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            const { error: deleteError } = await supabase
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', subscription.endpoint);
            if (deleteError) throw deleteError;
          } else {
            throw error;
          }
        }
      }

      if (delivered) {
        const { error: insertError } = await supabase
          .from('notification_deliveries')
          .insert({ user_id: recipientId, notification_key: notificationKey });
        if (insertError) throw insertError;
      }
    }
  }
}

async function processLeaveChangeEvents(
  supabase: ReturnType<typeof createClient>,
  userId: string | null,
) {
  const { data: events, error: claimError } = await supabase.rpc('claim_leave_change_events', {
    p_user_id: userId,
    p_limit: 50,
  });
  if (claimError) throw claimError;

  let processed = 0;
  let failed = 0;
  for (const event of (events ?? []) as LeaveChangeEvent[]) {
    try {
      await sendDuoGroupNotifications(supabase, event);
      const { error } = await supabase
        .from('leave_change_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', event.id);
      if (error) throw error;
      processed += 1;
    } catch (error) {
      failed += 1;
      console.error(`Could not process leave-change event ${event.id}:`, error);
    }
  }
  return { processed, failed };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const authorization = request.headers.get('authorization');
  const isCronRequest = Boolean(cronSecret && authorization === `Bearer ${cronSecret}`);
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    console.error('Missing required Supabase or VAPID environment variables.');
    return new Response('Notification service is not configured', { status: 500 });
  }

  let requestedBy: string | null = null;
  if (!isCronRequest) {
    if (!authorization?.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 });
    }
    const accessToken = authorization.slice('Bearer '.length);
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!publicKey) {
      console.error('Missing SUPABASE_ANON_KEY environment variable.');
      return new Response('Notification service is not configured', { status: 500 });
    }
    const authClient = createClient(supabaseUrl, publicKey);
    const { data: { user }, error } = await authClient.auth.getUser(accessToken);
    if (error || !user) {
      return new Response('Unauthorized', { status: 401 });
    }
    let body: { action?: string };
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid request body', { status: 400 });
    }
    if (body.action !== 'process-leave-events') {
      return new Response('Unsupported action', { status: 400 });
    }
    requestedBy = user.id;
  }

  if (!isCronRequest && !requestedBy) {
    return new Response('Unauthorized', { status: 401 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const today = parisToday();

  try {
    const leaveEvents = await processLeaveChangeEvents(supabase, requestedBy);
    if (requestedBy) {
      return Response.json(leaveEvents, { status: leaveEvents.failed ? 503 : 200 });
    }

    const [{ data: profiles, error: profileError }, { data: settingsRows, error: settingsError }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, is_pro, notification_preferences, departure_city, annual_cp, cp_renewal_month')
        .not('notification_preferences', 'is', null),
      supabase.from('user_settings').select('user_id, leaves, quotas'),
    ]);
    if (profileError) throw profileError;
    if (settingsError) throw settingsError;

    const settingsByUser = new Map<string, UserSettings>();
    for (const row of settingsRows ?? []) settingsByUser.set(row.user_id, row as UserSettings);

    let sent = 0;
    let failed = 0;
    for (const rawProfile of profiles ?? []) {
      const profile = rawProfile as Profile;
      const preferences = parsePreferences(profile.notification_preferences);
      profile.notification_preferences = preferences;
      const settings = settingsByUser.get(profile.id);
      if (!settings) continue;
      const leaves = parseLeaves(settings.leaves);
      const quotas = parseObject(settings.quotas) ?? {};
      const notices = await candidateNotices(profile, leaves, quotas, today);
      if (!notices.length) continue;

      const { data: subscriptions, error: subscriptionsError } = await supabase
        .from('push_subscriptions')
        .select('endpoint, keys')
        .eq('user_id', profile.id);
      if (subscriptionsError) throw subscriptionsError;
      if (!subscriptions?.length) continue;

      for (const notice of notices) {
        const { data: existing, error: deliveryReadError } = await supabase
          .from('notification_deliveries')
          .select('notification_key')
          .eq('user_id', profile.id)
          .eq('notification_key', notice.key)
          .maybeSingle();
        if (deliveryReadError) throw deliveryReadError;
        if (existing) continue;

        let delivered = false;
        for (const subscription of subscriptions as PushSubscription[]) {
          try {
            await webpush.sendNotification(subscription, JSON.stringify({
              title: notice.title,
              body: notice.body,
              tag: notice.key,
              url: '/',
            }));
            delivered = true;
          } catch (error) {
            const statusCode = (error as { statusCode?: number }).statusCode;
            if (statusCode === 404 || statusCode === 410) {
              const { error: deleteError } = await supabase
                .from('push_subscriptions')
                .delete()
                .eq('endpoint', subscription.endpoint);
              if (deleteError) console.error('Could not remove expired push subscription:', deleteError);
            } else {
              failed += 1;
              console.error('Push delivery failed:', error);
            }
          }
        }

        if (delivered) {
          const { error: insertError } = await supabase
            .from('notification_deliveries')
            .insert({ user_id: profile.id, notification_key: notice.key });
          if (insertError) throw insertError;
          sent += 1;
        }
      }
    }

    return Response.json({
      sent,
      failed: failed + leaveEvents.failed,
      leaveEventsProcessed: leaveEvents.processed,
      evaluatedDate: today,
    });
  } catch (error) {
    console.error('Notification job failed:', error);
    return Response.json({ error: 'Notification job failed' }, { status: 500 });
  }
});
