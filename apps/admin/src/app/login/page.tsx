'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle, Lock } from 'lucide-react';
import { adminApi } from '../../lib/api';
const logo = { src: '/logo.png' };
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent } from '../../components/ui/card';

export default function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await adminApi.post('/login', { username, password });
      localStorage.setItem('admin_token', data.token);
      router.replace('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[360px] space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={logo.src} alt="DominoClub" className="h-12 w-auto" />
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">Admin Dashboard</p>
            <p className="text-xs text-muted-foreground mt-0.5">Acesso restrito</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-5">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Usuário</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />Entrando...</>
                ) : (
                  <><Lock className="w-3.5 h-3.5" />Entrar</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
