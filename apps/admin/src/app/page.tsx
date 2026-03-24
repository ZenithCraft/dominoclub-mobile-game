'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { adminApi } from '../lib/api';

type Tab = 'overview' | 'users' | 'games' | 'financial';

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
    { id: 'overview', label: '📊 Overview' },
    { id: 'users',    label: '👥 Usuários' },
    { id: 'games',    label: '🎲 Partidas' },
    { id: 'financial',label: '💰 Financeiro' },
  ] as const;

  return (
    <div className="min-h-screen bg-[#0a1f0a]">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 bottom-0 w-56 bg-[#071507] border-r border-green-900/30 flex flex-col">
        <div className="p-4 border-b border-green-900/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-12 bg-[#4ade80] rounded flex flex-col items-center justify-around p-1">
              {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-[#0a1f0a] rounded-full" />)}
            </div>
            <div>
              <p className="text-white font-black text-sm tracking-widest">DOMINO</p>
              <p className="text-[#4ade80] font-black text-sm tracking-widest">CLUB</p>
            </div>
          </div>
          <p className="text-green-600 text-xs mt-1">Admin Dashboard</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === item.id
                  ? 'bg-[#4ade80]/20 text-[#4ade80] border border-[#4ade80]/30'
                  : 'text-green-700 hover:text-green-400 hover:bg-white/5'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-green-900/30 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#4ade80] rounded-full animate-pulse" />
            <span className="text-green-600 text-xs">Sistema online</span>
          </div>
          <button
            onClick={() => handleLogout(router)}
            className="w-full text-left text-xs text-green-800 hover:text-red-400 transition-colors"
          >
            Sair →
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="ml-56 p-6">
        {tab === 'overview'  && <OverviewTab />}
        {tab === 'users'     && <UsersTab />}
        {tab === 'games'     && <GamesTab />}
        {tab === 'financial' && <FinancialTab />}
      </div>
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <div className="bg-[#0f2e0f] rounded-xl p-5 border border-green-900/30 flex items-center gap-4">
      <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl" style={{ backgroundColor: `${color}22` }}>
        {icon}
      </div>
      <div>
        <p className="text-green-600 text-xs uppercase font-semibold tracking-wide">{label}</p>
        <p className="text-white text-2xl font-black">{value}</p>
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
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="px-3 py-1 rounded bg-[#0f2e0f] border border-green-900/30 text-green-600 disabled:opacity-30 text-sm">‹</button>
      <span className="text-green-600 text-sm">{page} / {pages}</span>
      <button disabled={page >= pages} onClick={() => onChange(page + 1)} className="px-3 py-1 rounded bg-[#0f2e0f] border border-green-900/30 text-green-600 disabled:opacity-30 text-sm">›</button>
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
        <h1 className="text-2xl font-black text-white">Overview</h1>
        <button onClick={reload} className="text-green-600 text-sm hover:text-[#4ade80]">↻ Atualizar</button>
      </div>

      {loading ? <Skeleton rows={6} /> : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard label="Usuários" value={(stats.totalUsers ?? 0).toLocaleString()} icon="👥" color="#4ade80" />
            <StatCard label="Online agora" value={stats.onlineNow ?? 0} icon="🟢" color="#4ade80" />
            <StatCard label="Receita 24h" value={`R$ ${(stats.revenue24h ?? 0).toFixed(2)}`} icon="💰" color="#facc15" />
            <StatCard label="Partidas ativas" value={stats.activeGames ?? 0} icon="🎲" color="#60a5fa" />
            <StatCard label="Depósitos 24h" value={stats.deposits24h ?? 0} icon="⬆️" color="#4ade80" />
            <StatCard label="Saques 24h" value={stats.withdrawals24h ?? 0} icon="⬇️" color="#f87171" />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-[#0f2e0f] rounded-xl p-5 border border-green-900/30">
              <h2 className="text-white font-bold mb-4">Receita (últimos 7 dias)</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={revenueWeek}>
                  <XAxis dataKey="day" stroke="#4b7a4b" tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <YAxis stroke="#4b7a4b" tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f2e0f', border: '1px solid #4ade8033', borderRadius: 8 }} />
                  <Bar dataKey="revenue" fill="#4ade80" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-[#0f2e0f] rounded-xl p-5 border border-green-900/30">
              <h2 className="text-white font-bold mb-4">Partidas (últimos 7 dias)</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={revenueWeek}>
                  <XAxis dataKey="day" stroke="#4b7a4b" tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <YAxis stroke="#4b7a4b" tick={{ fill: '#6b7280', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f2e0f', border: '1px solid #4ade8033', borderRadius: 8 }} />
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

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); setQuery(search); };

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
            className="bg-[#0f2e0f] border border-green-900/30 rounded-lg px-4 py-2 text-white text-sm placeholder:text-green-900 focus:outline-none focus:border-[#4ade80]/50 w-64"
            placeholder="Nome, telefone ou CPF..."
          />
          <button type="submit" className="bg-[#4ade80] text-black font-bold px-4 py-2 rounded-lg text-sm">Buscar</button>
        </form>
      </div>

      {error ? <ErrorBox msg={error} onRetry={reload} /> : loading ? <Skeleton /> : (
        <>
          <div className="bg-[#0f2e0f] rounded-xl border border-green-900/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-green-900/30">
                  {['Nome', 'Telefone', 'Saldo real', 'Partidas', 'Fraude', 'Status', 'Ações'].map(h => (
                    <th key={h} className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.users ?? []).map((u: any) => (
                  <tr key={u.id} className="border-b border-green-900/20 hover:bg-white/5">
                    <td className="p-4 text-white font-medium">{u.name || <span className="text-green-800 italic">sem nome</span>}</td>
                    <td className="p-4 text-green-600 font-mono text-xs">{u.phone}</td>
                    <td className="p-4 text-[#facc15] font-bold">R$ {(u.wallet?.real_balance ?? 0).toFixed(2)}</td>
                    <td className="p-4 text-white">{u._count?.gamePlayers ?? 0}</td>
                    <td className="p-4">
                      {u._count?.fraudLogs > 0 && (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-900/50 text-red-400">
                          ⚠ {u._count.fraudLogs}
                        </span>
                      )}
                    </td>
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
                  <tr><td colSpan={7} className="p-8 text-center text-green-800">Nenhum usuário encontrado</td></tr>
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
            className="bg-[#0f2e0f] border border-green-900/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
          >
            <option value="">Todos os status</option>
            <option value="PLAYING">Em andamento</option>
            <option value="FINISHED">Finalizadas</option>
            <option value="WAITING">Aguardando</option>
          </select>
          <button onClick={reload} className="text-green-600 text-sm hover:text-[#4ade80]">↻</button>
        </div>
      </div>

      {error ? <ErrorBox msg={error} onRetry={reload} /> : loading ? <Skeleton /> : (
        <>
          <div className="bg-[#0f2e0f] rounded-xl border border-green-900/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-green-900/30">
                  {['ID', 'Modo', 'Status', 'Aposta', 'Jogadores', 'Vencedor', 'Criada em', 'Duração'].map(h => (
                    <th key={h} className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.games ?? []).map((g: any) => (
                  <tr key={g.id} className="border-b border-green-900/20 hover:bg-white/5">
                    <td className="p-4 text-green-600 font-mono text-xs">{g.id.slice(0, 8)}</td>
                    <td className="p-4 text-white">{MODE_LABEL[g.mode] || g.mode}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[g.status] || ''}`}>
                        {STATUS_PT[g.status] || g.status}
                      </span>
                    </td>
                    <td className="p-4 text-[#facc15] font-bold">R$ {g.bet_amount}</td>
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
                  <tr><td colSpan={8} className="p-8 text-center text-green-800">Nenhuma partida encontrada</td></tr>
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
              <div className="bg-[#0f2e0f] rounded-lg px-4 py-2 border border-green-900/30 text-sm">
                <span className="text-green-600">Saques pendentes: </span>
                <span className="text-red-400 font-bold">
                  R$ {(data.pendingWithdrawalsTotal ?? 0).toFixed(2)} ({data.pendingWithdrawalsCount ?? 0})
                </span>
              </div>
            </>
          )}
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
            className="bg-[#0f2e0f] border border-green-900/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
          >
            <option value="">Todos os tipos</option>
            <option value="DEPOSIT">Depósitos</option>
            <option value="WITHDRAWAL">Saques</option>
          </select>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-[#0f2e0f] border border-green-900/30 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
          >
            <option value="">Todos os status</option>
            <option value="PENDING">Pendentes</option>
            <option value="COMPLETED">Concluídos</option>
            <option value="FAILED">Falhos</option>
          </select>
          <button onClick={reload} className="text-green-600 text-sm hover:text-[#4ade80]">↻</button>
        </div>
      </div>

      {error ? <ErrorBox msg={error} onRetry={reload} /> : loading ? <Skeleton /> : (
        <>
          <div className="bg-[#0f2e0f] rounded-xl border border-green-900/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-green-900/30">
                  {['Usuário', 'Tipo', 'Valor', 'Chave PIX', 'Status', 'Data', 'Ações'].map(h => (
                    <th key={h} className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.transactions ?? []).map((t: any) => {
                  const user = t.wallet?.user;
                  return (
                    <tr key={t.id} className="border-b border-green-900/20 hover:bg-white/5">
                      <td className="p-4">
                        <p className="text-white font-medium">{user?.name || '?'}</p>
                        <p className="text-green-700 text-xs font-mono">{user?.phone}</p>
                      </td>
                      <td className={`p-4 font-bold ${TX_TYPE_COLOR[t.type] || 'text-gray-400'}`}>
                        {TX_TYPE_PT[t.type] || t.type}
                      </td>
                      <td className={`p-4 font-bold ${t.type === 'WITHDRAWAL' ? 'text-red-400' : 'text-[#4ade80]'}`}>
                        {t.type === 'WITHDRAWAL' ? '-' : '+'}R$ {Math.abs(t.amount).toFixed(2)}
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
