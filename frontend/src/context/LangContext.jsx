import { createContext, useContext, useState, useEffect } from 'react';
import { translations } from '../i18n/translations';

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem('cladogram_lang') || 'ja');

  const setLang = (l) => {
    setLangState(l);
    localStorage.setItem('cladogram_lang', l);
  };

  const t = (key) => translations[lang]?.[key] ?? translations['ja']?.[key] ?? key;

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
