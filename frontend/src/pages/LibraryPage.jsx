import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { fmt } from '../i18n/translations';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function LibraryPage() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const [zukans, setZukans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [genStatus, setGenStatus] = useState(null); // { message, isError }
  const [generating, setGenerating] = useState(false);
  const pollTimerRef = useRef(null);

  useEffect(() => {
    fetchLibrary();
  }, []);

  async function fetchLibrary() {
    try {
      const res = await fetch('/api/library');
      const data = await res.json();
      setZukans(data.zukans || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const res = await fetch('/api/zukan/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zukan_name: newName.trim() }),
    });
    const data = await res.json();
    if (data.status === 'ok') {
      navigate(`/editor/${encodeURIComponent(newName.trim())}`);
    } else {
      alert(t('err_msg'));
    }
  }

  async function handleRename(name) {
    const newZukanName = prompt(fmt(t('prompt_rename'), name));
    if (!newZukanName) return;
    const res = await fetch(`/api/zukan/${encodeURIComponent(name)}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_name: newZukanName }),
    });
    if ((await res.json()).status === 'success') fetchLibrary();
    else alert(t('err_msg'));
  }

  async function handleDuplicate(name) {
    const newZukanName = prompt(fmt(t('prompt_dup'), name));
    if (!newZukanName) return;
    const res = await fetch(`/api/zukan/${encodeURIComponent(name)}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_name: newZukanName }),
    });
    if ((await res.json()).status === 'success') fetchLibrary();
    else alert(t('err_msg'));
  }

  async function handleDelete(name) {
    if (!confirm(fmt(t('confirm_del'), name))) return;
    const res = await fetch(`/api/zukan/${encodeURIComponent(name)}/delete`, {
      method: 'POST',
    });
    if ((await res.json()).status === 'success') fetchLibrary();
    else alert(t('err_msg'));
  }

  async function handleAddEditor(name) {
    const editorName = prompt(fmt(t('prompt_editor'), name));
    if (!editorName) return;
    const res = await fetch(`/api/zukan/${encodeURIComponent(name)}/add_editor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: editorName }),
    });
    if ((await res.json()).status !== 'success') alert(t('err_msg'));
  }

  function getGenErrorMsg(code) {
    const map = {
      login_required: 'err_login_required',
      already_exists: 'err_already_exists',
      missing_api_key: 'err_missing_api_key',
      job_not_found: 'err_job_not_found',
      forbidden: 'err_forbidden',
      generation_failed: 'err_generation_failed',
    };
    return t(map[code] || 'err_msg');
  }

  function getGenStatusMsg(job) {
    const d = job.detail || {};
    if (job.status === 'error') return getGenErrorMsg(d.code || job.code);
    if (job.event === 'queued') return fmt(t('status_queued'), d.target_name || '');
    if (job.event === 'initializing') return t('status_initializing');
    if (job.event === 'building_structure') return t('status_building_structure');
    if (job.event === 'fetching_images') return t('status_fetching_images');
    if (job.event === 'processing_node') return fmt(t('status_processing_node'), d.name_ja || d.name_sci || '...');
    if (job.event === 'saving_files') return t('status_saving_files');
    if (job.event === 'completed') return t('status_completed');
    return t('status_unknown');
  }

  async function pollJob(jobId) {
    clearTimeout(pollTimerRef.current);
    try {
      const res = await fetch(`/api/generate_sample/${jobId}`);
      const job = await res.json();
      const msg = getGenStatusMsg(job);
      setGenStatus({ message: msg, isError: job.status === 'error' });

      if (job.status === 'success') {
        setGenerating(false);
        setTimeout(() => navigate(`/editor/${encodeURIComponent(job.detail?.target_name || newName)}`), 900);
        fetchLibrary();
        return;
      }
      if (job.status === 'error') {
        setGenerating(false);
        return;
      }
      pollTimerRef.current = setTimeout(() => pollJob(jobId), 1500);
    } catch {
      setGenerating(false);
      setGenStatus({ message: t('err_msg'), isError: true });
    }
  }

  async function handleGenerate(e) {
    e.preventDefault();
    const target = newName.trim();
    if (!target) { alert(t('target_required')); return; }
    if (!confirm(fmt(t('confirm_generate'), target))) return;

    setGenerating(true);
    setGenStatus({ message: t('status_initializing'), isError: false });

    try {
      const res = await fetch('/api/generate_sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_name: target }),
      });
      const result = await res.json();
      if (result.status !== 'queued') {
        setGenerating(false);
        setGenStatus({ message: getGenErrorMsg(result.code), isError: true });
        return;
      }
      pollJob(result.job_id);
    } catch {
      setGenerating(false);
      setGenStatus({ message: t('err_msg'), isError: true });
    }
  }

  return (
    <div className="min-h-screen bg-paper py-16 px-4">
      <div className="max-w-2xl mx-auto">

        {/* ヘッダー */}
        <header className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <h1 className="font-mincho text-3xl font-light tracking-widest text-zinc-800">
              {t('title')}
            </h1>
            <LanguageSwitcher />
          </div>
          <div className="border-b-2 border-zinc-800 mb-4" />
          <p className="text-xs tracking-[0.3em] text-zinc-400 uppercase">{t('subtitle')}</p>
        </header>

        {/* ユーザーナビ */}
        <div className="flex items-center justify-end gap-3 mb-8 text-sm font-mincho">
          {user ? (
            <>
              <span className="text-zinc-500">{t('logged_in_as')}</span>
              <strong className="text-zinc-800">{user}</strong>
              <button
                onClick={logout}
                className="border border-zinc-300 text-zinc-500 px-3 py-1 rounded-full text-xs hover:bg-zinc-800 hover:text-white hover:border-zinc-800 transition-all"
              >{t('btn_logout')}</button>
            </>
          ) : (
            <>
              <span className="text-zinc-400">{t('guest_msg')}</span>
              <button
                onClick={() => navigate('/login')}
                className="border border-zinc-600 text-zinc-600 px-3 py-1 rounded-full text-xs hover:bg-zinc-800 hover:text-white hover:border-zinc-800 transition-all"
              >{t('btn_login')}</button>
            </>
          )}
        </div>

        {/* 収蔵目録 */}
        <section className="bg-white border border-zinc-200 shadow-sm mb-8">
          <div className="px-6 py-4 border-b border-zinc-100">
            <h2 className="font-mincho text-lg font-light tracking-widest text-zinc-700">
              {t('list_title')}
            </h2>
          </div>

          {loading ? (
            <div className="px-6 py-8 text-center text-zinc-400 text-sm">&hellip;</div>
          ) : zukans.length === 0 ? (
            <div className="px-6 py-8 text-center text-zinc-400 text-sm font-mincho">{t('no_items')}</div>
          ) : (
            <ul className="divide-y divide-dashed divide-zinc-100">
              {zukans.map(z => (
                <li key={z.name} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-zinc-50 transition-colors group">
                  <button
                    onClick={() => navigate(`/editor/${encodeURIComponent(z.name)}`)}
                    className="flex items-center gap-2 text-left flex-grow min-w-0"
                  >
                    <span className="text-zinc-300 text-sm">✤</span>
                    <span className="font-mincho text-base text-zinc-800 group-hover:text-zinc-600 transition-colors truncate">
                      {z.name}
                    </span>
                    {z.is_owner && (
                      <span className="shrink-0 text-xs border border-violet-500 text-violet-600 px-2 py-0.5 rounded">
                        {t('role_owner')}
                      </span>
                    )}
                    {!z.is_owner && z.can_edit && (
                      <span className="shrink-0 text-xs border border-zinc-300 text-zinc-500 px-2 py-0.5 rounded">
                        {t('role_editor')}
                      </span>
                    )}
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    {user && (
                      <button onClick={() => handleDuplicate(z.name)} className="btn-ghost-sm">{t('btn_duplicate')}</button>
                    )}
                    {z.can_edit && (
                      <button onClick={() => handleAddEditor(z.name)} className="btn-ghost-sm">{t('btn_add_editor')}</button>
                    )}
                    {z.is_owner && (
                      <>
                        <button onClick={() => handleRename(z.name)} className="btn-ghost-sm">{t('btn_rename')}</button>
                        <button onClick={() => handleDelete(z.name)} className="btn-ghost-sm border-rose-400 text-rose-500 hover:bg-rose-600 hover:border-rose-600">{t('btn_delete')}</button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 新規編纂フォーム */}
        {user ? (
          <section className="bg-white border border-zinc-200 shadow-sm px-6 py-6">
            <h2 className="font-mincho text-lg font-light tracking-widest text-zinc-700 mb-5 pb-3 border-b border-zinc-100">
              {t('create_title')}
            </h2>
            <div className="flex gap-2 items-stretch mb-3">
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder={t('placeholder_name')}
                className="input-field flex-grow"
                onKeyDown={e => e.key === 'Enter' && handleCreate(e)}
              />
              <button onClick={handleCreate} className="btn-ghost px-4 shrink-0">
                {t('btn_create')}
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="btn-ghost px-4 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('btn_generate')}
              </button>
            </div>

            {genStatus && (
              <div className={`
                text-sm font-mincho px-4 py-3 border
                ${genStatus.isError
                  ? 'border-rose-300 bg-rose-50 text-rose-700'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                }
              `}>
                {genStatus.message}
              </div>
            )}
          </section>
        ) : (
          <p className="text-center text-zinc-400 text-sm font-mincho mt-6 pt-4 border-t border-zinc-200">
            {t('login_required')}
          </p>
        )}
      </div>
    </div>
  );
}
