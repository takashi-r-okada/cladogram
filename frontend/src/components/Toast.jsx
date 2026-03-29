import { useEffect, useState } from 'react';

export default function Toast({ message, onHide }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onHide, 2500);
    return () => clearTimeout(t);
  }, [message, onHide]);

  if (!message) return null;

  return (
    <div className="fixed bottom-8 left-8 z-50 bg-zinc-800 text-white text-sm font-mincho tracking-widest px-5 py-3 shadow-lg animate-fade-in">
      {message}
    </div>
  );
}
