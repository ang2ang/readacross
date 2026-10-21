import { ReaderLayout } from './components/reader/ReaderLayout';
import { useEffect } from 'react';
import { useI18n } from './i18n/useI18n';

function App() {
  const { language } = useI18n();
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return <ReaderLayout />;
}

export default App;
