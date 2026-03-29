'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '../../lib/api';
import background from '../../../../mobile/assets/background.png';

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
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        backgroundImage: `linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.85)), url(${background.src})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-14 bg-[#4ade80] rounded flex flex-col items-center justify-around p-1.5">
            {[0,1,2].map(i => <div key={i} className="w-2 h-2 bg-[#0a1f0a] rounded-full" />)}
          </div>
          <div>
            <p className="text-white font-black text-xl tracking-widest">DOMINO</p>
            <p className="text-[#4ade80] font-black text-xl tracking-widest">CLUB</p>
          </div>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-[var(--bg-card)] backdrop-blur border border-white/10 rounded-2xl p-8 space-y-5 shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
        >
          <div>
            <p className="text-white font-black text-xl mb-1">Admin Dashboard</p>
            <p className="text-green-600 text-sm">Acesso restrito</p>
          </div>

          <div className="space-y-1">
            <label className="text-green-600 text-xs uppercase font-semibold tracking-wide">Usuário</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-green-800 focus:outline-none focus:border-white/20"
              placeholder="admin"
              autoComplete="username"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-green-600 text-xs uppercase font-semibold tracking-wide">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-green-800 focus:outline-none focus:border-white/20"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-900/50 rounded-lg px-4 py-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#4ade80] hover:bg-[#86efac] disabled:opacity-50 text-black font-bold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
