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
  Loader2, PanelLeftClose, PanelLeftOpen, TrendingUp,
} from 'lucide-react';
import { adminApi } from '../lib/api';
import logo from '../../../mobile/assets/77e79dbf0c599ad464ce3be2691d2da40106953d.png';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Label } from '../components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { DateTimePicker } from '../components/ui/date-time-picker';
import { cn } from '../lib/utils';

type Tab = 'overview' | 'users' | 'games' | 'financial' | 'tournaments' | 'fraud' | 'config';

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
                      <Button
                        size="sm"
                        variant={u.is_banned ? 'ghost' : 'destructive'}
                        disabled={actioning === u.id}
                        onClick={() => setConfirmId(u.id)}
                      >
                        {u.is_banned ? 'Desbanir' : 'Banir'}
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
              {(data?.users ?? []).length === 0 && <EmptyRow cols={10} msg="Nenhum usuário encontrado" />}
            </tbody>
          </TableWrapper>
          <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
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

function GamesTab() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const url = `/games?page=${page}${statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''}`;
  const { data, loading, error, reload } = useData<any>(url, [page, statusFilter]);

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
        <Card><CardContent className="p-0"><TableSkeleton cols={10} /></CardContent></Card>
      ) : (
        <>
          <TableWrapper>
            <thead>
              <tr>{['ID', 'Modo', 'Status', 'Aposta', 'Prêmio', 'Taxa', 'Jogadores', 'Vencedor', 'Criada em', 'Duração'].map(h => <Th key={h}>{h}</Th>)}</tr>
            </thead>
            <tbody>
              {(data?.games ?? []).map((g: any) => (
                <tr key={g.id} className="border-b border-border/40 hover:bg-accent/20 transition-colors">
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
              ))}
              {(data?.games ?? []).length === 0 && <EmptyRow cols={10} msg="Nenhuma partida encontrada" />}
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
                      {(t.status === 'OPEN' || t.status === 'FULL') && (
                        <Button size="sm" variant="outline" onClick={() => start(t.id)}>
                          <PlayCircle className="w-3 h-3" />Iniciar
                        </Button>
                      )}
                      {t.status !== 'FINISHED' && t.status !== 'CANCELLED' && (
                        <Button size="sm" variant="destructive" onClick={() => cancel(t.id)}>Cancelar</Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
              {(data?.tournaments ?? []).length === 0 && <EmptyRow cols={9} msg="Nenhum torneio encontrado" />}
            </tbody>
          </TableWrapper>
          <Pagination page={page} pages={data?.pages ?? 1} onChange={setPage} />
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

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIG_META = [
  { key: 'houseEdgePercent',        label: 'House Edge',               description: 'Percentual da casa em cada aposta.',                       unit: '%',  min: 0,  max: 50,  step: 0.5  },
  { key: 'matchmakingBetTolerance', label: 'Tolerância de aposta',     description: 'Diferença máxima entre apostas (0.10 = 10%).',             unit: '',   min: 0,  max: 1,   step: 0.01 },
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
