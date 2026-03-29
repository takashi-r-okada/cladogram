import { Routes, Route } from 'react-router-dom';
import LibraryPage from './pages/LibraryPage';
import LoginPage from './pages/LoginPage';
import EditorPage from './pages/EditorPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LibraryPage />} />
      <Route path="/login" element={<LoginPage mode="login" />} />
      <Route path="/register" element={<LoginPage mode="register" />} />
      <Route path="/editor/:zukanName" element={<EditorPage />} />
    </Routes>
  );
}
