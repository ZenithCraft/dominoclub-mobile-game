'use client';
import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import {
  LayoutDashboard, Users, Gamepad2, Wallet, Trophy, ShieldAlert,
  Settings2, LogOut, RefreshCw, ChevronLeft, ChevronRight,
  AlertTriangle, Circle, ArrowUpRight, ArrowDownRight,
  Activity, Ban, CheckCircle2, Clock, XCircle, PlayCircle,
  Loader2, PanelLeftClose, PanelLeftOpen, TrendingUp, Gift, Link2,
  Users2, DoorOpen, Lock, Unlock, Trash2,
} from 'lucide-react';
import { adminApi } from '../lib/api';
const logo = { src: '/logo.png' };
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Label } from '../components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { DateTimePicker } from '../components/ui/date-time-picker';
import { cn } from '../lib/utils';

type Tab = 'overview' | 'users' | 'games' | 'financial' | 'tournaments' | 'fraud' | 'pairBlocks' | 'teamPairs' | 'bonus' | 'rooms' | 'config';

const formatInt  = (v: number) => new Intl.NumberFormat('pt-BR').format(v);
const formatMoney = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const toLocalDT = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// ─── Auth ─────────────────────────────────────────────────────────────────────

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

// ─── Data hook ────────────────────────────────────────────────────────────────

function useData<T>(url: string, deps: any[] = []) {
  const [data, setData]     = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data: res } = await adminApi.get(url);
      setData(res);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar dados');
    } finally { setLoading(false); }
  }, [url, ...deps]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const SIDEBAR_KEY = 'admin_sidebar_collapsed';

export default function AdminDashboard() {
  useAdminAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  // Initialise synchronously from the class the blocking script set on <html>
  // so server (false) and client agree on first render, then CSS handles width.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Sync React state with what the blocking script already applied to <html>
    setCollapsed(document.documentElement.classList.contains('sidebar-collapsed'));
    // Enable transitions after the first correct paint
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => document.documentElement.classList.add('sidebar-transition'))
    );
    return () => cancelAnimationFrame(raf);
  }, []);

  const toggleSidebar = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      document.documentElement.classList.toggle('sidebar-collapsed', next);
      return next;
    });
  };

  const NAV: { id: Tab; label: string; Icon: React.ElementType }[] = [
    { id: 'overview',    label: 'Visão geral',  Icon: LayoutDashboard },
    { id: 'users',       label: 'Usuários',     Icon: Users },
    { id: 'games',       label: 'Partidas',     Icon: Gamepad2 },
    { id: 'financial',   label: 'Financeiro',   Icon: Wallet },
    { id: 'tournaments', label: 'Torneios',     Icon: Trophy },
    { id: 'fraud',       label: 'Fraudes',      Icon: ShieldAlert },
    { id: 'pairBlocks',  label: 'Bloqueios',    Icon: Link2 },
    { id: 'teamPairs',   label: 'Duplas 2v2',   Icon: Users2 },
    { id: 'bonus',       label: 'Bônus',        Icon: Gift },
    { id: 'rooms',       label: 'Salas',        Icon: DoorOpen },
    { id: 'config',      label: 'Config.',      Icon: Settings2 },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        id="admin-sidebar"
        className={cn(
          'fixed left-0 top-0 bottom-0 border-r border-border flex flex-col z-20 overflow-hidden',
          'bg-gradient-to-b from-card to-[hsl(240_5%_8%)]'
        )}
      >
        {/* Header */}
        <div className={cn(
          'h-14 flex items-center border-b border-border shrink-0',
          collapsed ? 'justify-center px-0' : 'gap-2.5 px-4'
        )}>
          <img src={logo.src} alt="DominoClub" className="h-8 w-auto shrink-0" />
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 px-1.5 space-y-0.5 overflow-y-auto scrollbar-thin">
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              title={collapsed ? item.label : undefined}
              className={cn(
                'w-full px-2.5 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2.5',
                collapsed ? 'justify-center' : '',
                tab === item.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <item.Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className={cn('p-2 border-t border-border space-y-1 shrink-0', collapsed && 'flex flex-col items-center')}>
          {!collapsed && (
            <div className="flex items-center gap-2 px-2 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
              <span className="text-xs text-muted-foreground truncate">Online</span>
            </div>
          )}
          <button
            onClick={() => handleLogout(router)}
            title="Sair"
            className={cn(
              'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-red-400 hover:bg-destructive/10 transition-colors',
              collapsed && 'justify-center'
            )}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
          <button
            onClick={toggleSidebar}
            title={collapsed ? 'Expandir' : 'Recolher'}
            className={cn(
              'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
              collapsed && 'justify-center'
            )}
          >
            {collapsed
              ? <PanelLeftOpen className="w-3.5 h-3.5" />
              : <><PanelLeftClose className="w-3.5 h-3.5" /><span>Recolher</span></>
            }
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <main id="admin-main" className="flex-1 min-h-screen">
        <div className="p-6 max-w-[1400px]">
          {tab === 'overview'     && <OverviewTab />}
          {tab === 'users'        && <UsersTab />}
          {tab === 'games'        && <GamesTab />}
          {tab === 'financial'    && <FinancialTab />}
          {tab === 'tournaments'  && <TournamentsTab />}
          {tab === 'fraud'        && <FraudTab />}
          {tab === 'pairBlocks'   && <PairBlocksTab />}
          {tab === 'teamPairs'    && <TeamPairsTab />}
          {tab === 'bonus'        && <BonusTab />}
          {tab === 'rooms'        && <GameRoomsTab />}
          {tab === 'config'       && <ConfigTab />}
        </div>
      </main>
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function PageHeader({
  title, subtitle, children,
}: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-base font-semibold text-foreground tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

function TableSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <div className="space-y-px py-2 px-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-4 px-3 py-2">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

function ErrorState({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center space-y-3">
      <div className="flex items-center justify-center gap-2 text-red-400">
        <AlertTriangle className="w-4 h-4" />
        <p className="text-sm">{msg}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onRetry}>Tentar novamente</Button>
    </div>
  );
}

function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 mt-4">
      <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="text-xs text-muted-foreground tabular-nums min-w-[4rem] text-center">
        {page} / {pages}
      </span>
      <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm table-striped">{children}</table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border whitespace-nowrap text-center">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 align-middle text-center', className)}>{children}</td>;
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-12 text-center text-muted-foreground text-sm">{msg}</td>
    </tr>
  );
}

function StatCard({
  label, value, icon: Icon, accent,
}: { label: string; value: string | number; icon: React.ElementType; accent?: 'green' | 'red' | 'blue' | 'gold' }) {
  const colors = {
    green: { icon: 'text-primary',    bg: 'bg-primary/8',          css: 'stat-card-green' },
    red:   { icon: 'text-red-400',    bg: 'bg-red-500/8',          css: 'stat-card-red' },
    blue:  { icon: 'text-blue-400',   bg: 'bg-blue-500/8',         css: 'stat-card-blue' },
    gold:  { icon: 'text-yellow-400', bg: 'bg-yellow-500/8',       css: 'stat-card-gold' },
  };
  const c = colors[accent ?? 'green'];
  return (
    <div className={cn('rounded-lg border border-border card-gradient p-4 flex items-start justify-between gap-3', c.css)}>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-xl font-semibold text-foreground tabular-nums mt-0.5 truncate">{value}</p>
      </div>
      <div className={cn('p-2 rounded-md shrink-0', c.bg)}>
        <Icon className={cn('w-4 h-4', c.icon)} />
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data, loading, error, reload } = useData<any>('/stats');
  const s = data ?? {};
  const week = (data?.revenueWeek ?? []).map((r: any) => ({
    day: r.day, revenue: Number(r.revenue), games: Number(r.games),
  }));

  return (
    <div>
      <PageHeader title="Visão geral">
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </PageHeader>

      {error ? <ErrorState msg={error} onRetry={reload} /> : loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3 mb-6">
            <StatCard label="Usuários ativos"  value={formatInt(Number(s.totalUsers ?? 0))}            icon={Users}         accent="green" />
            <StatCard label="Usuários banidos" value={formatInt(Number(s.bannedUsers ?? 0))}           icon={Ban}           accent="red" />
            <StatCard label="Online agora"     value={formatInt(Number(s.onlineNow ?? 0))}             icon={Activity}      accent="blue" />
            <StatCard label="Partidas ativas"  value={formatInt(Number(s.activeGames ?? 0))}           icon={Gamepad2}      accent="blue" />
            <StatCard label="Receita 24h"      value={formatMoney(Number(s.revenue24h ?? 0))}          icon={TrendingUp}    accent="gold" />
            <StatCard label="Depósitos (qtd)"  value={formatInt(Number(s.deposits24h ?? 0))}           icon={ArrowUpRight}  accent="green" />
            <StatCard label="Depósitos (R$)"   value={formatMoney(Number(s.depositsAmount24h ?? 0))}   icon={ArrowUpRight}  accent="green" />
            <StatCard label="Saques (qtd)"     value={formatInt(Number(s.withdrawals24h ?? 0))}        icon={ArrowDownRight} accent="red" />
            <StatCard label="Saques (R$)"      value={formatMoney(Number(s.withdrawalsAmount24h ?? 0))} icon={ArrowDownRight} accent="red" />
            <StatCard label="Transações 24h"   value={formatInt(Number(s.totalTransactions24h ?? 0))}  icon={Wallet}        accent="blue" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { title: 'Receita — últimos 7 dias', chart: (
                <BarChart data={week} barSize={18}>
                  <XAxis dataKey="day" tick={{ fill: 'hsl(240 4% 46%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(240 4% 46%)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(240 5% 9%)', border: '1px solid hsl(240 4% 14%)', borderRadius: 6, fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                  <Bar dataKey="revenue" fill="hsl(142 55% 55%)" fillOpacity={0.75} radius={[3,3,0,0]} />
                </BarChart>
              )},
              { title: 'Partidas — últimos 7 dias', chart: (
                <LineChart data={week}>
                  <XAxis dataKey="day" tick={{ fill: 'hsl(240 4% 46%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(240 4% 46%)', fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(240 5% 9%)', border: '1px solid hsl(240 4% 14%)', borderRadius: 6, fontSize: 12 }} cursor={{ stroke: 'rgba(255,255,255,0.04)' }} />
                  <Line type="monotone" dataKey="games" stroke="#facc15" strokeWidth={1.5} dot={false} />
                </LineChart>
              )},
            ].map(({ title, chart }) => (
              <Card key={title} className="card-gradient">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={175}>{chart}</ResponsiveContainer>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────────────────────

function UsersTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pairsUser, setPairsUser] = useState<any | null>(null);
  const [pairsLoading, setPairsLoading] = useState(false);
  const [pairsData, setPairsData] = useState<any | null>(null);

  const { data, loading, error, reload } = useData<any>(
    `/users?page=${page}&search=${encodeURIComponent(query)}`, [page, query]
  );

  const handleSearch = (e: FormEvent) => { e.preventDefault(); setPage(1); setQuery(search); };

  const toggleBan = async (user: any) => {
    setConfirmId(null);
    setActioning(user.id);
    try {
      await adminApi.patch(`/users/${user.id}/ban`, {
        banned: !user.is_banned,
        reason: !user.is_banned ? 'Banido pelo admin' : undefined,
      });
      reload();
    } catch (err: any) { alert(err.response?.data?.error || 'Erro'); }
    finally { setActioning(null); }
  };

  const loadPairs = async (user: any) => {
    setPairsUser(user);
    setPairsLoading(true);
    setPairsData(null);
    try {
      const { data } = await adminApi.get(`/users/${user.id}/pair-stats?days=30&minGames=10`);
      setPairsData(data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao carregar pares');
    } finally {
      setPairsLoading(false);
    }
  };

  const blockPair = async (otherUserId: string) => {
    if (!pairsUser) return;
    if (!confirm('Bloquear estes jogadores de caírem na mesma partida?')) return;
    try {
      await adminApi.post('/pair-blocks', { userAId: pairsUser.id, userBId: otherUserId, reason: 'Winrate alta por par' });
      alert('Bloqueio criado');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao bloquear');
    }
  };

  return (
    <div>
      <PageHeader title="Usuários">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input value={search} onChange={e => setSearch(e.target.value)} className="w-64" placeholder="Nome, telefone ou CPF..." />
          <Button type="submit">Buscar</Button>
        </form>
      </PageHeader>

      {error ? <ErrorState msg={error} onRetry={reload} /> : loading ? (
        <Card><CardContent className="p-0"><TableSkeleton cols={10} /></CardContent></Card>
      ) : (
        <>
          <TableWrapper>
            <thead>
              <tr>{['Nome', 'Telefone', 'CPF', 'Saldo', 'Bônus', 'Partidas', 'Fraude', 'Criado em', 'Status', 'Ação'].map(h => <Th key={h}>{h}</Th>)}</tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map((u: any) => (
                <tr key={u.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                  <Td><span className="font-medium text-foreground">{u.name || <span className="text-muted-foreground italic text-xs">sem nome</span>}</span></Td>
                  <Td><span className="font-mono text-xs text-muted-foreground">{u.phone}</span></Td>
                  <Td><Badge variant={u.cpf_verified ? 'default' : 'warning'}>{u.cpf_verified ? 'Verificado' : 'Pendente'}</Badge></Td>
                  <Td><span className="tabular-nums text-yellow-400 font-medium text-xs">{formatMoney(Number(u.wallet?.real_balance ?? 0))}</span></Td>
                  <Td><span className="tabular-nums text-xs text-muted-foreground">{formatMoney(Number(u.wallet?.bonus_balance ?? 0))}</span></Td>
                  <Td><span className="text-foreground">{u._count?.gamePlayers ?? 0}</span></Td>
                  <Td>
                    {u._count?.fraudLogs > 0 && (
                      <Badge variant="destructive">
                        <AlertTriangle className="w-3 h-3" />{u._count.fraudLogs}
                      </Badge>
                    )}
                  </Td>
                  <Td><span className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleString('pt-BR')}</span></Td>
                  <Td><Badge variant={u.is_banned ? 'destructive' : 'default'}>{u.is_banned ? 'Banido' : 'Ativo'}</Badge></Td>
                  <Td>
                    {confirmId === u.id ? (
                      <div className="flex items-center gap-1.5 justify-center">
                        <span className="text-xs text-muted-foreground mr-1">Confirmar?</span>
                        <Button size="sm" variant={u.is_banned ? 'default' : 'destructive'} disabled={actioning === u.id} onClick={() => toggleBan(u)}>
                          {actioning === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Sim'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Não</Button>
                      </div>
                    ) : (
                      <div className="flex gap-1.5 justify-center">
                        <Button
                          size="sm"
                          variant={u.is_banned ? 'ghost' : 'destructive'}
                          disabled={actioning === u.id}
                          onClick={() => setConfirmId(u.id)}
                        >
                          {u.is_banned ? 'Desbanir' : 'Banir'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => loadPairs(u)}>Pares</Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
              {(data?.users ?? []).length === 0 && <EmptyRow cols={10} msg="Nenhum usuário encontrado" />}
            </tbody>
          </TableWrapper>
          <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
          {pairsUser && (
            <Card className="mt-6 card-gradient">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pares — {pairsUser.name || pairsUser.phone}
                  </CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => { setPairsUser(null); setPairsData(null); }}>
                    Fechar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {pairsLoading ? (
                  <TableSkeleton cols={6} />
                ) : (
                  <TableWrapper>
                    <thead>
                      <tr>{['Jogador', 'Telefone', 'Partidas', 'Vitórias', 'Winrate', ''].map(h => <Th key={h}>{h}</Th>)}</tr>
                    </thead>
                    <tbody>
                      {(pairsData?.pairs ?? []).map((p: any) => (
                        <tr key={p.otherUserId} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                          <Td><span className="text-xs text-foreground font-medium">{p.otherName || p.otherUserId.slice(0, 8)}</span></Td>
                          <Td><span className="font-mono text-xs text-muted-foreground">{p.otherPhone || '—'}</span></Td>
                          <Td><span className="tabular-nums text-xs">{p.games}</span></Td>
                          <Td><span className="tabular-nums text-xs">{p.wins}</span></Td>
                          <Td>
                            <Badge variant={p.alert ? 'destructive' : 'muted'}>
                              {(Number(p.winRate) * 100).toFixed(0)}%
                            </Badge>
                          </Td>
                          <Td>
                            <Button size="sm" variant="outline" onClick={() => blockPair(p.otherUserId)}>Bloquear</Button>
                          </Td>
                        </tr>
                      ))}
                      {(pairsData?.pairs ?? []).length === 0 && <EmptyRow cols={6} msg="Sem pares com volume suficiente" />}
                    </tbody>
                  </TableWrapper>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Games ────────────────────────────────────────────────────────────────────

const MODE_LABEL: Record<string, string> = {
  ARENA_1V1: 'Arena 1v1', CUP_1V1: 'Copa 1v1',
  TOURNAMENT_2V2: 'Torneio 2x2', RECREATIONAL_2V2: 'Recreativo 2x2',
};

function gameStatusBadge(s: string) {
  const m: Record<string, { variant: any; label: string; Icon: React.ElementType }> = {
    PLAYING:   { variant: 'blue',        label: 'Em andamento', Icon: PlayCircle },
    FINISHED:  { variant: 'default',     label: 'Finalizada',   Icon: CheckCircle2 },
    WAITING:   { variant: 'warning',     label: 'Aguardando',   Icon: Clock },
    CANCELLED: { variant: 'muted',       label: 'Cancelada',    Icon: XCircle },
    ABANDONED: { variant: 'destructive', label: 'Abandonada',   Icon: XCircle },
  };
  const x = m[s] ?? { variant: 'muted', label: s, Icon: Circle };
  return <Badge variant={x.variant}><x.Icon className="w-3 h-3" />{x.label}</Badge>;
}

const WIN_TYPE_PT: Record<string, string> = {
  domino: 'Dominó', lelo: 'Lelo', blocked: 'Bloqueado', carroca: 'Carroça', la_e_lo: 'Lá-e-Ló', cruzada: 'Cruzada',
};

function GameLogsPanel({ gameId, players }: { gameId: string; players: { userId: string; name: string; isBot: boolean }[] }) {
  const [logs, setLogs] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    adminApi.get(`/games/${gameId}/logs`)
      .then(({ data }) => setLogs(data.logs ?? []))
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar logs'))
      .finally(() => setLoading(false));
  }, [gameId]);

  const nameOf = (userId: string) => {
    const p = players.find((p) => p.userId === userId);
    return p ? (p.name || userId.slice(0, 8)) : userId.slice(0, 8);
  };

  if (loading) return (
    <div className="flex items-center gap-2 py-4 px-2 text-muted-foreground text-xs">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando logs…
    </div>
  );
  if (error) return <p className="py-3 px-2 text-xs text-red-400">{error}</p>;
  if (!logs || logs.length === 0) return (
    <p className="py-3 px-2 text-xs text-muted-foreground">Nenhum log registrado para esta partida.</p>
  );

  const start = logs.find((l) => l.event === 'match_start');
  const rounds = logs.filter((l) => l.event === 'round_end');
  const end = logs.find((l) => l.event === 'match_end');

  return (
    <div className="px-4 pb-4 pt-2 space-y-4">
      {/* ── Match start ── */}
      {start && (
        <div className="rounded-md border border-border/50 bg-accent/10 p-3 text-xs space-y-1">
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            <PlayCircle className="w-3.5 h-3.5 text-blue-400" /> Início da partida
            <span className="ml-auto text-muted-foreground font-normal">{new Date(start.timestamp).toLocaleString('pt-BR')}</span>
          </p>
          <p className="text-muted-foreground">
            Variante: <span className="text-foreground">{start.variant}</span>
            {' · '}Aposta: <span className="text-yellow-400">{formatMoney(Number(start.betAmount ?? 0))}</span>
          </p>
          <p className="text-muted-foreground">
            Jogadores:{' '}
            {(start.players ?? []).map((p: any) => (
              <span key={p.userId} className="inline-flex items-center gap-1 mr-2">
                <span className="text-foreground">{nameOf(p.userId)}</span>
                <span className="text-muted-foreground/60">(time {p.team}{p.isBot ? ', bot' : ''})</span>
              </span>
            ))}
          </p>
        </div>
      )}

      {/* ── Rounds ── */}
      {rounds.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rodadas</p>
          {rounds.map((r, i) => {
            const scores = r.matchScores ?? {};
            const scoreStr = Object.entries(scores).map(([t, s]) => `T${t}: ${s}`).join(' · ');
            return (
              <div key={i} className="flex items-center gap-3 rounded-md border border-border/40 bg-card px-3 py-2 text-xs">
                <span className="font-semibold text-muted-foreground w-14 shrink-0">Rodada {r.round}</span>
                <span className={cn('font-medium', r.winnerTeam ? 'text-green-400' : 'text-muted-foreground')}>
                  {r.winnerTeam ? `Time ${r.winnerTeam} venceu` : 'Empate'}
                </span>
                <span className="text-muted-foreground">
                  {WIN_TYPE_PT[r.winType] || r.winType}
                  {r.points != null ? ` · ${r.points}pts` : ''}
                </span>
                {r.winnerId && (
                  <span className="text-muted-foreground/70">{nameOf(r.winnerId)}</span>
                )}
                <span className="ml-auto tabular-nums text-muted-foreground/60">{scoreStr}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Match end ── */}
      {end && (
        <div className={cn(
          'rounded-md border p-3 text-xs space-y-1',
          end.status === 'FINISHED' ? 'border-green-500/30 bg-green-500/5' :
          end.status === 'ABANDONED' ? 'border-red-500/30 bg-red-500/5' :
          'border-border/50 bg-accent/10',
        )}>
          <p className="font-semibold text-foreground flex items-center gap-1.5">
            {end.status === 'FINISHED'
              ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
              : <XCircle className="w-3.5 h-3.5 text-red-400" />}
            Resultado final
            <span className="ml-auto text-muted-foreground font-normal">{new Date(end.timestamp).toLocaleString('pt-BR')}</span>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
            {end.matchWinnerTeam != null && (
              <span>Vencedor: <span className="text-green-400 font-medium">Time {end.matchWinnerTeam}</span></span>
            )}
            {end.winnerId && (
              <span>MVP: <span className="text-foreground">{nameOf(end.winnerId)}</span></span>
            )}
            <span>Rodadas: <span className="text-foreground">{end.rounds}</span></span>
            <span>Lances: <span className="text-foreground">{end.totalMoves}</span></span>
            {Number(end.prizePerWinner ?? 0) > 0 && (
              <span>Prêmio/vencedor: <span className="text-yellow-400">{formatMoney(Number(end.prizePerWinner))}</span></span>
            )}
          </div>
          {end.players && (
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground pt-0.5">
              {end.players.map((p: any) => (
                <span key={p.userId}>
                  {nameOf(p.userId)}: <span className="text-foreground tabular-nums">{p.pips} pips restantes</span>
                  {p.isBot ? ' (bot)' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GamesTab() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const url = `/games?page=${page}${statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''}`;
  const { data, loading, error, reload } = useData<any>(url, [page, statusFilter]);

  const toggleExpand = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div>
      <PageHeader title="Partidas">
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os status</SelectItem>
            <SelectItem value="PLAYING">Em andamento</SelectItem>
            <SelectItem value="FINISHED">Finalizadas</SelectItem>
            <SelectItem value="WAITING">Aguardando</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={reload} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </PageHeader>

      {error ? <ErrorState msg={error} onRetry={reload} /> : loading ? (
        <Card><CardContent className="p-0"><TableSkeleton cols={11} /></CardContent></Card>
      ) : (
        <>
          <TableWrapper>
            <thead>
              <tr>{['', 'ID', 'Modo', 'Status', 'Aposta', 'Prêmio', 'Taxa', 'Jogadores', 'Vencedor', 'Criada em', 'Duração'].map(h => <Th key={h}>{h}</Th>)}</tr>
            </thead>
            <tbody>
              {(data?.games ?? []).map((g: any) => {
                const isExpanded = expandedId === g.id;
                const playerList = (g.players ?? []).map((p: any) => ({
                  userId: p.user.id,
                  name: p.user.name || '',
                  isBot: p.is_bot,
                }));
                return (
                  <React.Fragment key={g.id}>
                    <tr
                      className={cn('border-b border-border/40 hover:bg-accent/20 transition-colors cursor-pointer', isExpanded && 'bg-accent/10')}
                      onClick={() => toggleExpand(g.id)}
                    >
                      <Td>
                        <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', isExpanded && 'rotate-90')} />
                      </Td>
                      <Td><span className="font-mono text-xs text-muted-foreground">{g.id.slice(0, 8)}</span></Td>
                      <Td><span className="text-foreground text-xs">{MODE_LABEL[g.mode] || g.mode}</span></Td>
                      <Td>{gameStatusBadge(g.status)}</Td>
                      <Td><span className="tabular-nums text-yellow-400 font-medium text-xs">{formatMoney(Number(g.bet_amount ?? 0))}</span></Td>
                      <Td><span className="tabular-nums text-xs">{formatMoney(Number(g.prize_pool ?? 0))}</span></Td>
                      <Td><span className="tabular-nums text-xs text-muted-foreground">{formatMoney(Number(g.house_fee ?? 0))}</span></Td>
                      <Td><span className="text-xs text-muted-foreground">{g.players.map((p: any) => p.user.name || '?').join(', ')}</span></Td>
                      <Td><span className="text-xs">{g.winner?.name || '—'}</span></Td>
                      <Td><span className="text-xs text-muted-foreground">{new Date(g.created_at).toLocaleString('pt-BR')}</span></Td>
                      <Td><span className="text-xs text-muted-foreground">{g.duration || '—'}</span></Td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-border/40 bg-accent/5">
                        <td colSpan={11} className="p-0">
                          <GameLogsPanel gameId={g.id} players={playerList} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {(data?.games ?? []).length === 0 && <EmptyRow cols={11} msg="Nenhuma partida encontrada" />}
            </tbody>
          </TableWrapper>
          <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
        </>
      )}
    </div>
  );
}

// ─── Financial ────────────────────────────────────────────────────────────────

const TX_TYPE_PT: Record<string, string> = {
  DEPOSIT: 'Depósito', WITHDRAWAL: 'Saque', BET: 'Aposta',
  WIN: 'Prêmio', BONUS: 'Bônus', REFUND: 'Reembolso', FEE: 'Taxa',
};

function txStatusBadge(s: string) {
  const m: Record<string, { variant: any; label: string }> = {
    COMPLETED:  { variant: 'default',     label: 'Concluído' },
    PENDING:    { variant: 'warning',     label: 'Pendente' },
    FAILED:     { variant: 'destructive', label: 'Falhou' },
    PROCESSING: { variant: 'blue',        label: 'Processando' },
  };
  const x = m[s] ?? { variant: 'muted', label: s };
  return <Badge variant={x.variant}>{x.label}</Badge>;
}

function FinancialTab() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter]     = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [actioning, setActioning] = useState<string | null>(null);

  const { data, loading, error, reload } = useData<any>(
    `/transactions?page=${page}${typeFilter !== 'ALL' ? `&type=${typeFilter}` : ''}${statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''}`,
    [page, typeFilter, statusFilter]
  );

  const approve = async (id: string) => {
    setActioning(id);
    try { await adminApi.patch(`/transactions/${id}/approve`); reload(); }
    catch (err: any) { alert(err.response?.data?.error || 'Erro ao aprovar'); }
    finally { setActioning(null); }
  };

  const reject = async (id: string) => {
    if (!confirm('Rejeitar este saque e devolver o saldo ao usuário?')) return;
    setActioning(id);
    try { await adminApi.patch(`/transactions/${id}/reject`); reload(); }
    catch (err: any) { alert(err.response?.data?.error || 'Erro ao rejeitar'); }
    finally { setActioning(null); }
  };

  return (
    <div>
      <PageHeader title="Financeiro">
        {data && (
          <div className="h-9 flex items-center text-xs text-muted-foreground border border-border rounded-md px-3">
            Saques pendentes:&nbsp;
            <span className="text-red-400 font-medium">{formatMoney(Number(data.pendingWithdrawalsTotal ?? 0))}</span>
            <span className="text-muted-foreground/50 ml-1">({formatInt(Number(data.pendingWithdrawalsCount ?? 0))})</span>
          </div>
        )}
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os tipos</SelectItem>
            <SelectItem value="DEPOSIT">Depósitos</SelectItem>
            <SelectItem value="WITHDRAWAL">Saques</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os status</SelectItem>
            <SelectItem value="PENDING">Pendentes</SelectItem>
            <SelectItem value="COMPLETED">Concluídos</SelectItem>
            <SelectItem value="FAILED">Falhos</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={reload} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </PageHeader>

      {error ? <ErrorState msg={error} onRetry={reload} /> : loading ? (
        <Card><CardContent className="p-0"><TableSkeleton cols={7} /></CardContent></Card>
      ) : (
        <>
          <TableWrapper>
            <thead>
              <tr>{['Usuário', 'Tipo', 'Valor', 'Chave PIX', 'Status', 'Data', ''].map(h => <Th key={h}>{h}</Th>)}</tr>
            </thead>
            <tbody>
              {(data?.transactions ?? []).map((t: any) => {
                const user = t.wallet?.user;
                return (
                  <tr key={t.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                    <Td>
                      <p className="font-medium text-foreground text-xs">{user?.name || '?'}</p>
                      <p className="font-mono text-xs text-muted-foreground">{user?.phone}</p>
                    </Td>
                    <Td><span className="text-muted-foreground text-xs">{TX_TYPE_PT[t.type] || t.type}</span></Td>
                    <Td>
                      <span className={cn('tabular-nums font-medium text-sm', t.type === 'WITHDRAWAL' ? 'text-red-400' : 'text-primary')}>
                        {t.type === 'WITHDRAWAL' ? '−' : '+'}{formatMoney(Math.abs(Number(t.amount ?? 0)))}
                      </span>
                    </Td>
                    <Td><span className="font-mono text-xs text-muted-foreground">{t.pix_key ? t.pix_key.slice(0, 20) + (t.pix_key.length > 20 ? '…' : '') : t.pix_id?.slice(0, 12) || '—'}</span></Td>
                    <Td>{txStatusBadge(t.status)}</Td>
                    <Td><span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString('pt-BR')}</span></Td>
                    <Td>
                      {t.status === 'PENDING' && t.type === 'WITHDRAWAL' && (
                        <div className="flex gap-1.5 justify-center">
                          <Button size="sm" disabled={actioning === t.id} onClick={() => approve(t.id)}>
                            {actioning === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Aprovar'}
                          </Button>
                          <Button size="sm" variant="destructive" disabled={actioning === t.id} onClick={() => reject(t.id)}>Rejeitar</Button>
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {(data?.transactions ?? []).length === 0 && <EmptyRow cols={7} msg="Nenhuma transação encontrada" />}
            </tbody>
          </TableWrapper>
          <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
        </>
      )}
    </div>
  );
}

// ─── Tournaments ──────────────────────────────────────────────────────────────

const VARIANT_PT: Record<string, string> = { CARROCA: 'Carroça', L_E_L: 'L e L', CRUZADA: 'Cruzada' };

function tournamentStatusBadge(s: string) {
  const m: Record<string, { variant: any; label: string }> = {
    OPEN:        { variant: 'default',     label: 'Aberto' },
    FULL:        { variant: 'warning',     label: 'Lotado' },
    IN_PROGRESS: { variant: 'blue',        label: 'Em andamento' },
    FINISHED:    { variant: 'muted',       label: 'Finalizado' },
    CANCELLED:   { variant: 'destructive', label: 'Cancelado' },
  };
  const x = m[s] ?? { variant: 'muted', label: s };
  return <Badge variant={x.variant}>{x.label}</Badge>;
}

function TournamentsTab() {
  const [page, setPage]             = useState(1);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [creating, setCreating]     = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState<any | null>(null);

  const [form, setForm] = useState(() => ({
    name: '', mode: 'ARENA_1V1', variant: 'CARROCA',
    entryFee: '2', maxPlayers: '16',
    startsAt: toLocalDT(new Date(Date.now() + 60 * 60 * 1000)),
  }));

  const { data, loading, error, reload } = useData<any>(
    `/tournaments?page=${page}${statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''}`,
    [page, statusFilter]
  );

  const create = async (e: FormEvent) => {
    e.preventDefault(); setCreating(true);
    try {
      await adminApi.post('/tournaments', {
        name: form.name, mode: form.mode, variant: form.variant,
        entryFee: Number(form.entryFee), maxPlayers: Number(form.maxPlayers),
        startsAt: new Date(form.startsAt).toISOString(),
      });
      setForm(p => ({ ...p, name: '' }));
      reload();
    } catch (err: any) { alert(err.response?.data?.error || 'Erro ao criar torneio'); }
    finally { setCreating(false); }
  };

  const createDemo = async () => {
    setCreatingDemo(true);
    try {
      await adminApi.post('/tournaments/demo?startsIn=20&entryFee=5&maxPlayers=16&mode=CUP_1V1&variant=CARROCA');
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao criar demo');
    } finally {
      setCreatingDemo(false);
    }
  };

  const start = async (id: string) => {
    if (!confirm('Iniciar este torneio agora?')) return;
    try { await adminApi.post(`/tournaments/${id}/start`); reload(); }
    catch (err: any) { alert(err.response?.data?.error || 'Erro ao iniciar'); }
  };

  const cancel = async (id: string) => {
    if (!confirm('Cancelar este torneio e reembolsar as inscrições?')) return;
    try { await adminApi.post(`/tournaments/${id}/cancel`); reload(); }
    catch (err: any) { alert(err.response?.data?.error || 'Erro ao cancelar'); }
  };

  const emergencyCancel = async (id: string) => {
    if (!confirm('Cancelar EMERGÊNCIA: cancelar torneio em andamento e reembolsar jogadores ativos?')) return;
    try { await adminApi.post(`/tournaments/${id}/emergency-cancel`, { reason: 'Admin' }); reload(); }
    catch (err: any) { alert(err.response?.data?.error || 'Erro ao cancelar'); }
  };

  const toggleDetails = async (t: any) => {
    if (expandedId === t.id) {
      setExpandedId(null);
      setDetails(null);
      return;
    }
    setExpandedId(t.id);
    setDetailsLoading(true);
    setDetails(null);
    try {
      const [playersRes, bracketRes] = await Promise.all([
        adminApi.get(`/tournaments/${t.id}/players`),
        adminApi.get(`/tournaments/${t.id}/bracket`),
      ]);
      setDetails({ players: playersRes.data, bracket: bracketRes.data });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao carregar detalhes');
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Torneios">
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os status</SelectItem>
            <SelectItem value="OPEN">Abertos</SelectItem>
            <SelectItem value="FULL">Lotados</SelectItem>
            <SelectItem value="IN_PROGRESS">Em andamento</SelectItem>
            <SelectItem value="FINISHED">Finalizados</SelectItem>
            <SelectItem value="CANCELLED">Cancelados</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={createDemo} disabled={creatingDemo} className="gap-2">
          {creatingDemo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
          Demo 20s
        </Button>
        <Button variant="outline" size="icon" onClick={reload} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </PageHeader>

      {/* Create form */}
      <Card className="mb-6 card-gradient">
        <CardHeader className="pb-0">
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Criar torneio</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={create} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-4 items-end">
            {/* Name */}
            <div className="md:col-span-2 space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Torneio da semana" required />
            </div>
            {/* Mode */}
            <div className="space-y-1.5">
              <Label>Modo</Label>
              <Select value={form.mode} onValueChange={v => setForm(p => ({ ...p, mode: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARENA_1V1">Arena 1v1</SelectItem>
                  <SelectItem value="CUP_1V1">Copa 1v1</SelectItem>
                  <SelectItem value="TOURNAMENT_2V2">Torneio 2x2</SelectItem>
                  <SelectItem value="RECREATIONAL_2V2">Recreativo 2x2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Variant */}
            <div className="space-y-1.5">
              <Label>Variante</Label>
              <Select value={form.variant} onValueChange={v => setForm(p => ({ ...p, variant: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CARROCA">Carroça</SelectItem>
                  <SelectItem value="L_E_L">L e L</SelectItem>
                  <SelectItem value="CRUZADA">Cruzada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Entry fee */}
            <div className="space-y-1.5">
              <Label>Entrada (R$)</Label>
              <Input value={form.entryFee} onChange={e => setForm(p => ({ ...p, entryFee: e.target.value }))} inputMode="decimal" required />
            </div>
            {/* Max players */}
            <div className="space-y-1.5">
              <Label>Máx. jogadores</Label>
              <Input value={form.maxPlayers} onChange={e => setForm(p => ({ ...p, maxPlayers: e.target.value }))} inputMode="numeric" required />
            </div>
            {/* DateTime picker */}
            <div className="md:col-span-2 space-y-1.5">
              <Label>Data e hora de início</Label>
              <DateTimePicker value={form.startsAt} onChange={v => setForm(p => ({ ...p, startsAt: v }))} />
            </div>
            {/* Submit */}
            <div className="flex items-end">
              <Button type="submit" disabled={creating} className="w-full">
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Criar torneio'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error ? <ErrorState msg={error} onRetry={reload} /> : loading ? (
        <Card><CardContent className="p-0"><TableSkeleton cols={9} /></CardContent></Card>
      ) : (
        <>
          <TableWrapper>
            <thead>
              <tr>{['Nome', 'Modo', 'Variante', 'Status', 'Jogadores', 'Entrada', 'Prêmio', 'Início', ''].map(h => <Th key={h}>{h}</Th>)}</tr>
            </thead>
            <tbody>
              {(data?.tournaments ?? []).map((t: any) => (
                <tr key={t.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                  <Td>
                    <p className="font-medium text-foreground text-xs">{t.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{t.id.slice(0, 8)}</p>
                  </Td>
                  <Td><span className="text-xs text-muted-foreground">{MODE_LABEL[t.mode] || t.mode}</span></Td>
                  <Td><span className="text-xs text-muted-foreground">{VARIANT_PT[t.variant] || t.variant}</span></Td>
                  <Td>{tournamentStatusBadge(t.status)}</Td>
                  <Td><span className="tabular-nums text-xs">{t.current_players ?? t._count?.players ?? 0}/{t.max_players ?? '—'}</span></Td>
                  <Td><span className="tabular-nums text-xs">{formatMoney(Number(t.entry_fee ?? 0))}</span></Td>
                  <Td><span className="tabular-nums text-yellow-400 font-medium text-xs">{formatMoney(Number(t.prize_pool ?? 0))}</span></Td>
                  <Td><span className="text-xs text-muted-foreground">{new Date(t.starts_at).toLocaleString('pt-BR')}</span></Td>
                  <Td>
                    <div className="flex gap-1.5 justify-center">
                      <Button size="sm" variant="outline" onClick={() => toggleDetails(t)}>Detalhes</Button>
                      {(t.status === 'OPEN' || t.status === 'FULL') && (
                        <Button size="sm" variant="outline" onClick={() => start(t.id)}>
                          <PlayCircle className="w-3 h-3" />Iniciar
                        </Button>
                      )}
                      {(t.status === 'OPEN' || t.status === 'FULL') && (
                        <Button size="sm" variant="destructive" onClick={() => cancel(t.id)}>Cancelar</Button>
                      )}
                      {t.status === 'IN_PROGRESS' && (
                        <Button size="sm" variant="destructive" onClick={() => emergencyCancel(t.id)}>Emergência</Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
              {(data?.tournaments ?? []).length === 0 && <EmptyRow cols={9} msg="Nenhum torneio encontrado" />}
            </tbody>
          </TableWrapper>
          <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
          {expandedId && (
            <Card className="mt-6 card-gradient">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Detalhes do torneio
                  </CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => { setExpandedId(null); setDetails(null); }}>Fechar</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {detailsLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <Card className="card-gradient">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inscritos</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                          <TableWrapper>
                            <thead>
                              <tr>{['Jogador', 'Telefone', 'Status', 'Entrada'].map(h => <Th key={h}>{h}</Th>)}</tr>
                            </thead>
                            <tbody>
                              {(details?.players?.players ?? []).map((p: any) => (
                                <tr key={p.userId} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                                  <Td><span className="text-xs text-foreground font-medium">{p.user?.name || p.userId.slice(0, 8)}</span></Td>
                                  <Td><span className="font-mono text-xs text-muted-foreground">{p.user?.phone || '—'}</span></Td>
                                  <Td>
                                    <Badge variant={p.eliminated_at ? 'muted' : 'default'}>
                                      {p.eliminated_at ? 'Eliminado' : 'Ativo'}
                                    </Badge>
                                  </Td>
                                  <Td><span className="tabular-nums text-xs text-muted-foreground">{formatMoney(Number(details?.players?.entry_fee ?? 0))}</span></Td>
                                </tr>
                              ))}
                              {(details?.players?.players ?? []).length === 0 && <EmptyRow cols={4} msg="Sem inscritos" />}
                            </tbody>
                          </TableWrapper>
                        </CardContent>
                      </Card>
                      <Card className="card-gradient">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bracket / Jogos</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                          <TableWrapper>
                            <thead>
                              <tr>{['Round', 'Jogo', 'Status', 'Jogadores'].map(h => <Th key={h}>{h}</Th>)}</tr>
                            </thead>
                            <tbody>
                              {(details?.bracket?.games ?? []).map((g: any) => (
                                <tr key={g.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                                  <Td><span className="tabular-nums text-xs">{g.tournament_round ?? '—'}</span></Td>
                                  <Td><span className="font-mono text-xs text-muted-foreground">{g.id.slice(0, 8)}</span></Td>
                                  <Td>{gameStatusBadge(g.status)}</Td>
                                  <Td>
                                    <span className="text-xs text-muted-foreground">
                                      {(g.players ?? []).map((gp: any) => gp.user?.name || gp.userId.slice(0, 6)).join(' · ')}
                                    </span>
                                  </Td>
                                </tr>
                              ))}
                              {(details?.bracket?.games ?? []).length === 0 && <EmptyRow cols={4} msg="Sem jogos" />}
                            </tbody>
                          </TableWrapper>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Fraud ────────────────────────────────────────────────────────────────────

const FRAUD_TYPE_PT: Record<string, string> = {
  MULTI_ACCOUNT_DEVICE:       'Multi-conta (disp.)',
  MULTI_ACCOUNT_IP:           'Multi-conta (IP)',
  SUSPICIOUS_GPS:             'GPS suspeito',
  GEOLOCATION_OUTSIDE_BRAZIL: 'Fora do Brasil',
  RAPID_FIRE_BETS:            'Apostas rápidas',
  BOT_PATTERN:                'Padrão de bot',
  COLLUSION_SUSPECTED:        'Conluio suspeito',
  UNUSUAL_WIN_RATE:           'Taxa de vitória anormal',
};

function fraudTypeBadge(type: string) {
  const v: Record<string, any> = {
    BOT_PATTERN: 'orange', MULTI_ACCOUNT_DEVICE: 'destructive',
    MULTI_ACCOUNT_IP: 'destructive', COLLUSION_SUSPECTED: 'purple',
    GEOLOCATION_OUTSIDE_BRAZIL: 'warning',
  };
  return <Badge variant={v[type] ?? 'muted'}>{FRAUD_TYPE_PT[type] || type}</Badge>;
}

function FraudTab() {
  const [page, setPage]                   = useState(1);
  const [typeFilter, setTypeFilter]       = useState('ALL');
  const [resolvedFilter, setResolvedFilter] = useState('false');
  const [actioning, setActioning]         = useState<string | null>(null);

  const { data, loading, error, reload } = useData<any>(
    `/fraud-logs?page=${page}${typeFilter !== 'ALL' ? `&type=${typeFilter}` : ''}&resolved=${resolvedFilter}`,
    [page, typeFilter, resolvedFilter]
  );

  const resolve = async (id: string) => {
    setActioning(id);
    try { await adminApi.patch(`/fraud-logs/${id}/resolve`); reload(); }
    catch (err: any) { alert(err.response?.data?.error || 'Erro ao resolver'); }
    finally { setActioning(null); }
  };

  return (
    <div>
      <PageHeader title="Registros de fraude">
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os tipos</SelectItem>
            {Object.entries(FRAUD_TYPE_PT).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={resolvedFilter} onValueChange={v => { setResolvedFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="false">Pendentes</SelectItem>
            <SelectItem value="true">Resolvidos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={reload} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </PageHeader>

      {error ? <ErrorState msg={error} onRetry={reload} /> : loading ? (
        <Card><CardContent className="p-0"><TableSkeleton cols={8} /></CardContent></Card>
      ) : (
        <>
          <TableWrapper>
            <thead>
              <tr>{['Tipo', 'Usuário', 'Detalhes', 'IP', 'Device', 'Criado em', 'Status', ''].map(h => <Th key={h}>{h}</Th>)}</tr>
            </thead>
            <tbody>
              {(data?.logs ?? []).map((log: any) => (
                <tr key={log.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                  <Td>{fraudTypeBadge(log.type)}</Td>
                  <Td>
                    <p className="font-medium text-foreground text-xs">{log.user?.name || '?'}</p>
                    <p className="font-mono text-xs text-muted-foreground">{log.user?.phone}</p>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-muted-foreground" title={JSON.stringify(log.details)}>
                      {JSON.stringify(log.details).slice(0, 50)}{JSON.stringify(log.details).length > 50 ? '…' : ''}
                    </span>
                  </Td>
                  <Td><span className="font-mono text-xs text-muted-foreground">{log.ip_address || '—'}</span></Td>
                  <Td><span className="font-mono text-xs text-muted-foreground">{log.device_id?.slice(0, 10) || '—'}</span></Td>
                  <Td><span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString('pt-BR')}</span></Td>
                  <Td>
                    <Badge variant={log.resolved ? 'default' : 'warning'}>
                      {log.resolved ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {log.resolved ? 'Resolvido' : 'Pendente'}
                    </Badge>
                  </Td>
                  <Td>
                    {!log.resolved && (
                      <Button size="sm" variant="outline" disabled={actioning === log.id} onClick={() => resolve(log.id)}>
                        {actioning === log.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Resolver'}
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
              {(data?.logs ?? []).length === 0 && <EmptyRow cols={8} msg="Nenhum registro encontrado" />}
            </tbody>
          </TableWrapper>
          <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function PairBlocksTab() {
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'true' | 'false'>('true');
  const [creating, setCreating] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({ userAId: '', userBId: '', reason: '' }));

  const { data, loading, error, reload } = useData<any>(
    `/pair-blocks?page=${page}${activeFilter !== 'ALL' ? `&active=${activeFilter}` : ''}`,
    [page, activeFilter]
  );

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await adminApi.post('/pair-blocks', {
        userAId: form.userAId.trim(),
        userBId: form.userBId.trim(),
        reason: form.reason.trim() || undefined,
      });
      setForm({ userAId: '', userBId: '', reason: '' });
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao criar bloqueio');
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (id: string, active: boolean) => {
    setActioning(id);
    try {
      await adminApi.patch(`/pair-blocks/${id}`, { active: !active });
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro');
    } finally {
      setActioning(null);
    }
  };

  return (
    <div>
      <PageHeader title="Bloqueio de pares">
        <Select value={activeFilter} onValueChange={(v: any) => { setActiveFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Ativos</SelectItem>
            <SelectItem value="false">Inativos</SelectItem>
            <SelectItem value="ALL">Todos</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={reload} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </PageHeader>

      <Card className="mb-6 card-gradient">
        <CardHeader className="pb-0">
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Criar bloqueio</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-1.5">
              <Label>User A ID</Label>
              <Input value={form.userAId} onChange={e => setForm(p => ({ ...p, userAId: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>User B ID</Label>
              <Input value={form.userBId} onChange={e => setForm(p => ({ ...p, userBId: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Input value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="Opcional" />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={creating}>
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Bloquear'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error ? <ErrorState msg={error} onRetry={reload} /> : loading ? (
        <Card><CardContent className="p-0"><TableSkeleton cols={7} /></CardContent></Card>
      ) : (
        <>
          <TableWrapper>
            <thead>
              <tr>{['User A', 'User B', 'Motivo', 'Status', 'Criado em', ''].map(h => <Th key={h}>{h}</Th>)}</tr>
            </thead>
            <tbody>
              {(data?.blocks ?? []).map((b: any) => (
                <tr key={b.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                  <Td>
                    <p className="font-medium text-foreground text-xs">{b.userA?.name || '?'}</p>
                    <p className="font-mono text-xs text-muted-foreground">{b.userA?.phone || b.userAId.slice(0, 8)}</p>
                  </Td>
                  <Td>
                    <p className="font-medium text-foreground text-xs">{b.userB?.name || '?'}</p>
                    <p className="font-mono text-xs text-muted-foreground">{b.userB?.phone || b.userBId.slice(0, 8)}</p>
                  </Td>
                  <Td><span className="text-xs text-muted-foreground">{b.reason || '—'}</span></Td>
                  <Td><Badge variant={b.active ? 'destructive' : 'muted'}>{b.active ? 'Ativo' : 'Inativo'}</Badge></Td>
                  <Td><span className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleString('pt-BR')}</span></Td>
                  <Td>
                    <Button size="sm" variant="outline" disabled={actioning === b.id} onClick={() => toggle(b.id, b.active)}>
                      {actioning === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : b.active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </Td>
                </tr>
              ))}
              {(data?.blocks ?? []).length === 0 && <EmptyRow cols={6} msg="Nenhum bloqueio encontrado" />}
            </tbody>
          </TableWrapper>
          <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function TeamPairsTab() {
  const [days,       setDays]       = useState('30');
  const [minGames,   setMinGames]   = useState('5');
  const [threshold,  setThreshold]  = useState('70');
  const [blocking,   setBlocking]   = useState<string | null>(null);

  const url = `/team-pair-stats?days=${days}&minGames=${minGames}&threshold=${(parseFloat(threshold) / 100).toFixed(2)}`;
  const { data, loading, error, reload } = useData<any>(url, [days, minGames, threshold]);

  const block = async (userAId: string, userBId: string) => {
    const key = `${userAId}:${userBId}`;
    setBlocking(key);
    try {
      await adminApi.post('/pair-blocks', {
        userAId,
        userBId,
        reason: 'Alta taxa de vitória em dupla 2v2',
      });
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao bloquear');
    } finally {
      setBlocking(null);
    }
  };

  const pairs: any[] = data?.pairs ?? [];

  return (
    <div>
      <PageHeader
        title="Duplas suspeitas — 2v2"
        subtitle="Pares que jogam frequentemente no mesmo time com taxa de vitória elevada."
      >
        <Button variant="outline" size="icon" onClick={reload} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </PageHeader>

      {/* Filters */}
      <Card className="mb-6 card-gradient">
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Período (dias)</label>
              <Input
                type="number"
                min={1} max={365}
                value={days}
                onChange={e => setDays(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Mín. partidas juntos</label>
              <Input
                type="number"
                min={1}
                value={minGames}
                onChange={e => setMinGames(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Taxa mínima (%)</label>
              <Input
                type="number"
                min={1} max={100}
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span><span className="font-semibold text-foreground">Taxa vitória:</span> win rate jogando no mesmo time</span>
        <span><span className="font-semibold text-foreground">Solo A/B:</span> % das partidas 2v2 jogadas SEM este parceiro</span>
        <span><span className="font-semibold text-foreground">Horários:</span> % das horas do dia (0-23) em que jogaram juntos</span>
        <span><span className="font-semibold text-foreground">Cooldown:</span> partidas restantes no bloqueio de time</span>
      </div>

      {error ? (
        <ErrorState msg={error} onRetry={reload} />
      ) : loading ? (
        <Card><CardContent className="p-0"><TableSkeleton cols={9} /></CardContent></Card>
      ) : (
        <>
          <TableWrapper>
            <thead>
              <tr>
                {['Jogador A', 'Jogador B', 'Juntos', 'Taxa vitória', 'Solo A', 'Solo B', 'Horários', 'Cooldown', ''].map(h => (
                  <Th key={h}>{h}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pairs.map((p: any) => {
                const blockKey = `${p.userA.id}:${p.userB.id}`;
                const wr = (p.winRate * 100).toFixed(0);
                const wrHigh = p.winRate >= (parseFloat(threshold) / 100);
                return (
                  <tr key={blockKey} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                    {/* Player A */}
                    <Td>
                      <p className="font-medium text-foreground text-xs">{p.userA.name || '?'}</p>
                      <p className="font-mono text-xs text-muted-foreground">{p.userA.phone || p.userA.id.slice(0, 8)}</p>
                    </Td>
                    {/* Player B */}
                    <Td>
                      <p className="font-medium text-foreground text-xs">{p.userB.name || '?'}</p>
                      <p className="font-mono text-xs text-muted-foreground">{p.userB.phone || p.userB.id.slice(0, 8)}</p>
                    </Td>
                    {/* Games together */}
                    <Td>
                      <span className="tabular-nums text-xs">{p.gamesTogether} partidas</span>
                      <p className="text-xs text-muted-foreground">{p.winsTogether}V</p>
                    </Td>
                    {/* Win rate */}
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <span className={cn('text-sm font-semibold tabular-nums', wrHigh ? 'text-destructive' : 'text-foreground')}>
                          {wr}%
                        </span>
                        {wrHigh && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0">ALERTA</Badge>
                        )}
                      </div>
                    </Td>
                    {/* Solo ratios */}
                    <Td>
                      <span className={cn('tabular-nums text-xs', p.userASoloRatio < 30 ? 'text-yellow-400' : 'text-muted-foreground')}>
                        {p.userASoloRatio}%
                      </span>
                      <p className="text-[10px] text-muted-foreground">{p.userATotalGames} totais</p>
                    </Td>
                    <Td>
                      <span className={cn('tabular-nums text-xs', p.userBSoloRatio < 30 ? 'text-yellow-400' : 'text-muted-foreground')}>
                        {p.userBSoloRatio}%
                      </span>
                      <p className="text-[10px] text-muted-foreground">{p.userBTotalGames} totais</p>
                    </Td>
                    {/* Hour overlap */}
                    <Td>
                      <span className={cn('tabular-nums text-xs', p.hourOverlapPct >= 50 ? 'text-yellow-400' : 'text-muted-foreground')}>
                        {p.hourOverlapPct}%
                      </span>
                      <p className="text-[10px] text-muted-foreground">das horas</p>
                    </Td>
                    {/* Cooldown */}
                    <Td>
                      {p.cooldownRemaining > 0 ? (
                        <Badge variant="secondary" className="text-[10px] whitespace-nowrap">
                          -{p.cooldownRemaining} partidas
                        </Badge>
                      ) : p.consecutiveSameTeam > 0 ? (
                        <span className="text-xs text-muted-foreground">{p.consecutiveSameTeam}/3 seguidas</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(p.lastPlayedAt).toLocaleDateString('pt-BR')}
                      </p>
                    </Td>
                    {/* Block action */}
                    <Td>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={blocking === blockKey}
                        onClick={() => block(p.userA.id, p.userB.id)}
                      >
                        {blocking === blockKey
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <><Ban className="w-3 h-3 mr-1" />Bloquear</>
                        }
                      </Button>
                    </Td>
                  </tr>
                );
              })}
              {pairs.length === 0 && (
                <EmptyRow cols={9} msg="Nenhuma dupla suspeita encontrada com os filtros atuais" />
              )}
            </tbody>
          </TableWrapper>

          {pairs.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              {pairs.length} dupla{pairs.length !== 1 ? 's' : ''} encontrada{pairs.length !== 1 ? 's' : ''} ·
              {' '}Solo baixo (&lt;30%) e horários altos (≥50%) são sinais de conluio.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function BonusTab() {
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({ code: '', bonusAmount: '', minDepositAmount: '', rolloverTimes: '0', maxPlayers: '' }));

  const { data, loading, error, reload } = useData<any>(`/coupons?page=${page}`, [page]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await adminApi.post('/coupons', {
        code: form.code,
        bonusAmount: Number(form.bonusAmount),
        minDepositAmount: form.minDepositAmount === '' ? 0 : Number(form.minDepositAmount),
        rolloverTimes: parseInt(form.rolloverTimes || '0', 10),
        maxPlayers: form.maxPlayers ? parseInt(form.maxPlayers, 10) : null,
      });
      setForm({ code: '', bonusAmount: '', minDepositAmount: '', rolloverTimes: '0', maxPlayers: '' });
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao criar cupom');
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (id: string, is_active: boolean) => {
    setActioning(id);
    try {
      await adminApi.patch(`/coupons/${id}`, { is_active: !is_active });
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro');
    } finally {
      setActioning(null);
    }
  };

  return (
    <div>
      <PageHeader title="Bônus e cupons">
        <Button variant="outline" size="icon" onClick={reload} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </PageHeader>

      <Card className="mb-6 card-gradient">
        <CardHeader className="pb-0">
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Criar cupom</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={create} className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="EX: BEMVINDO50" required />
            </div>
            <div className="space-y-1.5">
              <Label>Valor do bônus (R$)</Label>
              <Input value={form.bonusAmount} onChange={e => setForm(p => ({ ...p, bonusAmount: e.target.value }))} inputMode="decimal" required />
            </div>
            <div className="space-y-1.5">
              <Label>Depósito mínimo (R$)</Label>
              <Input value={form.minDepositAmount} onChange={e => setForm(p => ({ ...p, minDepositAmount: e.target.value }))} inputMode="decimal" placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Limite de jogadores</Label>
              <Input value={form.maxPlayers} onChange={e => setForm(p => ({ ...p, maxPlayers: e.target.value }))} inputMode="numeric" placeholder="Sem limite" />
            </div>
            <div className="space-y-1.5">
              <Label>Rollover (x)</Label>
              <Input value={form.rolloverTimes} onChange={e => setForm(p => ({ ...p, rolloverTimes: e.target.value }))} inputMode="numeric" required />
            </div>
            <div className="col-span-2 md:col-span-4">
              <Button type="submit" disabled={creating}>
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Criar cupom'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error ? <ErrorState msg={error} onRetry={reload} /> : loading ? (
        <Card><CardContent className="p-0"><TableSkeleton cols={7} /></CardContent></Card>
      ) : (
        <>
          <TableWrapper>
            <thead>
              <tr>{['Código', 'Min. dep.', 'Bônus', 'Rollover', 'Usos', 'Limite', 'Status', ''].map(h => <Th key={h}>{h}</Th>)}</tr>
            </thead>
            <tbody>
              {(data?.coupons ?? []).map((c: any) => (
                <tr key={c.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                  <Td><span className="font-mono text-xs text-foreground">{c.code}</span></Td>
                  <Td><span className="tabular-nums text-xs text-muted-foreground">{formatMoney(Number(c.min_deposit_amount ?? 0))}</span></Td>
                  <Td><span className="tabular-nums text-xs text-muted-foreground">{formatMoney(Number(c.bonus_amount ?? 0))}</span></Td>
                  <Td><span className="tabular-nums text-xs text-muted-foreground">{c.rollover_times}x</span></Td>
                  <Td><span className="tabular-nums text-xs">{c._count?.redemptions ?? 0}</span></Td>
                  <Td><span className="tabular-nums text-xs text-muted-foreground">{c.max_players ?? '—'}</span></Td>
                  <Td><Badge variant={c.is_active ? 'default' : 'muted'}>{c.is_active ? 'Ativo' : 'Inativo'}</Badge></Td>
                  <Td>
                    <Button size="sm" variant="outline" disabled={actioning === c.id} onClick={() => toggle(c.id, c.is_active)}>
                      {actioning === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : c.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </Td>
                </tr>
              ))}
              {(data?.coupons ?? []).length === 0 && <EmptyRow cols={8} msg="Nenhum cupom encontrado" />}
            </tbody>
          </TableWrapper>
          <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
        </>
      )}
    </div>
  );
}

// ─── Config ───────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  ARENA_1V1:        'Arena 1v1',
  CUP_1V1:          'Copa 1v1',
  TOURNAMENT_2V2:   'Torneio 2v2',
  RECREATIONAL_2V2: 'Recreativo 2v2',
};

// ─── Game Rooms Tab ───────────────────────────────────────────────────────────

function GameRoomsTab() {
  const { data, loading, error, reload } = useData<{ rooms: any[] }>('/game-rooms');
  const [creating, setCreating]   = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [form, setForm] = useState({ mode: 'ARENA_1V1', betAmount: '', label: '' });

  const rooms: any[] = data?.rooms ?? [];

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await adminApi.post('/game-rooms', {
        mode:      form.mode,
        betAmount: parseFloat(form.betAmount),
        label:     form.label.trim() || undefined,
      });
      setForm(p => ({ ...p, betAmount: '', label: '' }));
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao criar sala');
    } finally {
      setCreating(false);
    }
  };

  const toggleLock = async (id: string, locked: boolean) => {
    setActioning(id);
    try {
      await adminApi.patch(`/game-rooms/${id}`, { locked: !locked });
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro');
    } finally {
      setActioning(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Remover esta sala?')) return;
    setActioning(id);
    try {
      await adminApi.delete(`/game-rooms/${id}`);
      reload();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao remover sala');
    } finally {
      setActioning(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Salas de jogo"
        subtitle="Defina os valores de aposta disponíveis por modo. Travar uma sala impede novas partidas naquele slot."
      >
        <Button variant="outline" size="icon" onClick={reload} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </PageHeader>

      {/* Create form */}
      <Card className="mb-6 card-gradient">
        <CardHeader className="pb-0">
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nova sala</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={create} className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <Label>Modo</Label>
              <Select value={form.mode} onValueChange={v => setForm(p => ({ ...p, mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MODE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor da aposta (R$)</Label>
              <Input
                value={form.betAmount}
                onChange={e => setForm(p => ({ ...p, betAmount: e.target.value }))}
                inputMode="decimal"
                placeholder="Ex: 10.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rótulo (opcional)</Label>
              <Input
                value={form.label}
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                placeholder="Ex: Sala VIP"
              />
            </div>
            <div>
              <Button type="submit" disabled={creating}>
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Criar sala'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <ErrorState msg={error} onRetry={reload} />
      ) : loading ? (
        <Card><CardContent className="p-0"><TableSkeleton cols={5} /></CardContent></Card>
      ) : (
        <>
          <TableWrapper>
            <thead>
              <tr>{['Modo', 'Aposta', 'Rótulo', 'Status', ''].map(h => <Th key={h}>{h}</Th>)}</tr>
            </thead>
            <tbody>
              {rooms.map((r: any) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
                  <Td><span className="text-xs">{MODE_LABELS[r.mode] ?? r.mode}</span></Td>
                  <Td>
                    <span className="font-semibold tabular-nums text-sm text-foreground">
                      {formatMoney(r.bet_amount)}
                    </span>
                  </Td>
                  <Td><span className="text-xs text-muted-foreground">{r.label || '—'}</span></Td>
                  <Td>
                    {r.locked
                      ? <Badge variant="destructive" className="gap-1"><Lock className="w-2.5 h-2.5" />Travada</Badge>
                      : <Badge variant="secondary"   className="gap-1"><Unlock className="w-2.5 h-2.5" />Aberta</Badge>
                    }
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={r.locked ? 'outline' : 'destructive'}
                        disabled={actioning === r.id}
                        onClick={() => toggleLock(r.id, r.locked)}
                      >
                        {actioning === r.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : r.locked
                            ? <><Unlock className="w-3 h-3 mr-1" />Abrir</>
                            : <><Lock   className="w-3 h-3 mr-1" />Travar</>
                        }
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={actioning === r.id}
                        onClick={() => remove(r.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
              {rooms.length === 0 && <EmptyRow cols={5} msg="Nenhuma sala configurada. Crie salas para controlar quais apostas ficam disponíveis." />}
            </tbody>
          </TableWrapper>

          {rooms.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              Salas travadas bloqueiam novas partidas naquele modo + valor mas não afetam partidas já em andamento.
            </p>
          )}
        </>
      )}
    </div>
  );
}

const CONFIG_META = [
  { key: 'houseEdgePercent',        label: 'House Edge',               description: 'Percentual da casa em cada aposta.',                       unit: '%',  min: 0,  max: 50,  step: 0.5  },
  { key: 'botInjectWaitSeconds',    label: 'Espera para bot',          description: 'Segundos sem par antes de injetar bot adversário.',        unit: 's',  min: 5,  max: 300, step: 5    },
  { key: 'turnTimeoutSeconds',      label: 'Timeout por jogada',       description: 'Tempo máximo por jogada antes de pular o turno.',          unit: 's',  min: 5,  max: 120, step: 5    },
  { key: 'disconnectGraceSeconds',  label: 'Graça de desconexão',      description: 'Janela de reconexão antes de considerar abandono.',        unit: 's',  min: 5,  max: 120, step: 5    },
];

function ConfigTab() {
  const { data, loading, error, reload } = useData<Record<string, number>>('/config');
  const [draft, setDraft]   = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const prevRef = React.useRef<Record<string, number> | null>(null);

  React.useEffect(() => {
    if (data && data !== prevRef.current) {
      prevRef.current = data;
      const init: Record<string, string> = {};
      for (const { key } of CONFIG_META) init[key] = String((data as any)[key] ?? '');
      setDraft(init);
    }
  }, [data]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setSaved(false);
    try {
      const payload: Record<string, number> = {};
      for (const [k, v] of Object.entries(draft)) payload[k] = parseFloat(v);
      await adminApi.patch('/config', payload);
      setSaved(true); reload();
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) { alert(err.response?.data?.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader title="Configurações do jogo" subtitle="Alterações entram em vigor em até 60 segundos.">
        <Button variant="outline" size="icon" onClick={reload} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </PageHeader>

      {error ? <ErrorState msg={error} onRetry={reload} /> : loading ? (
        <Card><CardContent className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</CardContent></Card>
      ) : (
        <form onSubmit={handleSave}>
          <Card className="card-gradient divide-y divide-border/60">
            {CONFIG_META.map(({ key, label, description, unit, min, max, step }) => (
              <div key={key} className="flex items-center gap-6 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative">
                    <input
                      type="number"
                      value={draft[key] ?? ''}
                      onChange={e => setDraft(p => ({ ...p, [key]: e.target.value }))}
                      min={min} max={max} step={step}
                      required
                      className={cn(
                        'w-28 h-9 rounded-md border border-border bg-muted/60',
                        'px-3 py-1 text-sm text-foreground text-right tabular-nums',
                        'focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50',
                        'transition-colors',
                        '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                      )}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-5 text-left shrink-0">{unit}</span>
                </div>
              </div>
            ))}
          </Card>

          <div className="mt-5 flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Salvando...</>
                : 'Salvar configurações'
              }
            </Button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-primary">
                <CheckCircle2 className="w-4 h-4" />Salvo com sucesso
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
