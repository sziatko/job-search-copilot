import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import './index.css';
import { queryClient } from './lib/queryClient';
import { useTheme } from './lib/theme';

/** Sonner takes the same three values the theme module does, so the preference
 * passes straight through — otherwise toasts stay light on a dark shell. */
function ThemedToaster() {
  const { preference } = useTheme();
  return <Toaster position="bottom-right" theme={preference} />;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ThemedToaster />
    </QueryClientProvider>
  </StrictMode>,
);
