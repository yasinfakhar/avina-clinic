import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/vazirmatn';
import '../app/globals.css';
import Page from '../app/page';

createRoot(document.getElementById('root')!).render(<Page />);
