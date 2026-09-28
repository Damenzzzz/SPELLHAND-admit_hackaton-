import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useSave } from './store/saveStore';
import { setPalmSign } from './vision/features';
import './styles.css';

setPalmSign(useSave.getState().palmSign);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
