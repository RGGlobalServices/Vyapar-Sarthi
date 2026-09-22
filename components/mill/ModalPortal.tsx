'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders a modal on <body>, outside the page layout. The app shell puts the sidebar and <main> in their own stacking contexts,
 * so a `fixed inset-0` overlay rendered inside a page can end up half hidden behind the sidebar and off-centre. On <body> it
 * covers the whole window and centres properly.
 */
export default function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}
