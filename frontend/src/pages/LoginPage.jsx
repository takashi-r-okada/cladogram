import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function LoginPage({ mode = 'login' }) {
  const { login, register } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const isLogin = mode === 'login';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (isLogin) {
      const result = await login(username, password);
      if (result.ok) {
        navigate('/');
      } else {
        setError(t('err_login_invalid'));
      }
    } else {
      const result = await register(username, password);
      if (result.ok) {
        navigate('/login');
      } else {
        const code = result.code;
        if (code === 'exists') setError(t('err_register_exists'));
        else setError(t('err_register_failed'));
      }
    }
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* 言語切替 */}
        <div className="flex justify-end mb-6">
          <LanguageSwitcher />
        </div>

        <div className="bg-white border border-zinc-200 shadow-sm px-8 py-10">
          {/* タイトル */}
          <div className="text-center mb-8">
            <Link to="/" className="text-xs tracking-widest text-zinc-400 hover:text-zinc-600 transition-colors">
              分岐図鑑書架
            </Link>
            <h1 className="font-mincho text-xl font-light tracking-widest text-zinc-800 mt-3 pb-3 border-b border-zinc-200">
              {isLogin ? t('title_login') : t('title_reg')}
            </h1>
          </div>

          {/* エラー */}
          {error && (
            <div className="mb-5 px-4 py-3 border border-rose-300 bg-rose-50 text-rose-700 text-sm font-mincho">
              {error}
            </div>
          )}

          {/* フォーム */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label-text">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="input-field"
              />
            </div>
            <div>
              <label className="label-text">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                className="input-field"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-zinc-800 text-white font-mincho tracking-widest text-sm hover:bg-zinc-700 transition-colors mt-2"
            >
              {isLogin ? t('btn_signin') : t('btn_signup')}
            </button>
          </form>

          {/* 切替リンク */}
          <div className="text-center mt-6">
            {isLogin ? (
              <Link to="/register" className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors font-mincho">
                {t('link_reg')}
              </Link>
            ) : (
              <Link to="/login" className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors font-mincho">
                {t('link_login')}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
