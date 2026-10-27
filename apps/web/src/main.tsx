// Self-hosted, not Google Fonts: the same files on every machine, so the visual tests'
// screenshots match (ADR-0037).
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import { DevMarker } from './components/ui/DevMarker';
import './index.css';
import { queryClient } from './lib/queryClient';
import { useTheme } from './lib/theme';

/** Nothing stored → Sonner's own 'system', which follows the OS live as index.css
 * does — otherwise toasts stay light on a dark shell. */
function ThemedToaster() {
  const { stored } = useTheme();
  return <Toaster position="bottom-right" theme={stored ?? 'system'} />;
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
      <DevMarker />
    </QueryClientProvider>
  </StrictMode>,
);
