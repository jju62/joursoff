export const STANDALONE_HTML_CODE = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CongésZen — Mon suivi de congés & RTT</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <!-- SDK JS Supabase v2 CDN -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <style>
    .tabular-nums { font-variant-numeric: tabular-nums; }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 p-4 max-w-md mx-auto min-h-screen relative pb-14 antialiased">

  <!-- En-tête -->
  <header class="my-6 flex justify-between items-center">
    <div>
      <h1 class="text-2xl font-black text-indigo-600 tracking-tight flex items-center gap-2">
        <i data-lucide="calendar-check-2" class="w-6 h-6 text-indigo-600"></i>
        CongésZen
      </h1>
      <p class="text-xs text-slate-500 font-medium mt-0.5">Mes congés, RTT & ponts 2026 sous contrôle</p>
    </div>
    
    <div class="flex items-center gap-2">
      <!-- Bouton d'authentification Supabase -->
      <button id="auth-btn" onclick="toggleAuthModal(true)" class="text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full flex items-center gap-1.5 transition shadow-xs">
        <i data-lucide="user" class="w-3.5 h-3.5 text-indigo-600"></i>
        <span id="auth-btn-label">Connexion</span>
      </button>

      <button onclick="toggleQuotaModal(true, 'cp')" class="text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 px-3 py-1.5 rounded-full flex items-center gap-1.5 transition">
        <i data-lucide="sliders-horizontal" class="w-3.5 h-3.5"></i>
        <span>2026</span>
      </button>
    </div>
  </header>

  <!-- Bannière de statut de synchronisation -->
  <div id="sync-banner" class="mb-5 bg-white border border-slate-200/80 rounded-2xl p-3 flex items-center justify-between text-xs">
    <div class="flex items-center gap-2">
      <span id="sync-dot" class="w-2 h-2 rounded-full bg-amber-400"></span>
      <span id="sync-text" class="text-slate-600 font-medium">Mode local (non connecté)</span>
    </div>
    <button id="sync-action-btn" onclick="toggleAuthModal(true)" class="text-indigo-600 font-bold hover:underline">
      Synchroniser
    </button>
  </div>

  <!-- Cartes de Solde avec bouton d'édition (icône crayon) -->
  <div class="grid grid-cols-2 gap-3 mb-6">
    <div class="bg-white p-4 rounded-2xl border border-slate-200/80">
      <div class="flex items-center justify-between">
        <span class="text-xs text-slate-500 font-semibold">Congés Payés</span>
        <button onclick="toggleQuotaModal(true, 'cp')" class="text-slate-400 hover:text-indigo-600 p-1 -mr-1 rounded-lg hover:bg-slate-50 transition" title="Modifier le solde initial de CP">
          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
        </button>
      </div>
      <p id="cp-count" class="text-3xl font-extrabold text-slate-900 mt-1 tabular-nums">25,0</p>
      <div class="flex items-center justify-between mt-1">
        <span class="text-xs text-emerald-600 font-medium">jours restants</span>
        <span id="cp-initial" class="text-[11px] text-slate-400 font-medium tabular-nums">sur 25j</span>
      </div>
    </div>
    
    <div class="bg-white p-4 rounded-2xl border border-slate-200/80">
      <div class="flex items-center justify-between">
        <span class="text-xs text-slate-500 font-semibold">RTT</span>
        <button onclick="toggleQuotaModal(true, 'rtt')" class="text-slate-400 hover:text-indigo-600 p-1 -mr-1 rounded-lg hover:bg-slate-50 transition" title="Modifier le solde initial de RTT">
          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
        </button>
      </div>
      <p id="rtt-count" class="text-3xl font-extrabold text-indigo-600 mt-1 tabular-nums">10,0</p>
      <div class="flex items-center justify-between mt-1">
        <span class="text-xs text-indigo-600 font-medium">jours restants</span>
        <span id="rtt-initial" class="text-[11px] text-slate-400 font-medium tabular-nums">sur 10j</span>
      </div>
    </div>
  </div>

  <!-- Bouton d'action principal -->
  <button onclick="toggleModal(true)" class="w-full bg-indigo-600 text-white font-bold py-3.5 px-4 rounded-2xl shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition mb-8 flex items-center justify-center gap-2">
    <i data-lucide="plus-circle" class="w-5 h-5"></i>
    <span>Poser un jour off</span>
  </button>

  <!-- Module Optimiseur de Ponts 2026 -->
  <section class="mb-8">
    <div class="flex items-center justify-between mb-3">
      <div>
        <h2 class="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
          <i data-lucide="sparkles" class="w-4 h-4 text-indigo-600"></i>
          Bons plans de ponts 2026
        </h2>
        <p class="text-xs text-slate-500">Détectés automatiquement selon les 11 jours fériés</p>
      </div>
      <div class="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl text-xs font-semibold">
        <button id="pref-rtt" onclick="setBridgePref('RTT')" class="px-2.5 py-1 rounded-lg bg-white text-indigo-700 shadow-sm transition">RTT</button>
        <button id="pref-cp" onclick="setBridgePref('CP')" class="px-2.5 py-1 rounded-lg text-slate-600 hover:text-slate-900 transition">CP</button>
      </div>
    </div>

    <div id="bridges-list" class="space-y-3"></div>
  </section>

  <!-- Liste des absences -->
  <section>
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-sm font-extrabold text-slate-900">Mes jours posés</h2>
      <span id="leaves-total-badge" class="text-xs text-slate-500 font-medium tabular-nums">0 jour posé</span>
    </div>
    <div id="leave-list" class="space-y-2"></div>
  </section>

  <!-- Modal 1 : Poser un jour off -->
  <div id="modal" class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm hidden flex items-end sm:items-center justify-center p-4 z-50">
    <div class="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4">
      <div class="flex justify-between items-center">
        <h3 class="font-extrabold text-slate-800 text-lg">Nouveau jour off</h3>
        <button onclick="toggleModal(false)" class="text-slate-400 hover:text-slate-600 p-1">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <form id="leave-form" onsubmit="saveLeave(event)" class="space-y-3">
        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Type de congé</label>
          <select id="leave-type" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-medium focus:outline-indigo-600">
            <option value="CP">Congé Payé (CP)</option>
            <option value="RTT">RTT</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Date</label>
          <input type="date" id="leave-date" min="2026-01-01" max="2026-12-31" required class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-medium focus:outline-indigo-600">
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Durée (jours)</label>
          <input type="number" id="leave-days" step="0.5" min="0.5" value="1" required class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-medium focus:outline-indigo-600">
        </div>

        <div class="pt-2 flex gap-2">
          <button type="button" onclick="toggleModal(false)" class="w-1/2 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition">
            Annuler
          </button>
          <button type="submit" class="w-1/2 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition">
            Valider
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal 2 : Modifier les soldes de départ (CP et RTT) -->
  <div id="quota-modal" class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm hidden flex items-end sm:items-center justify-center p-4 z-50">
    <div class="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4">
      <div class="flex justify-between items-center">
        <h3 class="font-extrabold text-slate-800 text-lg">Soldes de départ 2026</h3>
        <button onclick="toggleQuotaModal(false)" class="text-slate-400 hover:text-slate-600 p-1">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <form onsubmit="saveQuotas(event)" class="space-y-3">
        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Solde initial Congés Payés (CP)</label>
          <input type="number" id="quota-cp" step="0.5" min="0" max="120" required class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold focus:outline-indigo-600">
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Solde initial RTT</label>
          <input type="number" id="quota-rtt" step="0.5" min="0" max="120" required class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-indigo-600 focus:outline-indigo-600">
        </div>

        <div class="pt-2 flex gap-2">
          <button type="button" onclick="toggleQuotaModal(false)" class="w-1/2 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition">
            Annuler
          </button>
          <button type="submit" class="w-1/2 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition">
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal 3 : Connexion / Inscription Supabase -->
  <div id="auth-modal" class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm hidden flex items-end sm:items-center justify-center p-4 z-50">
    <div class="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4">
      <div class="flex justify-between items-center">
        <div>
          <h3 id="auth-modal-title" class="font-extrabold text-slate-800 text-lg">Connexion Cloud</h3>
          <p class="text-xs text-slate-500">Synchronisez vos congés et RTT sur Supabase</p>
        </div>
        <button onclick="toggleAuthModal(false)" class="text-slate-400 hover:text-slate-600 p-1">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>

      <!-- État connecté -->
      <div id="auth-logged-in-view" class="hidden space-y-3">
        <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-3.5 text-xs text-indigo-950">
          <p class="font-bold">Connecté en tant que :</p>
          <p id="auth-user-email" class="font-semibold text-indigo-700 truncate mt-0.5"></p>
          <p class="text-[11px] text-slate-500 mt-1">Vos données sont automatiquement synchronisées avec la table <code class="bg-white px-1 py-0.5 rounded border border-indigo-200">user_settings</code>.</p>
        </div>

        <button type="button" onclick="handleSignOut()" class="w-full bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 font-bold py-3 rounded-xl transition">
          Se déconnecter
        </button>
      </div>

      <!-- Formulaire Connexion / Inscription -->
      <form id="auth-form" onsubmit="handleAuthSubmit(event)" class="space-y-3">
        <div class="flex p-1 bg-slate-100 rounded-xl text-xs font-bold">
          <button type="button" id="tab-login" onclick="setAuthTab('login')" class="w-1/2 py-1.5 rounded-lg bg-white text-slate-900 shadow-xs transition">
            Connexion
          </button>
          <button type="button" id="tab-signup" onclick="setAuthTab('signup')" class="w-1/2 py-1.5 rounded-lg text-slate-500 transition">
            Inscription
          </button>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Email</label>
          <input type="email" id="auth-email" required placeholder="nom@exemple.com" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-medium focus:outline-indigo-600">
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-600 mb-1">Mot de passe</label>
          <input type="password" id="auth-password" required minlength="6" placeholder="••••••••" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-medium focus:outline-indigo-600">
        </div>

        <div id="auth-message" class="text-xs font-medium hidden"></div>

        <button type="submit" id="auth-submit-btn" class="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition">
          Se connecter
        </button>

        <p class="text-[11px] text-slate-400 text-center">
          Fallback automatique sur localStorage en mode hors ligne.
        </p>
      </form>
    </div>
  </div>

  <script>
    // 1. Initialisation de Supabase
    const SUPABASE_URL = 'https://nrkasxobntwgodzbpcgp.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ya2FzeG9ibnR3Z29kemJwY2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5MTY3NDQsImV4cCI6MjEwNjQ5Mjc0NH0.ra-rgmgLzYihHUBuTCJPanKL59Wue8pVdSDKyt_v_Qo';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let currentUser = null;
    let authMode = 'login'; // 'login' ou 'signup'

    // 2. Données et Jours Fériés 2026
    const JOURS_FERIES_2026 = [
      { date: '2026-01-01', nom: "Jour de l'An" },
      { date: '2026-04-06', nom: 'Lundi de Pâques' },
      { date: '2026-05-01', nom: 'Fête du Travail' },
      { date: '2026-05-08', nom: 'Victoire 1945' },
      { date: '2026-05-14', nom: 'Ascension' },
      { date: '2026-05-25', nom: 'Lundi de Pentecôte' },
      { date: '2026-07-14', nom: 'Fête Nationale' },
      { date: '2026-08-15', nom: 'Assomption' },
      { date: '2026-11-01', nom: 'Toussaint' },
      { date: '2026-11-11', nom: 'Armistice 1918' },
      { date: '2026-12-25', nom: 'Noël' }
    ];

    let leaves = JSON.parse(localStorage.getItem('joursoff_data')) || [];
    let quotas = JSON.parse(localStorage.getItem('joursoff_quotas_2026')) || { cp: 25, rtt: 10 };
    let bridgeLeaveType = 'RTT';

    // 3. Synchronisation Supabase (table user_settings)
    async function syncFromSupabase() {
      if (!currentUser) return;
      try {
        const { data, error } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', currentUser.id)
          .maybeSingle();

        if (error) {
          console.warn('Erreur lecture user_settings:', error.message);
          return;
        }

        if (data) {
          let loadedLeaves = null;
          let loadedQuotas = null;

          if (Array.isArray(data.leaves)) loadedLeaves = data.leaves;
          else if (typeof data.leaves === 'string') {
            try { loadedLeaves = JSON.parse(data.leaves); } catch (e) {}
          } else if (data.data?.leaves) loadedLeaves = data.data.leaves;

          if (data.cp_initial !== undefined || data.rtt_initial !== undefined) {
            loadedQuotas = { cp: Number(data.cp_initial ?? 25), rtt: Number(data.rtt_initial ?? 10) };
          } else if (data.quotas && typeof data.quotas === 'object') loadedQuotas = data.quotas;
          else if (typeof data.quotas === 'string') {
            try { loadedQuotas = JSON.parse(data.quotas); } catch (e) {}
          } else if (data.cp_quota !== undefined || data.rtt_quota !== undefined) {
            loadedQuotas = { cp: Number(data.cp_quota ?? 25), rtt: Number(data.rtt_quota ?? 10) };
          } else if (data.data?.quotas) loadedQuotas = data.data.quotas;

          if (loadedLeaves) {
            leaves = loadedLeaves;
            localStorage.setItem('joursoff_data', JSON.stringify(leaves));
          }
          if (loadedQuotas) {
            quotas = loadedQuotas;
            localStorage.setItem('joursoff_quotas_2026', JSON.stringify(quotas));
          }
          render();
        } else {
          // Aucun enregistrement distant, on pousse le local seulement si des congés existent
          if (leaves && Array.isArray(leaves) && leaves.length > 0) {
            syncToCloud();
          }
        }
      } catch (err) {
        console.error('Erreur syncFromSupabase:', err);
      }
    }

    async function syncToCloud() {
      // Toujours persister en local (fallback)
      localStorage.setItem('joursoff_data', JSON.stringify(leaves));
      localStorage.setItem('joursoff_quotas_2026', JSON.stringify(quotas));

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) {
        alert(authError.message);
        return;
      }

      const authUser = authData?.user;
      if (!authUser) {
        alert("Erreur de synchronisation Supabase : Aucun utilisateur connecté (supabase.auth.getUser() est vide). Veuillez vous connecter.");
        return;
      }

      const userId = authUser.id;
      const updatedAt = new Date().toISOString();

      const payload = {
        user_id: userId,
        leaves: leaves,
        cp_initial: quotas.cp,
        rtt_initial: quotas.rtt,
        updated_at: updatedAt
      };

      try {
        let { error } = await supabase
          .from('user_settings')
          .upsert(payload, { onConflict: 'user_id' });

        if (error && error.message && error.message.includes('ON CONFLICT')) {
          const { data: existing } = await supabase
            .from('user_settings')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();

          const fallbackRes = await supabase
            .from('user_settings')
            .upsert({
              ...(existing?.id ? { id: existing.id } : { id: userId }),
              ...payload
            });
          error = fallbackRes.error;
        }

        if (error) {
          alert(error.message);
          console.error('Erreur Supabase upsert user_settings:', error);
        }
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        alert(msg);
        console.error('Erreur syncToCloud:', err);
      }
    }
    const syncToSupabase = syncToCloud;

    // 4. Gestion de Session & Authentification
    async function initSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        updateUserState(session?.user || null);

        supabase.auth.onAuthStateChange((_event, session) => {
          updateUserState(session?.user || null);
        });
      } catch (e) {
        console.warn('Supabase session init error:', e);
      }
    }

    function updateUserState(user) {
      currentUser = user;
      const dot = document.getElementById('sync-dot');
      const text = document.getElementById('sync-text');
      const authBtnLabel = document.getElementById('auth-btn-label');
      const actionBtn = document.getElementById('sync-action-btn');
      const loggedView = document.getElementById('auth-logged-in-view');
      const authForm = document.getElementById('auth-form');
      const userEmailEl = document.getElementById('auth-user-email');

      if (user) {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
        text.innerText = \`Connecté (\${user.email})\`;
        authBtnLabel.innerText = user.email.split('@')[0];
        actionBtn.innerText = 'Compte';
        loggedView.classList.remove('hidden');
        authForm.classList.add('hidden');
        userEmailEl.innerText = user.email;
        syncFromSupabase();
      } else {
        dot.className = 'w-2 h-2 rounded-full bg-amber-400';
        text.innerText = 'Mode local (non connecté)';
        authBtnLabel.innerText = 'Connexion';
        actionBtn.innerText = 'Synchroniser';
        loggedView.classList.add('hidden');
        authForm.classList.remove('hidden');
      }
      if (window.lucide) window.lucide.createIcons();
    }

    function toggleAuthModal(show) {
      document.getElementById('auth-modal').classList.toggle('hidden', !show);
      const msg = document.getElementById('auth-message');
      msg.classList.add('hidden');
      msg.innerText = '';
    }

    function setAuthTab(mode) {
      authMode = mode;
      const tabLogin = document.getElementById('tab-login');
      const tabSignup = document.getElementById('tab-signup');
      const submitBtn = document.getElementById('auth-submit-btn');

      if (mode === 'login') {
        tabLogin.className = 'w-1/2 py-1.5 rounded-lg bg-white text-slate-900 shadow-xs transition';
        tabSignup.className = 'w-1/2 py-1.5 rounded-lg text-slate-500 transition';
        submitBtn.innerText = 'Se connecter';
      } else {
        tabSignup.className = 'w-1/2 py-1.5 rounded-lg bg-white text-slate-900 shadow-xs transition';
        tabLogin.className = 'w-1/2 py-1.5 rounded-lg text-slate-500 transition';
        submitBtn.innerText = "Créer mon compte";
      }
    }

    async function handleAuthSubmit(e) {
      e.preventDefault();
      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;
      const submitBtn = document.getElementById('auth-submit-btn');
      const msg = document.getElementById('auth-message');

      submitBtn.disabled = true;
      submitBtn.innerText = 'Vérification...';
      msg.classList.add('hidden');

      try {
        if (authMode === 'login') {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          toggleAuthModal(false);
        } else {
          const { error } = await supabase.auth.signUp({ email, password });
          if (error) throw error;
          msg.className = 'text-xs font-semibold text-emerald-600 block';
          msg.innerText = 'Compte créé ! Vérifiez votre boîte mail si la confirmation est activée.';
          setTimeout(() => toggleAuthModal(false), 2000);
        }
      } catch (err) {
        msg.className = 'text-xs font-semibold text-red-600 block';
        msg.innerText = err.message || 'Erreur d\\'authentification';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = authMode === 'login' ? 'Se connecter' : "Créer mon compte";
      }
    }

    async function handleSignOut() {
      await supabase.auth.signOut();
      toggleAuthModal(false);
    }

    // 5. Utilitaires Calendrier & Ponts
    function parseLocal(iso) {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    function addDaysIso(iso, offset) {
      const d = parseLocal(iso);
      d.setDate(d.getDate() + offset);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return \`\${y}-\${m}-\${day}\`;
    }

    function formatShortFr(iso) {
      return parseLocal(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }

    function detectBridges2026() {
      const opportunities = [];
      JOURS_FERIES_2026.forEach(ferie => {
        const dt = parseLocal(ferie.date);
        const dow = dt.getDay();

        if (dow === 4) {
          const vendredi = addDaysIso(ferie.date, 1);
          const dimanche = addDaysIso(ferie.date, 3);
          opportunities.push({
            nomFerie: ferie.nom,
            jourFerieLabel: \`Jeudi \${formatShortFr(ferie.date)}\`,
            datesAPoser: [vendredi],
            labelAPoser: \`Vendredi \${formatShortFr(vendredi)}\`,
            periodeRepos: \`Du jeu. \${formatShortFr(ferie.date)} au dim. \${formatShortFr(dimanche)}\`,
            joursPoses: 1,
            joursRepos: 4,
            badge: 'Pont Royal · 4j de repos'
          });
        }

        if (dow === 2) {
          const samedi = addDaysIso(ferie.date, -3);
          const lundi = addDaysIso(ferie.date, -1);
          opportunities.push({
            nomFerie: ferie.nom,
            jourFerieLabel: \`Mardi \${formatShortFr(ferie.date)}\`,
            datesAPoser: [lundi],
            labelAPoser: \`Lundi \${formatShortFr(lundi)}\`,
            periodeRepos: \`Du sam. \${formatShortFr(samedi)} au mar. \${formatShortFr(ferie.date)}\`,
            joursPoses: 1,
            joursRepos: 4,
            badge: 'Pont Royal · 4j de repos'
          });
        }

        if (dow === 3) {
          const jeudi = addDaysIso(ferie.date, 1);
          const vendredi = addDaysIso(ferie.date, 2);
          const dimanche = addDaysIso(ferie.date, 4);
          opportunities.push({
            nomFerie: ferie.nom,
            jourFerieLabel: \`Mercredi \${formatShortFr(ferie.date)}\`,
            datesAPoser: [jeudi, vendredi],
            labelAPoser: \`Jeu. \${parseLocal(jeudi).getDate()} & Ven. \${formatShortFr(vendredi)}\`,
            periodeRepos: \`Du mer. \${formatShortFr(ferie.date)} au dim. \${formatShortFr(dimanche)}\`,
            joursPoses: 2,
            joursRepos: 5,
            badge: 'Viaduc · 5j de repos'
          });
        }
      });
      return opportunities;
    }

    function setBridgePref(type) {
      bridgeLeaveType = type;
      document.getElementById('pref-rtt').className = type === 'RTT'
        ? 'px-2.5 py-1 rounded-lg bg-white text-indigo-700 shadow-sm transition'
        : 'px-2.5 py-1 rounded-lg text-slate-600 hover:text-slate-900 transition';
      document.getElementById('pref-cp').className = type === 'CP'
        ? 'px-2.5 py-1 rounded-lg bg-white text-emerald-700 shadow-sm transition'
        : 'px-2.5 py-1 rounded-lg text-slate-600 hover:text-slate-900 transition';
      render();
    }

    function toggleModal(show) {
      document.getElementById('modal').classList.toggle('hidden', !show);
    }

    function toggleQuotaModal(show, focusTarget) {
      const el = document.getElementById('quota-modal');
      if (show) {
        document.getElementById('quota-cp').value = quotas.cp;
        document.getElementById('quota-rtt').value = quotas.rtt;
        el.classList.remove('hidden');
        setTimeout(() => {
          document.getElementById(focusTarget === 'rtt' ? 'quota-rtt' : 'quota-cp').focus();
        }, 50);
      } else {
        el.classList.add('hidden');
      }
    }

    function saveQuotas(e) {
      e.preventDefault();
      const cp = parseFloat(document.getElementById('quota-cp').value);
      const rtt = parseFloat(document.getElementById('quota-rtt').value);
      if (!isNaN(cp) && cp >= 0 && !isNaN(rtt) && rtt >= 0) {
        quotas = { cp, rtt };
        syncToSupabase();
        toggleQuotaModal(false);
        render();
      }
    }

    function bookBridgeOneClick(encodedDates, labelFerie) {
      const dates = encodedDates.split(',');
      dates.forEach((dateStr, idx) => {
        if (!leaves.some(item => item.date === dateStr)) {
          leaves.push({
            id: Date.now() + idx,
            type: bridgeLeaveType,
            date: dateStr,
            days: 1,
            label: 'Pont ' + labelFerie
          });
        }
      });
      leaves.sort((a, b) => a.date.localeCompare(b.date));
      syncToSupabase();
      render();
    }

    function saveLeave(e) {
      e.preventDefault();
      const type = document.getElementById('leave-type').value;
      const date = document.getElementById('leave-date').value;
      const days = parseFloat(document.getElementById('leave-days').value);

      leaves.push({ id: Date.now(), type, date, days });
      leaves.sort((a, b) => a.date.localeCompare(b.date));
      syncToSupabase();
      toggleModal(false);
      document.getElementById('leave-form').reset();
      render();
    }

    function deleteLeave(id) {
      leaves = leaves.filter(item => item.id !== id);
      syncToSupabase();
      render();
    }

    function render() {
      const bridgesContainer = document.getElementById('bridges-list');
      const bridges = detectBridges2026();
      bridgesContainer.innerHTML = '';

      bridges.forEach(b => {
        const isAlreadyBooked = b.datesAPoser.every(d => leaves.some(l => l.date === d));
        const datesParam = b.datesAPoser.join(',');

        bridgesContainer.innerHTML += \`
          <div class="bg-white p-4 rounded-2xl border \${isAlreadyBooked ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200/80'} transition">
            <div class="flex justify-between items-start gap-2">
              <div>
                <div class="text-xs text-indigo-600 font-semibold">\${b.nomFerie} (\${b.jourFerieLabel}) · \${b.badge}</div>
                <h3 class="text-sm font-extrabold text-slate-900 mt-0.5">Poser le \${b.labelAPoser}</h3>
                <p class="text-xs text-slate-500 mt-0.5">\${b.periodeRepos} · <strong class="text-slate-700">\${b.joursPoses} j posé = \${b.joursRepos} j off</strong></p>
              </div>
              \${isAlreadyBooked ? \`
                <span class="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100/80 px-3 py-2 rounded-xl shrink-0">
                  <i data-lucide="check" class="w-4 h-4"></i>
                  Posé
                </span>
              \` : \`
                <button onclick="bookBridgeOneClick('\${datesParam}', '\${b.nomFerie.replace(/'/g, "\\\\'") }')" class="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition shrink-0 cursor-pointer">
                  <i data-lucide="zap" class="w-3.5 h-3.5"></i>
                  + Poser en 1 clic (\${bridgeLeaveType})
                </button>
              \`}
            </div>
          </div>
        \`;
      });

      const list = document.getElementById('leave-list');
      list.innerHTML = '';

      let cpTotal = Number(quotas.cp) || 0;
      let rttTotal = Number(quotas.rtt) || 0;
      let totalDaysBooked = 0;

      if (leaves.length === 0) {
        list.innerHTML = \`
          <div class="bg-white rounded-2xl border border-slate-200/70 p-6 text-center">
            <p class="text-xs text-slate-400 italic">Aucun jour posé pour l'instant.</p>
          </div>
        \`;
      } else {
        leaves.forEach(item => {
          if (item.type === 'CP') cpTotal -= item.days;
          if (item.type === 'RTT') rttTotal -= item.days;
          totalDaysBooked += item.days;

          const dateFormatted = parseLocal(item.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

          list.innerHTML += \`
            <div class="bg-white p-3.5 rounded-xl border border-slate-200/80 flex justify-between items-center">
              <div class="flex items-center gap-2.5">
                <span class="text-xs font-extrabold \${item.type === 'CP' ? 'text-emerald-700' : 'text-indigo-600'}">\${item.type}</span>
                <span class="text-slate-300">·</span>
                <span class="text-xs font-semibold text-slate-800 capitalize">\${dateFormatted}</span>
                \${item.label ? \`<span class="text-xs text-slate-400">· \${item.label}</span>\` : ''}
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs font-bold text-slate-600 tabular-nums">-\${item.days} j</span>
                <button onclick="deleteLeave(\${item.id})" class="text-slate-400 hover:text-red-600 transition p-1" title="Supprimer">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>
          \`;
        });
      }

      document.getElementById('cp-count').innerText = cpTotal.toFixed(1).replace('.', ',');
      document.getElementById('rtt-count').innerText = rttTotal.toFixed(1).replace('.', ',');
      document.getElementById('cp-initial').innerText = \`sur \${String(quotas.cp).replace('.', ',')}j\`;
      document.getElementById('rtt-initial').innerText = \`sur \${String(quotas.rtt).replace('.', ',')}j\`;
      document.getElementById('leaves-total-badge').innerText = \`\${totalDaysBooked.toString().replace('.', ',')} jour\${totalDaysBooked > 1 ? 's' : ''} posé\${totalDaysBooked > 1 ? 's' : ''}\`;

      if (window.lucide) {
        window.lucide.createIcons();
      }
    }

    // Initialisation
    initSession();
    render();
  </script>
</body>
</html>`;
