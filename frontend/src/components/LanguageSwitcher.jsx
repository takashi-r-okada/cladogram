import { useLang } from '../context/LangContext';

export default function LanguageSwitcher({ className = '' }) {
  const { lang, setLang } = useLang();
  return (
    <div className={`flex items-center gap-1 text-xs font-mincho ${className}`}>
      <button
        onClick={() => setLang('en')}
        className={`px-1 transition-colors ${lang === 'en' ? 'text-zinc-800 font-bold underline underline-offset-2' : 'text-zinc-400 hover:text-zinc-600'}`}
      >EN</button>
      <span className="text-zinc-300">|</span>
      <button
        onClick={() => setLang('ja')}
        className={`px-1 transition-colors ${lang === 'ja' ? 'text-zinc-800 font-bold underline underline-offset-2' : 'text-zinc-400 hover:text-zinc-600'}`}
      >JA</button>
    </div>
  );
}
