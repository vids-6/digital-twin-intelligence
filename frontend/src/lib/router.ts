import { useEffect, useState } from 'react';

export interface RouteDef {
  path: string; // pattern, e.g. /machines/:id
  nav: string; // short nav label
  title: string;
  match: string; // first path segment used to highlight the nav item
}

export const ROUTES: RouteDef[] = [
  { path: '/', nav: 'Command', title: 'Command', match: '' },
  { path: '/floor', nav: 'Floor', title: 'Floor', match: 'floor' },
  { path: '/dependencies', nav: 'Graph', title: 'Dependencies', match: 'dependencies' },
  { path: '/machines', nav: 'Machines', title: 'Machines', match: 'machines' },
  { path: '/investigate', nav: 'Investigate', title: 'Investigator', match: 'investigate' },
  { path: '/library', nav: 'Library', title: 'Library', match: 'library' },
  { path: '/evaluation', nav: 'Evaluation', title: 'Evaluation', match: 'evaluation' },
  { path: '/system', nav: 'System', title: 'System', match: 'system' },
];

export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

function read(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [p, q = ''] = raw.split('?');
  const path = '/' + p.replace(/^\/+|\/+$/g, '');
  return { path, segments: path.split('/').filter(Boolean), query: new URLSearchParams(q) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(to: string) {
  const target = '#' + (to.startsWith('/') ? to : '/' + to);
  if (window.location.hash === target) return;
  window.location.hash = target;
}

export function replaceRoute(to: string) {
  window.location.replace('#' + (to.startsWith('/') ? to : '/' + to));
}

export const routeIndex = (segments: string[]) => {
  const first = segments[0] ?? '';
  const i = ROUTES.findIndex((r) => r.match === first);
  return i < 0 ? 0 : i;
};
