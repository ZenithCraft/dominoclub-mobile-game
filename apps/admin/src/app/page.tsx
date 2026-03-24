'use client';
import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

async function fetcher(path: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` },
  });
  if (!res.ok) throw new Error('Fetch failed');
  return res.json();
}

const MOCK_STATS = {
  totalUsers: 1247,
  onlineNow: 83,
  revenue24h: 4825.50,
  activeGames: 21,
  deposits24h: 156,
  withdrawals24h: 89,
};

const MOCK_REVENUE = [
  { day: 'Seg', revenue: 1200, games: 45 },
  { day: 'Ter', revenue: 1800, games: 67 },
  { day: 'Qua', revenue: 1400, games: 52 },
  { day: 'Qui', revenue: 2200, games: 88 },
  { day: 'Sex', revenue: 3100, games: 120 },
  { day: 'Sáb', revenue: 4200, games: 165 },
  { day: 'Dom', revenue: 4825, games: 189 },
];

export default function AdminDashboard() {
  const [tab, setTab] = useState<'overview' | 'users' | 'games' | 'financial'>('overview');

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
          {[
            { id: 'overview', label: '📊 Overview' },
            { id: 'users', label: '👥 Usuários' },
            { id: 'games', label: '🎲 Partidas' },
            { id: 'financial', label: '💰 Financeiro' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id as any)}
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

        <div className="p-3 border-t border-green-900/30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#4ade80] rounded-full animate-pulse" />
            <span className="text-green-600 text-xs">Sistema online</span>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="ml-56 p-6">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'games' && <GamesTab />}
        {tab === 'financial' && <FinancialTab />}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <div className={`bg-[#0f2e0f] rounded-xl p-5 border border-green-900/30 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl`} style={{ backgroundColor: `${color}22` }}>
        {icon}
      </div>
      <div>
        <p className="text-green-600 text-xs uppercase font-semibold tracking-wide">{label}</p>
        <p className="text-white text-2xl font-black">{value}</p>
      </div>
    </div>
  );
}

function OverviewTab() {
  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-6">Overview</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Usuários" value={MOCK_STATS.totalUsers.toLocaleString()} icon="👥" color="#4ade80" />
        <StatCard label="Online agora" value={MOCK_STATS.onlineNow} icon="🟢" color="#4ade80" />
        <StatCard label="Receita 24h" value={`R$ ${MOCK_STATS.revenue24h.toFixed(2)}`} icon="💰" color="#facc15" />
        <StatCard label="Partidas ativas" value={MOCK_STATS.activeGames} icon="🎲" color="#60a5fa" />
        <StatCard label="Depósitos 24h" value={MOCK_STATS.deposits24h} icon="⬆️" color="#4ade80" />
        <StatCard label="Saques 24h" value={MOCK_STATS.withdrawals24h} icon="⬇️" color="#f87171" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-[#0f2e0f] rounded-xl p-5 border border-green-900/30">
          <h2 className="text-white font-bold mb-4">Receita (últimos 7 dias)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={MOCK_REVENUE}>
              <XAxis dataKey="day" stroke="#4b7a4b" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis stroke="#4b7a4b" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: '#0f2e0f', border: '1px solid #4ade8033', borderRadius: 8 }} />
              <Bar dataKey="revenue" fill="#4ade80" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#0f2e0f] rounded-xl p-5 border border-green-900/30">
          <h2 className="text-white font-bold mb-4">Partidas (últimos 7 dias)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={MOCK_REVENUE}>
              <XAxis dataKey="day" stroke="#4b7a4b" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis stroke="#4b7a4b" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: '#0f2e0f', border: '1px solid #4ade8033', borderRadius: 8 }} />
              <Line type="monotone" dataKey="games" stroke="#facc15" strokeWidth={2} dot={{ fill: '#facc15' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const mockUsers = [
    { id: 1, name: 'João Silva', phone: '+5511999990001', balance: 245.50, status: 'active', joined: '2024-01-15', games: 23 },
    { id: 2, name: 'Maria Santos', phone: '+5521988880002', balance: 1250.00, status: 'active', joined: '2024-01-10', games: 87 },
    { id: 3, name: 'Pedro Costa', phone: '+5531977770003', balance: 0, status: 'banned', joined: '2024-01-20', games: 5 },
    { id: 4, name: 'Ana Ferreira', phone: '+5541966660004', balance: 88.30, status: 'active', joined: '2024-02-01', games: 34 },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-white">Usuários</h1>
        <div className="flex gap-3">
          <input className="bg-[#0f2e0f] border border-green-900/30 rounded-lg px-4 py-2 text-white text-sm placeholder:text-green-900 focus:outline-none focus:border-[#4ade80]/50" placeholder="Buscar por nome ou telefone..." />
          <button className="bg-[#4ade80] text-black font-bold px-4 py-2 rounded-lg text-sm">Exportar</button>
        </div>
      </div>

      <div className="bg-[#0f2e0f] rounded-xl border border-green-900/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-green-900/30">
              <th className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">Nome</th>
              <th className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">Telefone</th>
              <th className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">Saldo</th>
              <th className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">Partidas</th>
              <th className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">Status</th>
              <th className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody>
            {mockUsers.map((u) => (
              <tr key={u.id} className="border-b border-green-900/20 hover:bg-white/5">
                <td className="p-4 text-white font-medium">{u.name}</td>
                <td className="p-4 text-green-600">{u.phone}</td>
                <td className="p-4 text-[#facc15] font-bold">R$ {u.balance.toFixed(2)}</td>
                <td className="p-4 text-white">{u.games}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    u.status === 'active' ? 'bg-green-900/50 text-[#4ade80]' : 'bg-red-900/50 text-red-400'
                  }`}>
                    {u.status === 'active' ? 'Ativo' : 'Banido'}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    <button className="text-[#4ade80] text-xs hover:underline">Ver</button>
                    <button className="text-red-400 text-xs hover:underline">
                      {u.status === 'active' ? 'Banir' : 'Desbanir'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GamesTab() {
  const mockGames = [
    { id: 'g001', mode: 'ARENA_1V1', status: 'FINISHED', bet: 50, players: 2, winner: 'João Silva', created: '2024-03-22 19:45', duration: '12min' },
    { id: 'g002', mode: 'TOURNAMENT_2V2', status: 'PLAYING', bet: 20, players: 4, winner: '-', created: '2024-03-22 20:01', duration: '8min' },
    { id: 'g003', mode: 'ARENA_1V1', status: 'FINISHED', bet: 100, players: 2, winner: 'Maria Santos', created: '2024-03-22 20:05', duration: '15min' },
  ];

  const modeLabel = (m: string) => ({ ARENA_1V1: 'Arena 1v1', CUP_1V1: 'Copa 1v1', TOURNAMENT_2V2: 'Torneio 2x2', RECREATIONAL_2V2: 'Recreativo 2x2' }[m] || m);

  return (
    <div>
      <h1 className="text-2xl font-black text-white mb-6">Partidas</h1>
      <div className="bg-[#0f2e0f] rounded-xl border border-green-900/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-green-900/30">
              {['ID', 'Modo', 'Status', 'Aposta', 'Vencedor', 'Criada em', 'Duração', 'Replay'].map(h => (
                <th key={h} className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mockGames.map((g) => (
              <tr key={g.id} className="border-b border-green-900/20 hover:bg-white/5">
                <td className="p-4 text-green-600 font-mono text-xs">{g.id}</td>
                <td className="p-4 text-white">{modeLabel(g.mode)}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    g.status === 'PLAYING' ? 'bg-blue-900/50 text-blue-400' : 'bg-green-900/50 text-[#4ade80]'
                  }`}>
                    {g.status === 'PLAYING' ? 'Em andamento' : 'Finalizada'}
                  </span>
                </td>
                <td className="p-4 text-[#facc15] font-bold">R$ {g.bet}</td>
                <td className="p-4 text-white">{g.winner}</td>
                <td className="p-4 text-green-600 text-xs">{g.created}</td>
                <td className="p-4 text-white">{g.duration}</td>
                <td className="p-4">
                  <button className="text-[#4ade80] text-xs hover:underline">▶ Replay</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FinancialTab() {
  const mockTransactions = [
    { id: 't001', user: 'João Silva', type: 'DEPOSIT', amount: 100, status: 'COMPLETED', date: '2024-03-22 19:30', pix: 'abc123' },
    { id: 't002', user: 'Maria Santos', type: 'WITHDRAWAL', amount: 500, status: 'PENDING', date: '2024-03-22 20:00', pix: 'def456' },
    { id: 't003', user: 'Pedro Costa', type: 'DEPOSIT', amount: 50, status: 'FAILED', date: '2024-03-22 20:10', pix: 'ghi789' },
  ];

  const typeColor = (t: string) => ({ DEPOSIT: 'text-[#4ade80]', WITHDRAWAL: 'text-red-400', BET: 'text-yellow-400', WIN: 'text-[#facc15]' }[t] || 'text-gray-400');
  const statusBg = (s: string) => ({ COMPLETED: 'bg-green-900/50 text-[#4ade80]', PENDING: 'bg-yellow-900/50 text-yellow-400', FAILED: 'bg-red-900/50 text-red-400' }[s] || '');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-white">Financeiro</h1>
        <div className="flex gap-3 text-sm">
          <div className="bg-[#0f2e0f] rounded-lg px-4 py-2 border border-green-900/30">
            <span className="text-green-600">Depósitos pendentes: </span>
            <span className="text-white font-bold">R$ 2.450,00</span>
          </div>
          <div className="bg-[#0f2e0f] rounded-lg px-4 py-2 border border-green-900/30">
            <span className="text-green-600">Saques pendentes: </span>
            <span className="text-red-400 font-bold">R$ 800,00</span>
          </div>
        </div>
      </div>

      <div className="bg-[#0f2e0f] rounded-xl border border-green-900/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-green-900/30">
              {['ID PIX', 'Usuário', 'Tipo', 'Valor', 'Status', 'Data', 'Ação'].map(h => (
                <th key={h} className="text-left p-4 text-green-600 uppercase text-xs font-semibold tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mockTransactions.map((t) => (
              <tr key={t.id} className="border-b border-green-900/20 hover:bg-white/5">
                <td className="p-4 text-green-600 font-mono text-xs">{t.pix}</td>
                <td className="p-4 text-white">{t.user}</td>
                <td className={`p-4 font-bold ${typeColor(t.type)}`}>{t.type}</td>
                <td className={`p-4 font-bold ${t.type === 'WITHDRAWAL' ? 'text-red-400' : 'text-[#4ade80]'}`}>
                  {t.type === 'WITHDRAWAL' ? '-' : '+'}R$ {t.amount}
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusBg(t.status)}`}>
                    {t.status}
                  </span>
                </td>
                <td className="p-4 text-green-600 text-xs">{t.date}</td>
                <td className="p-4">
                  {t.status === 'PENDING' && t.type === 'WITHDRAWAL' && (
                    <button className="bg-[#4ade80] text-black text-xs font-bold px-3 py-1 rounded">Aprovar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
