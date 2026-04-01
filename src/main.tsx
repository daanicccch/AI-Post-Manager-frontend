import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { AppLocaleProvider } from './lib/appLocale';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppLocaleProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppLocaleProvider>
  </React.StrictMode>
);
