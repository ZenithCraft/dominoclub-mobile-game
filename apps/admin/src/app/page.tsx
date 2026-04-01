'use client';
import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { adminApi } from '../lib/api';
import logo from '../../../mobile/assets/77e79dbf0c599ad464ce3be2691d2da40106953d.png';

type Tab = 'overview' | 'users' | 'games' | 'financial' | 'tournaments';

type IconProps = { className?: string };

function IconChart({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 20V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 20v-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 20H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconUsers({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z" stroke="currentColor" strokeWidth="2" />
      <path d="M4 20a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconDice({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M8.5 8.5h.01" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M15.5 15.5h.01" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M15.5 8.5h.01" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M8.5 15.5h.01" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function IconWallet({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2H6a3 3 0 0 0 0 6h15v2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M21 11h-4a2 2 0 0 0 0 4h4v-4Z" stroke="currentColor" strokeWidth="2" />
      <path d="M17.5 13h.01" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function IconTrophy({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 4h8v3a4 4 0 0 1-8 0V4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8 7H5a2 2 0 0 0 2 2h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 7h3a2 2 0 0 1-2 2h-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 11v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 19h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 15h4v4h-4v-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function IconRefresh({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 12a8 8 0 1 1-2.34-5.66"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLogout({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 17l1 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 16l4-4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconWarning({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3 2.5 20.5a1.5 1.5 0 0 0 1.3 2.2h16.4a1.5 1.5 0 0 0 1.3-2.2L12 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 9v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 17h.01" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function IconChevronLeft({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronRight({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrowUp({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrowDown({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 13l-6 6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const formatInt = (v: number) => new Intl.NumberFormat('pt-BR').format(v);
const formatMoney = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const toLocalDateTimeInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// ─── Auth guard ───────────────────────────────────────────────────────────────

function useAdminAuth() {
  const router = useRouter();
  useEffect(() => {
    if (!localStorage.getItem('admin_token')) router.replace('/login');
  }, [router]);
}

function handleLogout(router: ReturnType<typeof useRouter>) {
  localStorage.removeItem('admin_token');
  router.replace('/login');
}

// ─── Generic data hook ────────────────────────────────────────────────────────

function useData<T>(url: string, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await adminApi.get(url);
      setData(res);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [url, ...deps]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  useAdminAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');

  const NAV = [
    { id: 'overview', label: 'Visão geral', Icon: IconChart },
    { id: 'users', label: 'Usuários', Icon: IconUsers },
    { id: 'games', label: 'Partidas', Icon: IconDice },
    { id: 'financial', label: 'Financeiro', Icon: IconWallet },
    { id: 'tournaments', label: 'Torneios', Icon: IconTrophy },
  ] as const;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 bottom-0 w-60 bg-black/20 backdrop-blur border-r border-white/10 flex flex-col">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <img src={logo.src} alt="DominoClub" className="h-12 w-auto" />
          </div>
          <p className="text-green-600 text-xs mt-1">Admin Dashboard</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center gap-3 ${
                tab === item.id
                  ? 'bg-white/5 text-white border border-white/10'
                  : 'text-green-700 hover:text-white hover:bg-white/5'
              }`}
            >
              <item.Icon className={`w-5 h-5 ${tab === item.id ? 'text-[#4ade80]' : 'text-green-700'}`} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#4ade80] rounded-full animate-pulse" />
            <span className="text-green-600 text-xs">Sistema online</span>
          </div>
          <button
            onClick={() => handleLogout(router)}
            className="w-full text-left text-xs text-green-800 hover:text-red-400 transition-colors flex items-center gap-2"
          >
            <IconLogout className="w-4 h-4" />
            <span>Sair</span>
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="ml-60 p-6">
        {tab === 'overview'  && <OverviewTab />}
        {tab === 'users'     && <UsersTab />}
        {tab === 'games'     && <GamesTab />}
        {tab === 'financial' && <FinancialTab />}
        {tab === 'tournaments' && <TournamentsTab />}
      </div>
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: JSX.Element; color: string }) {
  return (
    <div className="rounded-2xl p-5 border border-white/10 bg-[var(--bg-card)] backdrop-blur shadow-[0_18px_50px_rgba(0,0,0,0.45)] flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}22` }}>
        {icon}
      </div>
      <div>
        <p className="text-green-600 text-xs uppercase font-semibold tracking-wide">{label}</p>
        <p className="text-white text-2xl font-black tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-green-900/20 rounded animate-pulse" />
      ))}
    </div>
  );
}

function ErrorBox({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-6 text-center space-y-3">
      <p className="text-red-400">{msg}</p>
      <button onClick={onRetry} className="text-[#4ade80] text-sm hover:underline">Tentar novamente</button>
    </div>
  );
}

function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="px-3 py-1 rounded-xl bg-[var(--bg-card)] border border-white/10 text-green-600 disabled:opacity-30 text-sm hover:text-white transition-colors"
      >
        <IconChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-green-600 text-sm tabular-nums">{page} / {pages}</span>
      <button
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        className="px-3 py-1 rounded-xl bg-[var(--bg-card)] border border-white/10 text-green-600 disabled:opacity-30 text-sm hover:text-white transition-colors"
      >
        <IconChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data, loading, error, reload } = useData<any>('/stats');

  if (error) return <ErrorBox msg={error} onRetry={reload} />;

  const stats = data ?? {};
  const revenueWeek = (data?.revenueWeek ?? []).map((r: any) => ({
    day: r.day,
    revenue: Number(r.revenue),
    games: Number(r.games),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-white">Visão geral</h1>
        <button
          onClick={reload}
          className="text-green-600 text-sm hover:text-white transition-colors flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10"
        >
          <IconRefresh className="w-4 h-4" />
          <span>Atualizar</span>
        </button>
      </div>

      {loading ? <Skeleton rows={6} /> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
            <StatCard label="Usuários ativos" value={formatInt(Number(stats.totalUsers ?? 0))} icon={<IconUsers className="w-6 h-6 text-[#4ade80]" />} color="#4ade80" />
            <StatCard label="Usuários banidos" value={formatInt(Number(stats.bannedUsers ?? 0))} icon={<IconWarning className="w-6 h-6 text-[#f87171]" />} color="#f87171" />
            <StatCard label="Online agora" value={formatInt(Number(stats.onlineNow ?? 0))} icon={<IconChart className="w-6 h-6 text-[#4ade80]" />} color="#4ade80" />
            <StatCard label="Partidas ativas" value={formatInt(Number(stats.activeGames ?? 0))} icon={<IconDice className="w-6 h-6 text-[#60a5fa]" />} color="#60a5fa" />
            <StatCard label="Receita 24h" value={formatMoney(Number(stats.revenue24h ?? 0))} icon={<IconWallet className="w-6 h-6 text-[#facc15]" />} color="#facc15" />
            <StatCard label="Depósitos 24h (qtd)" value={formatInt(Number(stats.deposits24h ?? 0))} icon={<IconArrowUp className="w-6 h-6 text-[#4ade80]" />} color="#4ade80" />
            <StatCard label="Depósitos 24h (R$)" value={formatMoney(Number(stats.depositsAmount24h ?? 0))} icon={<IconArrowUp className="w-6 h-6 text-[#4ade80]" />} color="#4ade80" />
            <StatCard label="Saques 24h (qtd)" value={formatInt(Number(stats.withdrawals24h ?? 0))} icon={<IconArrowDown className="w-6 h-6 text-[#f87171]" />} color="#f87171" />
            <StatCard label="Saques 24h (R$)" value={formatMoney(Number(stats.withdrawalsAmount24h ?? 0))} icon={<IconArrowDown className="w-6 h-6 text-[#f87171]" />} color="#f87171" />
            <StatCard label="Transações 24h" value={formatInt(Number(stats.totalTransactions24h ?? 0))} icon={<IconWallet className="w-6 h-6 text-[#93c5fd]" />} color="#93c5fd" />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="rounded-2xl p-5 border border-white/10 bg-[var(--bg-card)] backdrop-blur shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
              <h2 className="text-white font-bold mb-4">Receita (últimos 7 dias)</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={revenueWeek}>
                  <XAxis dataKey="day" stroke="#4b7a4b" tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <YAxis stroke="#4b7a4b" tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#071a07', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12 }} />
                  <Bar dataKey="revenue" fill="#4ade80" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-2xl p-5 border border-white/10 bg-[var(--bg-card)] backdrop-blur shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
              <h2 className="text-white font-bold mb-4">Partidas (últimos 7 dias)</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={revenueWeek}>
                  <XAxis dataKey="day" stroke="#4b7a4b" tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <YAxis stroke="#4b7a4b" tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#071a07', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12 }} />
                  <Line type="monotone" dataKey="games" stroke="#facc15" strokeWidth={2} dot={{ fill: '#facc15' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);

  const url = `/users?page=${page}&search=${encodeURIComponent(query)}`;
  const { data, loading, error, reload } = useData<any>(url, [page, query]);

  const handleSearch = (e: FormEvent) => { e.preventDefault(); setPage(1); setQuery(search); };

  const toggleBan = async (user: any) => {
    setActioning(user.id);
    try {
      await adminApi.patch(`/users/${user.id}/ban`, {
        banned: !user.is_banned,
        reason: !user.is_banned ? 'Banido pelo admin' : undefined,
      });
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro');
    } finally {
      setActioning(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-white">Usuários</h1>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-[var(--bg-card)] border border-white/10 rounded-xl px-4 py-2 text-white text-sm placeholder:text-green-800 focus:outline-none focus:border-white/20 w-72"
            placeholder="Nome, telefone ou CPF..."
          />
          <button type="submit" className="bg-[#4ade80] text-black font-bold px-4 py-2 rounded-xl text-sm">Buscar</button>
        </form>
      </div>

      {error ? <ErrorBox msg={error} onRetry={reload} /> : loading ? <Skeleton /> : (
        <>
          <div className="rounded-2xl border border-white/10 bg-[var(--bg-card)] backdrop-blur shadow-[0_18px_50px_rgba(0,0,0,0.45)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['Nome', 'Telefone', 'CPF', 'Saldo real', 'Bônus', 'Partidas', 'Fraude', 'Criado em', 'Status', 'Ações'].map(h => (
                    <th key={h} className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.users ?? []).map((u: any) => (
                  <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-4 text-white font-medium">{u.name || <span className="text-green-800 italic">sem nome</span>}</td>
                    <td className="p-4 text-green-600 font-mono text-xs">{u.phone}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${u.cpf_verified ? 'bg-green-900/50 text-[#4ade80]' : 'bg-yellow-900/50 text-yellow-400'}`}>
                        {u.cpf_verified ? 'Verificado' : 'Pendente'}
                      </span>
                    </td>
                    <td className="p-4 text-[#facc15] font-bold tabular-nums">{formatMoney(Number(u.wallet?.real_balance ?? 0))}</td>
                    <td className="p-4 text-white tabular-nums">{formatMoney(Number(u.wallet?.bonus_balance ?? 0))}</td>
                    <td className="p-4 text-white">{u._count?.gamePlayers ?? 0}</td>
                    <td className="p-4">
                      {u._count?.fraudLogs > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold bg-red-900/50 text-red-200">
                          <IconWarning className="w-4 h-4 text-red-400" />
                          <span className="tabular-nums">{u._count.fraudLogs}</span>
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-green-600 text-xs">{new Date(u.created_at).toLocaleString('pt-BR')}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        u.is_banned ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-[#4ade80]'
                      }`}>
                        {u.is_banned ? 'Banido' : 'Ativo'}
                      </span>
                    </td>
                    <td className="p-4">
                      <button
                        disabled={actioning === u.id}
                        onClick={() => toggleBan(u)}
                        className={`text-xs font-semibold hover:underline ${u.is_banned ? 'text-[#4ade80]' : 'text-red-400'} disabled:opacity-40`}
                      >
                        {actioning === u.id ? '...' : u.is_banned ? 'Desbanir' : 'Banir'}
                      </button>
                    </td>
                  </tr>
                ))}
                {(data?.users ?? []).length === 0 && (
                  <tr><td colSpan={10} className="p-8 text-center text-green-800">Nenhum usuário encontrado</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
        </>
      )}
    </div>
  );
}

// ─── Games Tab ────────────────────────────────────────────────────────────────

const MODE_LABEL: Record<string, string> = {
  ARENA_1V1: 'Arena 1v1', CUP_1V1: 'Copa 1v1',
  TOURNAMENT_2V2: 'Torneio 2x2', RECREATIONAL_2V2: 'Recreativo 2x2',
};
const STATUS_STYLE: Record<string, string> = {
  PLAYING: 'bg-blue-900/50 text-blue-400',
  FINISHED: 'bg-green-900/50 text-[#4ade80]',
  WAITING: 'bg-yellow-900/50 text-yellow-400',
  CANCELLED: 'bg-gray-900/50 text-gray-400',
  ABANDONED: 'bg-red-900/50 text-red-400',
};
const STATUS_PT: Record<string, string> = {
  PLAYING: 'Em andamento', FINISHED: 'Finalizada',
  WAITING: 'Aguardando', CANCELLED: 'Cancelada', ABANDONED: 'Abandonada',
};

function GamesTab() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const url = `/games?page=${page}${statusFilter ? `&status=${statusFilter}` : ''}`;
  const { data, loading, error, reload } = useData<any>(url, [page, statusFilter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-white">Partidas</h1>
        <div className="flex gap-3 items-center">
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-[var(--bg-card)] border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
          >
            <option value="">Todos os status</option>
            <option value="PLAYING">Em andamento</option>
            <option value="FINISHED">Finalizadas</option>
            <option value="WAITING">Aguardando</option>
          </select>
          <button onClick={reload} className="text-green-600 hover:text-white transition-colors p-2 rounded-xl bg-white/5 border border-white/10">
            <IconRefresh className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error ? <ErrorBox msg={error} onRetry={reload} /> : loading ? <Skeleton /> : (
        <>
          <div className="rounded-2xl border border-white/10 bg-[var(--bg-card)] backdrop-blur shadow-[0_18px_50px_rgba(0,0,0,0.45)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['ID', 'Modo', 'Status', 'Aposta', 'Prêmio', 'Taxa', 'Jogadores', 'Vencedor', 'Criada em', 'Duração'].map(h => (
                    <th key={h} className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.games ?? []).map((g: any) => (
                  <tr key={g.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-4 text-green-600 font-mono text-xs">{g.id.slice(0, 8)}</td>
                    <td className="p-4 text-white">{MODE_LABEL[g.mode] || g.mode}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[g.status] || ''}`}>
                        {STATUS_PT[g.status] || g.status}
                      </span>
                    </td>
                    <td className="p-4 text-[#facc15] font-bold tabular-nums">{formatMoney(Number(g.bet_amount ?? 0))}</td>
                    <td className="p-4 text-white tabular-nums">{formatMoney(Number(g.prize_pool ?? 0))}</td>
                    <td className="p-4 text-white tabular-nums">{formatMoney(Number(g.house_fee ?? 0))}</td>
                    <td className="p-4 text-white">
                      {g.players.map((p: any) => p.user.name || '?').join(', ')}
                    </td>
                    <td className="p-4 text-white">{g.winner?.name || '—'}</td>
                    <td className="p-4 text-green-600 text-xs">
                      {new Date(g.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-4 text-white">{g.duration || '—'}</td>
                  </tr>
                ))}
                {(data?.games ?? []).length === 0 && (
                  <tr><td colSpan={10} className="p-8 text-center text-green-800">Nenhuma partida encontrada</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
        </>
      )}
    </div>
  );
}

// ─── Financial Tab ────────────────────────────────────────────────────────────

const TX_TYPE_COLOR: Record<string, string> = {
  DEPOSIT: 'text-[#4ade80]', WITHDRAWAL: 'text-red-400',
  BET: 'text-yellow-400', WIN: 'text-[#facc15]',
};
const TX_TYPE_PT: Record<string, string> = {
  DEPOSIT: 'Depósito', WITHDRAWAL: 'Saque', BET: 'Aposta',
  WIN: 'Prêmio', BONUS: 'Bônus', REFUND: 'Reembolso', FEE: 'Taxa',
};
const TX_STATUS_STYLE: Record<string, string> = {
  COMPLETED: 'bg-green-900/50 text-[#4ade80]',
  PENDING: 'bg-yellow-900/50 text-yellow-400',
  FAILED: 'bg-red-900/50 text-red-400',
  PROCESSING: 'bg-blue-900/50 text-blue-400',
};
const TX_STATUS_PT: Record<string, string> = {
  COMPLETED: 'Concluído', PENDING: 'Pendente', FAILED: 'Falhou', PROCESSING: 'Processando',
};

function FinancialTab() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);

  const url = `/transactions?page=${page}${typeFilter ? `&type=${typeFilter}` : ''}${statusFilter ? `&status=${statusFilter}` : ''}`;
  const { data, loading, error, reload } = useData<any>(url, [page, typeFilter, statusFilter]);

  const approve = async (id: string) => {
    setActioning(id);
    try {
      await adminApi.patch(`/transactions/${id}/approve`);
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao aprovar');
    } finally {
      setActioning(null);
    }
  };

  const reject = async (id: string) => {
    if (!confirm('Rejeitar este saque e devolver o saldo ao usuário?')) return;
    setActioning(id);
    try {
      await adminApi.patch(`/transactions/${id}/reject`);
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao rejeitar');
    } finally {
      setActioning(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-white">Financeiro</h1>
        <div className="flex gap-3 items-center">
          {data && (
            <>
              <div className="bg-[var(--bg-card)] rounded-xl px-4 py-2 border border-white/10 text-sm">
                <span className="text-green-600">Saques pendentes: </span>
                <span className="text-red-400 font-bold">
                  {formatMoney(Number(data.pendingWithdrawalsTotal ?? 0))} ({formatInt(Number(data.pendingWithdrawalsCount ?? 0))})
                </span>
              </div>
            </>
          )}
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
            className="bg-[var(--bg-card)] border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
          >
            <option value="">Todos os tipos</option>
            <option value="DEPOSIT">Depósitos</option>
            <option value="WITHDRAWAL">Saques</option>
          </select>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-[var(--bg-card)] border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
          >
            <option value="">Todos os status</option>
            <option value="PENDING">Pendentes</option>
            <option value="COMPLETED">Concluídos</option>
            <option value="FAILED">Falhos</option>
          </select>
          <button onClick={reload} className="text-green-600 hover:text-white transition-colors p-2 rounded-xl bg-white/5 border border-white/10">
            <IconRefresh className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error ? <ErrorBox msg={error} onRetry={reload} /> : loading ? <Skeleton /> : (
        <>
          <div className="rounded-2xl border border-white/10 bg-[var(--bg-card)] backdrop-blur shadow-[0_18px_50px_rgba(0,0,0,0.45)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['Usuário', 'Tipo', 'Valor', 'Chave PIX', 'Status', 'Data', 'Ações'].map(h => (
                    <th key={h} className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.transactions ?? []).map((t: any) => {
                  const user = t.wallet?.user;
                  return (
                    <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-4">
                        <p className="text-white font-medium">{user?.name || '?'}</p>
                        <p className="text-green-700 text-xs font-mono">{user?.phone}</p>
                      </td>
                      <td className={`p-4 font-bold ${TX_TYPE_COLOR[t.type] || 'text-gray-400'}`}>
                        {TX_TYPE_PT[t.type] || t.type}
                      </td>
                      <td className={`p-4 font-bold ${t.type === 'WITHDRAWAL' ? 'text-red-400' : 'text-[#4ade80]'}`}>
                        {t.type === 'WITHDRAWAL' ? '-' : '+'}{formatMoney(Math.abs(Number(t.amount ?? 0)))}
                      </td>
                      <td className="p-4 text-green-700 font-mono text-xs">
                        {t.pix_key ? t.pix_key.slice(0, 20) + (t.pix_key.length > 20 ? '…' : '') : t.pix_id?.slice(0, 12) || '—'}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${TX_STATUS_STYLE[t.status] || ''}`}>
                          {TX_STATUS_PT[t.status] || t.status}
                        </span>
                      </td>
                      <td className="p-4 text-green-600 text-xs">
                        {new Date(t.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-4">
                        {t.status === 'PENDING' && t.type === 'WITHDRAWAL' && (
                          <div className="flex gap-2">
                            <button
                              disabled={actioning === t.id}
                              onClick={() => approve(t.id)}
                              className="bg-[#4ade80] text-black text-xs font-bold px-3 py-1 rounded disabled:opacity-40"
                            >
                              {actioning === t.id ? '...' : 'Aprovar'}
                            </button>
                            <button
                              disabled={actioning === t.id}
                              onClick={() => reject(t.id)}
                              className="bg-red-900/50 text-red-400 text-xs font-bold px-3 py-1 rounded disabled:opacity-40"
                            >
                              Rejeitar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(data?.transactions ?? []).length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-green-800">Nenhuma transação encontrada</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
        </>
      )}
    </div>
  );
}

const TOURNAMENT_STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-green-900/50 text-[#4ade80]',
  FULL: 'bg-yellow-900/50 text-yellow-400',
  IN_PROGRESS: 'bg-blue-900/50 text-blue-400',
  FINISHED: 'bg-gray-900/50 text-gray-200',
  CANCELLED: 'bg-red-900/50 text-red-300',
};

const TOURNAMENT_STATUS_PT: Record<string, string> = {
  OPEN: 'Aberto',
  FULL: 'Lotado',
  IN_PROGRESS: 'Em andamento',
  FINISHED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

const VARIANT_PT: Record<string, string> = {
  CARROCA: 'Carroça',
  L_E_L: 'L e L',
  CRUZADA: 'Cruzada',
};

function TournamentsTab() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState(() => ({
    name: '',
    mode: 'ARENA_1V1',
    variant: 'CARROCA',
    entryFee: '2',
    maxPlayers: '16',
    startsAt: toLocalDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)),
  }));

  const url = `/tournaments?page=${page}${statusFilter ? `&status=${statusFilter}` : ''}`;
  const { data, loading, error, reload } = useData<any>(url, [page, statusFilter]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await adminApi.post('/tournaments', {
        name: form.name,
        mode: form.mode,
        variant: form.variant,
        entryFee: Number(form.entryFee),
        maxPlayers: Number(form.maxPlayers),
        startsAt: new Date(form.startsAt).toISOString(),
      });
      setForm((prev) => ({ ...prev, name: '' }));
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao criar torneio');
    } finally {
      setCreating(false);
    }
  };

  const start = async (id: string) => {
    if (!confirm('Iniciar este torneio agora?')) return;
    try {
      await adminApi.post(`/tournaments/${id}/start`);
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao iniciar');
    }
  };

  const cancel = async (id: string) => {
    if (!confirm('Cancelar este torneio e reembolsar as inscrições?')) return;
    try {
      await adminApi.post(`/tournaments/${id}/cancel`);
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao cancelar');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-white">Torneios</h1>
        <div className="flex gap-3 items-center">
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-[var(--bg-card)] border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
          >
            <option value="">Todos os status</option>
            <option value="OPEN">Abertos</option>
            <option value="FULL">Lotados</option>
            <option value="IN_PROGRESS">Em andamento</option>
            <option value="FINISHED">Finalizados</option>
            <option value="CANCELLED">Cancelados</option>
          </select>
          <button onClick={reload} className="text-green-600 hover:text-white transition-colors p-2 rounded-xl bg-white/5 border border-white/10">
            <IconRefresh className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[var(--bg-card)] backdrop-blur shadow-[0_18px_50px_rgba(0,0,0,0.45)] p-5 mb-6">
        <h2 className="text-white font-bold mb-4">Criar torneio</h2>
        <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-green-600 text-xs font-semibold uppercase tracking-wide">Nome</label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-white/20"
              placeholder="Ex: Torneio da semana"
              required
            />
          </div>
          <div>
            <label className="text-green-600 text-xs font-semibold uppercase tracking-wide">Modo</label>
            <select
              value={form.mode}
              onChange={(e) => setForm((p) => ({ ...p, mode: e.target.value }))}
              className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
              required
            >
              <option value="ARENA_1V1">Arena 1v1</option>
              <option value="CUP_1V1">Copa 1v1</option>
              <option value="TOURNAMENT_2V2">Torneio 2x2</option>
              <option value="RECREATIONAL_2V2">Recreativo 2x2</option>
            </select>
          </div>
          <div>
            <label className="text-green-600 text-xs font-semibold uppercase tracking-wide">Variante</label>
            <select
              value={form.variant}
              onChange={(e) => setForm((p) => ({ ...p, variant: e.target.value }))}
              className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
            >
              <option value="CARROCA">Carroça</option>
              <option value="L_E_L">L e L</option>
              <option value="CRUZADA">Cruzada</option>
            </select>
          </div>
          <div>
            <label className="text-green-600 text-xs font-semibold uppercase tracking-wide">Entrada (R$)</label>
            <input
              value={form.entryFee}
              onChange={(e) => setForm((p) => ({ ...p, entryFee: e.target.value }))}
              className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-white/20"
              inputMode="decimal"
              required
            />
          </div>
          <div>
            <label className="text-green-600 text-xs font-semibold uppercase tracking-wide">Max. jogadores</label>
            <input
              value={form.maxPlayers}
              onChange={(e) => setForm((p) => ({ ...p, maxPlayers: e.target.value }))}
              className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-white/20"
              inputMode="numeric"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-green-600 text-xs font-semibold uppercase tracking-wide">Início</label>
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))}
              className="mt-1 w-full bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-white/20"
              required
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="w-full bg-[#4ade80] text-black font-bold px-4 py-2 rounded-xl text-sm disabled:opacity-50"
            >
              {creating ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </form>
      </div>

      {error ? <ErrorBox msg={error} onRetry={reload} /> : loading ? <Skeleton /> : (
        <>
          <div className="rounded-2xl border border-white/10 bg-[var(--bg-card)] backdrop-blur shadow-[0_18px_50px_rgba(0,0,0,0.45)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['Nome', 'Modo', 'Variante', 'Status', 'Jogadores', 'Entrada', 'Prêmio', 'Início', 'Ações'].map(h => (
                    <th key={h} className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.tournaments ?? []).map((t: any) => (
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-4">
                      <p className="text-white font-medium">{t.name}</p>
                      <p className="text-green-700 text-xs font-mono">{t.id.slice(0, 8)}</p>
                    </td>
                    <td className="p-4 text-white">{MODE_LABEL[t.mode] || t.mode}</td>
                    <td className="p-4 text-white">{VARIANT_PT[t.variant] || t.variant}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${TOURNAMENT_STATUS_STYLE[t.status] || 'bg-gray-900/50 text-gray-200'}`}>
                        {TOURNAMENT_STATUS_PT[t.status] || t.status}
                      </span>
                    </td>
                    <td className="p-4 text-white tabular-nums">
                      {t.current_players ?? t._count?.players ?? 0}/{t.max_players ?? '—'}
                    </td>
                    <td className="p-4 text-white tabular-nums">{formatMoney(Number(t.entry_fee ?? 0))}</td>
                    <td className="p-4 text-[#facc15] font-bold tabular-nums">{formatMoney(Number(t.prize_pool ?? 0))}</td>
                    <td className="p-4 text-green-600 text-xs">{new Date(t.starts_at).toLocaleString('pt-BR')}</td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {(t.status === 'OPEN' || t.status === 'FULL') && (
                          <button
                            onClick={() => start(t.id)}
                            className="bg-blue-900/50 text-blue-200 text-xs font-bold px-3 py-1 rounded-lg hover:bg-blue-900/70"
                          >
                            Iniciar
                          </button>
                        )}
                        {t.status !== 'FINISHED' && t.status !== 'CANCELLED' && (
                          <button
                            onClick={() => cancel(t.id)}
                            className="bg-red-900/50 text-red-200 text-xs font-bold px-3 py-1 rounded-lg hover:bg-red-900/70"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(data?.tournaments ?? []).length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-green-800">Nenhum torneio encontrado</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
        </>
      )}
    </div>
  );
}
